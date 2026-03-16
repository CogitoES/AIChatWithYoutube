import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";
import { NeonPostgres } from "@langchain/community/vectorstores/neon";
import { getTranscriptChunks } from "./youtube.js";

//model should be gemini-2.5-flash
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0,
});

//model should be gemini-embedding-2-preview
const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-2-preview",
    apiKey: process.env.GOOGLE_API_KEY,
});

const checkpointer = new MemorySaver();

let vectorStore = null;

const dbConfig = {
    connectionString: process.env.DB_URL,
    tableName: "video_embeddings",
    distanceStrategy: "cosine",
};

// 1. Define custom tools the agent can use

/**
 * Tool for searching the video transcript.
 */
const searchTranscriptTool = tool(
    async ({ query }) => {
        if (!vectorStore) {
            return "Error: No video transcript loaded. Please provide a YouTube URL first.";
        }

        console.log(`Searching transcript for: "${query}"...`);
        try {
            const results = await vectorStore.similaritySearch(query, 3);
            console.log(`Search complete. Found ${results.length} results.`);

            if (results.length === 0) {
                return "No relevant segments found in the video transcript.";
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

        if (!vectorStore || vectorStore.tableName !== videoId) { // Using tableName as a marker for simplicity or a custom flag
            console.log("Initializing Vector Store...");
            vectorStore = await NeonPostgres.initialize(embeddings, {
                ...dbConfig,
                filter: { video_id: videoId },
            });
            console.log("Vector Store Initialized.");
        } else {
            console.log("Reusing existing Vector Store.");
        }

        // Check if documents for this videoId already exist in the vector store
        // This is a placeholder for a more robust check.
        // In a real application, you might query the vector store metadata or a separate database.
        const existingDocs = await vectorStore.similaritySearch("dummy query", 1, { video_id: videoId });

        if (!(existingDocs.length > 0 && existingDocs[0].metadata.video_id === videoId)) {
            console.log(`\nIndexing transcript for video ${videoId} into Neon...`);
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const chunks = await getTranscriptChunks(videoUrl);

            await vectorStore.addDocuments(chunks);
            console.log(`Successfully indexed ${chunks.length} chunks.`);
        }

        const input = {
            messages: [{ role: "user", content: prompt }],
        };

        const config = { configurable: { thread_id: threadId } };

        console.log("Invoking agent...");
        const response = await agent.invoke(input, config);
        console.log("Agent response received.");

        const lastMessage = response.messages[response.messages.length - 1];

        // Extract timestamp from metadata if available in the first retrieval
        // This is a bit tricky as agent.invoke doesn't directly return the raw tool output metadata
        // For now, we'll look for [Timestamp: X] in the content or return a neutral 0 if not found
        const timestampMatch = lastMessage.content.match(/\[Timestamp:\s*(\d+:\d+)\]/);
        let timestampSeconds = 0;
        if (timestampMatch) {
            const parts = timestampMatch[1].split(':');
            timestampSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
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