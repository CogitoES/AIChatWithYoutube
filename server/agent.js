import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";
import { NeonPostgres } from "@langchain/community/vectorstores/neon";
import { getTranscriptChunks } from "./youtube.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { fetchWikipediaSummary, checkRateLimit } from "./factcheck.js";
import logger from "./logger.js";

// Shared vector store instance (safe — read-only after init)
let vectorStore = null;

// Per-thread video ID registry — avoids race conditions between concurrent requests
const videoIdByThread = new Map();

// Track ongoing indexing tasks to prevent duplicate work
const indexingTasks = new Map();

//NEVER touch model
//model MUST be gemini-3.1-flash-lite-preview
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-flash-lite-preview",
    apiKey: process.env.GOOGLE_API_KEY2,
    temperature: 0,
});

//model MUST be gemini-embedding-2-preview
const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-2-preview",
    apiKey: process.env.GOOGLE_API_KEY2,
});

const checkpointer = new MemorySaver();

const dbConfig = {
    connectionString: process.env.DB_URL,
    tableName: "video_embeddings",
    distanceStrategy: "cosine",
};

/**
 * Tool for searching the video transcript.
 */
const searchTranscriptTool = tool(
    async ({ query }, config) => {
        if (!vectorStore) {
            return "Error: No video transcript loaded. Please provide a YouTube URL first.";
        }

        // Look up the video ID for this specific thread — thread-safe
        const threadId = config.configurable?.thread_id;
        const videoId = videoIdByThread.get(threadId);

        if (!videoId) {
            return "Error: No video context found for this session. Please reload the video.";
        }

        console.log(`Searching transcript for: "${query}" (Video: ${videoId}, Thread: ${threadId})...`);
        try {
            // Filter results by video_id to ensure context accuracy
            const results = await vectorStore.similaritySearch(query, 5, { video_id: videoId });
            console.log(`Search complete. Found ${results.length} results.`);

            if (results.length === 0) {
                return `No relevant segments found in the transcript for video ${currentVideoId}.`;
            }

            return results.map(res =>
                `\n[Timestamp: ${res.metadata.timestamp}] (Offset: ${res.metadata.offset}s)\nContent: ${res.pageContent}`
            ).join("\n---\n");
        } catch (searchError) {
            console.error("Similarity Search Error:", searchError);
            return `Error during search: ${searchError.message}`;
        }
    },
    {
        name: "search_video_transcript",
        description: "Search the loaded YouTube video transcript for relevant segments using natural language. Returns text and timestamps.",
        schema: z.object({
            query: z.string().describe("The user's question or search term related to the video content."),
        }),
    }
);

/**
 * Tool for searching Wikipedia for fact-checking.
 */
const searchWikipediaTool = tool(
    async ({ query }, config) => {
        const threadId = config.configurable?.thread_id || "default";

        console.log(`[FactCheck] Agent requested fact-check for: "${query}" on thread: ${threadId}`);

        if (!checkRateLimit(threadId)) {
            console.log(`[FactCheck] Rate limit exceeded for thread: ${threadId}`);
            return "Error: Fact-check rate limit reached (5 requests per minute). Please wait before trying again.";
        }

        const result = await fetchWikipediaSummary(query);
        if (!result) {
            return "No relevant Wikipedia summary found for this statement. Please try rephrasing or search for a more specific topic.";
        }

        return `🔍 **Fact-Check Result:**\n\n${result.answer}\n\n**Source:** ${result.sourceUrl}`;
    },
    {
        name: "search_wikipedia",
        description: "Search Wikipedia for facts and summaries. Use this ONLY when the user asks to 'Fact-check' a statement or context.",
        schema: z.object({
            query: z.string().describe("The specific claim or topic to fact-check."),
        }),
    }
);

// 2. Initialize the agent (Keeping tools limited as requested)
const agent = createAgent({
    model: llm,
    tools: [searchWikipediaTool],
    checkpointer,
});

/**
 * Ensures the video transcript is indexed in the vector store.
 * Handles deduplication if multiple requests for the same video arrive.
 * @param {string} videoId
 */
export async function ensureVideoIndexed(videoId) {
    // If already indexing this video, wait for the existing task
    if (indexingTasks.has(videoId)) {
        logger.log(`[Indexing] Already indexing ${videoId}, waiting...`);
        return indexingTasks.get(videoId);
    }

    const task = (async () => {
        try {
            logger.time(`ensureVideoIndexed: ${videoId}`);

            if (!vectorStore || vectorStore.tableName !== "video_embeddings") {
                logger.time(`Init Vector Store`);
                vectorStore = await NeonPostgres.initialize(embeddings, dbConfig);
                logger.timeEnd(`Init Vector Store`);
            }

            logger.time(`Neon Probe Check (similaritySearch)`);
            const existingDocs = await vectorStore.similaritySearch("the", 1, { video_id: videoId });
            logger.timeEnd(`Neon Probe Check (similaritySearch)`);

            const isUpToDate = existingDocs.length > 0 &&
                existingDocs[0].metadata.video_id === videoId &&
                existingDocs[0].metadata.format_version === "v2";

            if (!isUpToDate) {
                logger.log(`\nIndexing/Refreshing transcript for video ${videoId} (Precision V2)...`);

                let videoUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;

                logger.time(`Get Transcript Chunks`);
                const rawChunks = await getTranscriptChunks(videoUrl);
                logger.timeEnd(`Get Transcript Chunks`);

                const chunks = rawChunks.filter(c => c.pageContent && c.pageContent.trim().length > 0);

                if (chunks.length === 0) {
                    logger.warn(`[WARNING] No valid text content found for video ${videoId}.`);
                } else {
                    logger.log(`[DEBUG] Final chunks to index: ${chunks.length}`);
                    logger.time(`Neon addDocuments (${chunks.length} chunks)`);
                    await vectorStore.addDocuments(chunks);
                    logger.timeEnd(`Neon addDocuments (${chunks.length} chunks)`);
                    logger.log(`Successfully indexed ${chunks.length} precision chunks.`);
                }
            } else {
                logger.log(`Knowledge found for video ${videoId} (V2). Reusing existing index.`);
            }
        } catch (error) {
            logger.error(`[Indexing Error] ${videoId}:`, error.message);
            throw error;
        } finally {
            logger.timeEnd(`ensureVideoIndexed: ${videoId}`);
            indexingTasks.delete(videoId);
        }
    })();

    indexingTasks.set(videoId, task);
    return task;
}

export async function chatWithVideo(videoId, prompt, threadId) {
    try {
        logger.log(`\n--- Chatting with Video ID: ${videoId}, Thread: ${threadId} ---`);
        // Register videoId for this specific thread
        videoIdByThread.set(threadId, videoId);

        // Ensure video is indexed (waits if background task is still running)
        await ensureVideoIndexed(videoId);

        const config = { configurable: { thread_id: threadId } };
        const state = await agent.getState(config);
        const history = state.values?.messages || [];
        const hasHistory = history.length > 0;

        logger.log(`\nThread ID: ${threadId}`);
        logger.log(`Existing history length: ${history.length}`);

        const inputMessages = [];
        if (!hasHistory) {
            logger.log("No history found. Adding system instruction for new thread.");
            inputMessages.push(new SystemMessage({
                content: `You are a specialized AI analyzer for YouTube videos. 
                - LATEST VIDEO ID: ${videoId}
                - SUMMARIES: If asked for a summary, provide a high-level overview of approximately 100 words. Focus on the main topics and key takeaways.
                - FORMATTING: Use double newlines (\n\n) between every paragraph or list item to ensure they are rendered as individual interactive units.
                - CITATIONS: Always include timestamps using [Timestamp: HH:MM:SS] or [Timestamp: M:SS] in your answers.                
                - TIMESTAMPS: The transcript chunks contain inline markers like [Timestamp: HH:MM:SS, HH:MM:SS, ...]. 
                - CITATIONS: Use the nearest inline [MM:SS] marker to the information you are quoting.
                - SUGGESTIONS: At the absolute end of your response (after the citation), provide exactly 3 suggested follow-up questions that explore the answer you just gave.
                - FORMAT FOR SUGGESTIONS: You MUST append the following exactly at the end of your message:
                  ---SUGGESTIONS---
                  ["Question 1?", "Question 2?", "Question 3?"]
                
                - FACT-CHECKING: If the user input starts with 'Fact-check this:', you MUST use the 'search_wikipedia' tool to verify the claim. 
                - Responses to fact-checks should start with '🔍 **Fact-Check Result:**' and be concise.
                
                - If the search tool returns no results, state that the transcript does not seem to contain specific info about the query.`
            }));
        }

        // --- DIRECT RAG INJECTION (Code Only) ---
        logger.time(`Direct RAG Search (${videoId})`);
        const searchResults = await vectorStore.similaritySearch(prompt, 10, { video_id: videoId });
        logger.timeEnd(`Direct RAG Search (${videoId})`);

        const contextText = searchResults.map(res =>
            `[Timestamp: ${res.metadata.timestamp}] ${res.pageContent}`
        ).join("\n---\n");

        const userContent = `--- TRANSCRIPT CONTEXT ---\n${contextText}\n\n--- USER QUESTION ---\n${prompt}`;
        inputMessages.push(new HumanMessage({ content: userContent }));

        logger.log("Invoking agent...");
        logger.time(`agent.invoke (${videoId})`);
        const response = await agent.invoke({ messages: inputMessages }, config);
        logger.timeEnd(`agent.invoke (${videoId})`);
        logger.log("Agent response received.");

        const outputMessages = response.messages;
        const lastMessage = outputMessages[outputMessages.length - 1];
        let content = lastMessage.content;

        // Parse Suggestions from the SINGLE response
        let suggestions = [];
        const suggestionMarker = "---SUGGESTIONS---";
        if (content.includes(suggestionMarker)) {
            const parts = content.split(suggestionMarker);
            content = parts[0].trim();
            const rawSuggestions = parts[1].trim().replace(/```json|```/g, '').trim();
            try {
                suggestions = JSON.parse(rawSuggestions);
            } catch (e) {
                console.warn("Failed to parse consolidated suggestions:", e.message);
            }
        }

        // Search for the first [Timestamp: ...] tag in the response
        const timestampMatch = content.match(/\[Timestamp:\s*(?:(\d+):)?(\d+):(\d+)\]/i);
        let timestampSeconds = undefined;
        if (timestampMatch) {
            const h = timestampMatch[1] ? parseInt(timestampMatch[1]) : 0;
            const m = parseInt(timestampMatch[2]);
            const s = parseInt(timestampMatch[3]);
            timestampSeconds = h * 3600 + m * 60 + s;
        }

        return {
            answer: content,
            timestamp: timestampSeconds,
            suggestions,
            video_id: videoId,
            thread_id: threadId
        };

    } catch (err) {
        console.error("Chat Error Detail:", err);
        throw err;
    }
}