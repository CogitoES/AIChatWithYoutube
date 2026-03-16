import express from "express";
import cors from "cors";
import "dotenv/config";
import { chatWithVideo } from "./agent.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/**
 * POST /chat
 * Body: { video_id, prompt, thread_id }
 */
app.post("/chat", async (req, res) => {
    const { video_id, prompt, thread_id } = req.body;

    if (!video_id || !prompt || !thread_id) {
        return res.status(400).json({
            error: "Missing required fields: video_id, prompt, and thread_id are required."
        });
    }

    console.log(`\nRequested Chat: Video[${video_id}], Thread[${thread_id}]`);

    try {
        const result = await chatWithVideo(video_id, prompt, thread_id);
        
        res.json({
            answer: result.answer,
            timestamp: result.timestamp,
            video_id: result.video_id,
            thread_id: result.thread_id,
            server_timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({
            error: "An error occurred while processing your request.",
            details: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`AIChatWithYoutube API listening at http://localhost:${port}`);
});

// Force process to stay alive if something is closing it prematurely
setInterval(() => {}, 1000000);
