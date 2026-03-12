import { google } from 'googleapis';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
        console.log(`Loading data from ${filePath}`);
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
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

        // 2. Fetch Transcription
        console.log(`Fetching transcript for ${videoId}...`);
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            video.transcription = transcript;
        } catch (transcriptError) {
            console.warn(`Warning: Could not fetch transcript: ${transcriptError.message}`);
            video.transcription = null; // Or [] if you prefer
        }

        return video;
    } catch (error) {
        console.error('Error fetching YouTube data:', error.message);
        throw error;
    }
}
