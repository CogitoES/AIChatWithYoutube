import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { loadVideoData, saveVideoData, getVideoDetails, extractVideoId } from "./youtube.js";

//model should be gemini-2.5-flash
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0,
});

/**
 * Loads video data and splits transcription into chunks.
 * @param {string} urlOrId - The YouTube URL or video ID.
 * @returns {Promise<Array>} - Array of LangChain Document-like objects.
 */
async function getTranscriptChunks(urlOrId) {
    const videoId = extractVideoId(urlOrId);
    if (!videoId) throw new Error("Invalid YouTube ID or URL");

    // 1. Try to load from local storage
    let data = loadVideoData(videoId);

    if (!data) {
        console.log(`Transcript not found in cache for ${videoId}. Fetching...`);
        data = await getVideoDetails(videoId);
        saveVideoData(videoId, data);
    } else {
        console.log(`Loaded transcript from local cache for ${videoId}.`);
    }

    if (!data.transcription || data.transcription.length === 0) {
        throw new Error("No transcription available for this video.");
    }

    // 2. Combine all text fields into a single variable transcript
    const fullTranscript = data.transcription.map(item => item.text).join(" ");

    // 3. Split the text into chunks using LangChain
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(fullTranscript);

    // 4. Add metadata video_id
    return chunks.map(chunk => ({
        pageContent: chunk,
        metadata: { video_id: videoId }
    }));
}

// 1. Define custom tools the agent can use
const weatherTool = tool(
    async ({ location }) => {
        if (location.toLowerCase().includes("san francisco")) {
            return `The weather in ${location} is 60 degrees.`;
        }
        return `The weather in ${location} is 72 degrees.`;
    },
    {
        name: "get_weather",
        description: "Fetch the current weather for a specific location.",
        schema: z.object({
            location: z.string().describe("The city and state, e.g. San Francisco, CA"),
        }),
    }
);

// 2. Initialize the pre-built specific React agent from LangGraph
const agent = createReactAgent({
    llm,
    tools: [weatherTool],
});

async function main() {
    const videoUrl = "https://www.youtube.com/watch?v=y2lkVlB96y4";

    try {
        console.log("Processing YouTube Video...");
        const chunks = await getTranscriptChunks(videoUrl);

        console.log(`\nProcessed ${chunks.length} chunks.`);
        console.log("\nSample Chunk (First one):");
        console.log(JSON.stringify(chunks[0], null, 2));

        // Note: Future steps would involve adding these chunks to a vector store 
        // and querying them via a tool.

    } catch (err) {
        console.error("Failed:", err.message);
    }
}

main();