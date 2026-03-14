import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { loadVideoData, saveVideoData, getVideoDetails, extractVideoId } from "./youtube.js";

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

let vectorStore = null;

/**
 * Loads video data and splits transcription into timestamped chunks.
 * Uses a sliding window approach to preserve context and timestamps.
 * @param {string} urlOrId - The YouTube URL or video ID.
 * @param {number} targetLength - Approximate character length for each chunk.
 * @param {number} overlap - Number of seconds to overlap between chunks.
 * @returns {Promise<Array>} - Array of chunk objects with text and offset.
 */
async function getTranscriptChunks(urlOrId, targetLength = 1000, overlapLines = 2) {
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

    const snippets = data.transcription;
    const chunks = [];

    // 2. Aggregate snippets into chunks
    let currentChunkText = "";
    let currentStartOffset = snippets[0].offset;
    let snippetCount = 0;

    for (let i = 0; i < snippets.length; i++) {
        const snippet = snippets[i];

        if (currentChunkText === "") {
            currentStartOffset = snippet.offset;
        }

        currentChunkText += (currentChunkText ? " " : "") + snippet.text;
        snippetCount++;

        // If chunk is large enough, push it and start next one with overlap
        if (currentChunkText.length >= targetLength || i === snippets.length - 1) {
            chunks.push({
                pageContent: currentChunkText.replace(/\n/g, " "),
                metadata: {
                    video_id: videoId,
                    offset: Math.floor(currentStartOffset),
                    timestamp: formatTime(currentStartOffset)
                }
            });

            // Handle overlap: go back a few snippets if possible
            if (i < snippets.length - 1) {
                const backStep = Math.min(overlapLines, snippetCount - 1);
                i -= backStep;
            }

            currentChunkText = "";
            snippetCount = 0;
        }
    }

    return chunks;
}

/**
 * Formats seconds into MM:SS or HH:MM:SS
 * @param {number} seconds 
 * @returns {string}
 */
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
        h > 0 ? h : null,
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].filter(Boolean).join(':');
}

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

// 2. Initialize the pre-built specific React agent from LangGraph
const agent = createReactAgent({
    llm,
    tools: [searchTranscriptTool],
});

async function main() {
    const videoUrl = "https://www.youtube.com/watch?v=y2lkVlB96y4";

    try {
        console.log("Processing YouTube Video...");
        const chunks = await getTranscriptChunks(videoUrl);

        console.log(`\nProcessed ${chunks.length} chunks. Initializing vector store...`);

        // Initialize MemoryVectorStore with the chunks and Gemini embeddings
        vectorStore = await MemoryVectorStore.fromTexts(
            chunks.map(c => c.pageContent),
            chunks.map(c => c.metadata),
            embeddings
        );

        console.log("Vector store ready. Running agent query...");

        const input = {
            messages: [
                { role: "user", content: "Who was the most powerful pirate in this video and what was her name? Also, what happened at around 8 minutes in the video?" }
            ],
        };

        const result = await agent.invoke(input);
        const lastMessage = result.messages[result.messages.length - 1];

        console.log("\n--- Agent Response ---");
        console.log(lastMessage.content);

    } catch (err) {
        console.error("Failed:", err.message);
    }
}

main();