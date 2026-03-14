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
        const results = await vectorStore.similaritySearch(query, 3);

        if (results.length === 0) {
            return "No relevant segments found in the video transcript.";
        }

        return results.map(res =>
            `\n[Timestamp: ${res.metadata.timestamp}] (Offset: ${res.metadata.offset}s)\nContent: ${res.pageContent}`
        ).join("\n---\n");
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

async function main() {
    const videoUrl = "https://www.youtube.com/watch?v=y2lkVlB96y4";

    try {
        console.log("Processing YouTube Video...");
        const videoId = videoUrl.split("v=")[1]?.split("&")[0];
        
        // Initialize NeonPostgres
        vectorStore = await NeonPostgres.initialize(embeddings, {
            ...dbConfig,
            filter: { video_id: videoId },
        });

        // Check if we need to index
        // We can do a simple similarity search or just try to see if any docs exist with this video_id
        // NeonPostgres doesn't have a direct "count" but we can try to search
        const existingDocs = await vectorStore.similaritySearch("the", 1);
        
        if (existingDocs.length > 0 && existingDocs[0].metadata.video_id === videoId) {
            console.log(`Transcript for video ${videoId} already indexed in Neon. Skipping...`);
        } else {
            console.log(`\nIndexing transcript for video ${videoId} into Neon...`);
            const chunks = await getTranscriptChunks(videoUrl);
            
            await vectorStore.addDocuments(chunks);
            console.log(`Successfully indexed ${chunks.length} chunks.`);
        }

        console.log("Vector store ready. Running agent query...");

        const input = {
            messages: [
                { role: "user", content: "Who was the most powerful pirate in this video and what was her name? Also, what happened at around 8 minutes in the video?" }
            ],
        };

        const config = { configurable: { thread_id: "youtube-chat-1" } };

        console.log("Query 1: Asking about the pirate...");
        const result1 = await agent.invoke(input, config);
        console.log("\n--- Agent Response 1 ---");
        console.log(result1.messages[result1.messages.length - 1].content);

        // Second query to test memory
        const input2 = {
            messages: [
                { role: "user", content: "Wait, I forgot, what was her name again? Just the name." }
            ],
        };

        console.log("\nQuery 2: Testing memory (asking for the name again)...");
        const result2 = await agent.invoke(input2, config);
        console.log("\n--- Agent Response 2 ---");
        console.log(result2.messages[result2.messages.length - 1].content);

    } catch (err) {
        console.error("Failed:", err.message);
    }
}

main();