import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import "dotenv/config";

async function testModels() {
    console.log("Testing LLM: gemini-2.5-flash...");
    try {
        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash",
            apiKey: process.env.GOOGLE_API_KEY,
        });
        const res = await llm.invoke("Hi");
        console.log("LLM Success:", res.content);
    } catch (e) {
        console.error("LLM Failed:", e.message);
    }

    console.log("\nTesting Embeddings: gemini-embedding-2-preview...");
    try {
        const embeddings = new GoogleGenerativeAIEmbeddings({
            model: "gemini-embedding-2-preview",
            apiKey: process.env.GOOGLE_API_KEY,
        });
        const emb = await embeddings.embedQuery("test");
        console.log("Embeddings Success: Vector length =", emb.length);
    } catch (e) {
        console.error("Embeddings Failed:", e.message);
    }
}

testModels();
