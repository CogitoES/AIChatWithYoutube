import { google } from 'googleapis';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

// Transcript cache TTL: 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const youtube = google.youtube('v3');
const API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Saves video data to a local JSON file.
 * @param {string} videoId - The YouTube video ID.
 * @param {object} data - The video metadata object.
 */
export function saveVideoData(videoId, data) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const filePath = path.join(DATA_DIR, `${videoId}.json`);
    // Stamp the time so we can expire the cache later
    fs.writeFileSync(filePath, JSON.stringify({ ...data, cached_at: Date.now() }, null, 2));
    console.log(`Data saved to ${filePath}`);
}

/**
 * Loads video data from a local JSON file.
 * @param {string} videoId - The YouTube video ID.
 * @returns {object|null} - The video metadata or null if not found.
 */
export function loadVideoData(videoId) {
    const filePath = path.join(DATA_DIR, `${videoId}.json`);
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(rawData);
        // Expire cache entries older than CACHE_TTL_MS
        if (!data.cached_at || (Date.now() - data.cached_at) > CACHE_TTL_MS) {
            console.log(`Cache expired for ${videoId}. Will re-fetch.`);
            return null;
        }
        console.log(`Loading data from ${filePath}`);
        return data;
    }
    return null;
}

/**
 * Extracts the video ID from a YouTube URL.
 * @param {string} url - The YouTube URL.
 * @returns {string|null} - The video ID or null if not found.
 */
export function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : url; // Return url if it's already an ID
}

import { YoutubeTranscript } from 'youtube-transcript-plus';

/**
 * Fetches only video metadata (snippet and chapters) from YouTube.
 * Skips transcription for speed.
 * @param {string} urlOrId
 * @returns {Promise<object>}
 */
export async function getVideoMetadataOnly(urlOrId) {
    const videoId = extractVideoId(urlOrId);
    if (!videoId) throw new Error('Invalid YouTube URL or Video ID');

    // 1. Try to load from local storage
    const cachedData = loadVideoData(videoId);
    if (cachedData) {
        console.log(`[Metadata] Serving from file cache for ${videoId}`);
        cachedData.chapters = cachedData.chapters || extractChapters(cachedData.snippet?.description);
        return cachedData;
    }

    if (!API_KEY || API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
        throw new Error('YouTube API Key is missing. Please set YOUTUBE_API_KEY in your .env file.');
    }

    console.log(`[Metadata] Fetching from YouTube API for ${videoId}...`);
    console.time(`[Perf] YouTube API: list videos (metadata)`);
    const response = await youtube.videos.list({
        key: API_KEY,
        id: videoId,
        part: 'snippet,contentDetails,statistics,status',
    });
    console.timeEnd(`[Perf] YouTube API: list videos (metadata)`);

    const video = response.data.items[0];
    if (!video) throw new Error('Video not found');

    video.chapters = extractChapters(video.snippet.description);
    // Save metadata-only cache
    saveVideoData(videoId, video);

    return video;
}

/**
 * Fetches video metadata and transcription from YouTube.
 * @param {string} urlOrId - The YouTube URL or video ID.
 * @returns {Promise<object>} - The video metadata with transcription.
 */
export async function getVideoDetails(urlOrId) {
    const videoId = extractVideoId(urlOrId);

    if (!videoId) {
        throw new Error('Invalid YouTube URL or Video ID');
    }

    if (!API_KEY || API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
        throw new Error('YouTube API Key is missing. Please set YOUTUBE_API_KEY in your .env file.');
    }

    try {
        // 1. Fetch Video Metadata
        const response = await youtube.videos.list({
            key: API_KEY,
            id: videoId,
            part: 'snippet,contentDetails,statistics,status',
        });

        const video = response.data.items[0];

        if (!video) {
            throw new Error('Video not found');
        }

    logger.log(`Fetching transcript for ${videoId}...`);
    logger.time(`YoutubeTranscript.fetchTranscript (${videoId})`);
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        video.transcription = transcript;
    } catch (transcriptError) {
        logger.warn(`Could not fetch English transcript for ${videoId}: ${transcriptError.message}`);
        logger.log("Attempting to fetch any available transcript...");
        try {
            const anyTranscript = await YoutubeTranscript.fetchTranscript(videoId);
            video.transcription = anyTranscript;
            logger.log("Fetched non-English or default transcript.");
        } catch (anyError) {
            logger.error(`Final transcript fetch failed: ${anyError.message}`);
            video.transcription = null;
        }
    }
    logger.timeEnd(`YoutubeTranscript.fetchTranscript (${videoId})`);

        // 3. Extract Chapters
        video.chapters = extractChapters(video.snippet.description);

        return video;
    } catch (error) {
        console.error('Error fetching YouTube data:', error.message);
        throw new Error(`Failed to retrieve video data: ${error.message}`);
    }
}/**
 * Formats seconds into MM:SS or HH:MM:SS
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
        h > 0 ? h : null,
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].filter(Boolean).join(':');
}

/**
 * Parses HH:MM:SS or MM:SS into total seconds.
 * @param {string} timeStr
 * @returns {number}
 */
export function parseTimeToSeconds(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return 0;
}

/**
 * Extracts chapters from the video description.
 * @param {string} description
 * @returns {Array} - List of objects { time, seconds, title }
 */
export function extractChapters(description) {
    if (!description) return [];

    const chapters = [];
    const lines = description.split('\n');

    // Improved regex to handle common chapter formats
    // e.g., 00:00 - Intro, [05:23] Topic, 1:23:45 Conclusion
    const timeRegex = /(?:\s|^|\(|\[)(\d{1,2}:(?:\d{2}:)?\d{2})(?:\)|\])?(?:\s*[-–—]\s*|\s+)(.+)/;

    for (const line of lines) {
        const match = line.match(timeRegex);
        if (match) {
            const timeStr = match[1];
            const title = match[2].trim();
            const seconds = parseTimeToSeconds(timeStr);

            // Only add if we haven't seen this timestamp yet
            if (!chapters.find(c => c.seconds === seconds)) {
                chapters.push({ time: timeStr, seconds, title });
            }
        }
    }
    return chapters;
}
/**
 * Loads video data and splits transcription into timestamped chunks.
 * Uses a sliding window approach to preserve context and timestamps.
 * @param {string} urlOrId - The YouTube URL or video ID.
 * @param {number} targetLength - Approximate character length for each chunk.
 * @param {number} overlapLines - Number of snippets to overlap between chunks.
 * @returns {Promise<Array>} - Array of chunk objects with text and offset.
 */
export async function getTranscriptChunks(urlOrId, targetLength = 1500, overlapLines = 1) {
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

        // Add inline timestamp [MM:SS] for every snippet to provide precise context to LLM
        const timeStr = `[${formatTime(snippet.offset)}]`;
        currentChunkText += (currentChunkText ? " " : "") + timeStr + " " + snippet.text;
        snippetCount++;

        // If chunk is large enough, push it and start next one with overlap
        if (currentChunkText.length >= targetLength || i === snippets.length - 1) {
            chunks.push({
                pageContent: currentChunkText.replace(/\n/g, " "),
                metadata: {
                    video_id: videoId,
                    offset: Math.floor(currentStartOffset),
                    timestamp: formatTime(currentStartOffset),
                    format_version: "v2" // Mark as precision format
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

