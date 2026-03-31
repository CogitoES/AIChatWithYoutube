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

const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0,
});

//model should be gemini-embedding-2-preview
const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-2-preview",
    apiKey: process.env.GOOGLE_API_KEY,
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

        // Check if documents for this videoId already exist in the vector store
        const existingDocs = await vectorStore.similaritySearch("the", 1, { video_id: videoId });

        if (!(existingDocs.length > 0 && existingDocs[0].metadata.video_id === videoId)) {
            console.log(`\nIndexing transcript for video ${videoId} into Neon...`);
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const chunks = await getTranscriptChunks(videoUrl);

            await vectorStore.addDocuments(chunks);
            console.log(`Successfully indexed ${chunks.length} chunks.`);
        } else {
            console.log(`Knowledge found for video ${videoId}. Reusing existing index.`);
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
                - CITATIONS: Always include timestamps using [Timestamp: HH:MM:SS] or [Timestamp: M:SS] in your answers.
                - If the search tool returns no results, state that the transcript does not seem to contain specific info about the query.`
            }));
        }

        inputMessages.push(new HumanMessage({ content: prompt }));

        console.log("Invoking agent...");
        const response = await agent.invoke({ messages: inputMessages }, config);
        console.log("Agent response received.");

        const outputMessages = response.messages;
        const lastMessage = outputMessages[outputMessages.length - 1];

        // Search for [Timestamp: HH:MM:SS] or [Timestamp: MM:SS]
        const timestampMatch = lastMessage.content.match(/\[Timestamp:\s*(?:(\d+):)?(\d+):(\d+)\]/);
        let timestampSeconds = undefined;
        if (timestampMatch) {
            const h = timestampMatch[1] ? parseInt(timestampMatch[1]) : 0;
            const m = parseInt(timestampMatch[2]);
            const s = parseInt(timestampMatch[3]);
            timestampSeconds = h * 3600 + m * 60 + s;
        }

        return {
            answer: lastMessage.content,
            timestamp: timestampSeconds,
            video_id: videoId,
            thread_id: threadId
        };

    } catch (err) {
        console.error("Chat Error Detail:", err);
        throw err;
    }
}