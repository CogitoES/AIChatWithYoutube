import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";
import { NeonPostgres } from "@langchain/community/vectorstores/neon";
import { getTranscriptChunks } from "./youtube.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// Global state for tool and vector store
let vectorStore = null;
let currentVideoId = null;

//NEVER touch model
//model MUST be gemini-3-flash-preview
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
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
    async ({ query }) => {
        if (!vectorStore) {
            return "Error: No video transcript loaded. Please provide a YouTube URL first.";
        }

        console.log(`Searching transcript for: "${query}" (Video: ${currentVideoId})...`);
        try {
            // CRITICAL: Filter results by video_id to ensure context accuracy
            const results = await vectorStore.similaritySearch(query, 5, { video_id: currentVideoId });
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

// 2. Initialize the agent using createAgent from langchain/agents
const agent = createAgent({
    model: llm,
    tools: [searchTranscriptTool],
    checkpointer,
});

export async function chatWithVideo(videoId, prompt, threadId) {
    try {
        console.log(`\n--- Chatting with Video ID: ${videoId} ---`);
        currentVideoId = videoId; // Set current video context for tools

        if (!vectorStore || vectorStore.tableName !== "video_embeddings") {
            console.log("Initializing Vector Store...");
            vectorStore = await NeonPostgres.initialize(embeddings, dbConfig);
            console.log("Vector Store Initialized.");
        }

        // Check if documents for this videoId already exist and have the new precision format (v2)
        const existingDocs = await vectorStore.similaritySearch("the", 1, { video_id: videoId });
        const isUpToDate = existingDocs.length > 0 &&
            existingDocs[0].metadata.video_id === videoId &&
            existingDocs[0].metadata.format_version === "v2";

        if (!isUpToDate) {
            console.log(`\nIndexing/Refreshing transcript for video ${videoId} (Precision V2)...`);
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const chunks = await getTranscriptChunks(videoUrl);

            await vectorStore.addDocuments(chunks);
            console.log(`Successfully indexed ${chunks.length} precision chunks.`);
        } else {
            console.log(`Knowledge found for video ${videoId} (V2). Reusing existing index.`);
        }

        const config = { configurable: { thread_id: threadId } };
        const state = await agent.getState(config);
        const history = state.values?.messages || [];
        const hasHistory = history.length > 0;

        console.log(`\nThread ID: ${threadId}`);
        console.log(`Existing history length: ${history.length}`);

        const inputMessages = [];
        if (!hasHistory) {
            console.log("No history found. Adding system instruction for new thread.");
            inputMessages.push(new SystemMessage({
                content: `You are a specialized AI analyzer for YouTube videos. 
                - LATEST VIDEO ID: ${videoId}
                - A searchable transcript is AVAILABLE via the 'search_video_transcript' tool.
                - ALWAYS use the tool before answering questions about the video content.
                - SUMMARIES: If asked for a summary, provide a high-level overview of approximately 100 words. Focus on the main topics and key takeaways.
                - CITATIONS: Always include timestamps using [Timestamp: HH:MM:SS] or [Timestamp: M:SS] in your answers.                
                - TIMESTAMPS: The transcript chunks contain inline markers like [Timestamp: HH:MM:SS, HH:MM:SS, ...]. 
                - CITATIONS: Use the nearest inline [MM:SS] marker to the information you are quoting.
                - SUGGESTIONS: At the absolute end of your response (after the citation), provide exactly 3 suggested follow-up questions that explore the answer you just gave.
                - FORMAT FOR SUGGESTIONS: You MUST append the following exactly at the end of your message:
                  ---SUGGESTIONS---
                  ["Question 1?", "Question 2?", "Question 3?"]
                
                - If the search tool returns no results, state that the transcript does not seem to contain specific info about the query.`
            }));
        }

        inputMessages.push(new HumanMessage({ content: prompt }));

        console.log("Invoking agent...");
        const response = await agent.invoke({ messages: inputMessages }, config);
        console.log("Agent response received.");

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