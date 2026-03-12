import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";

const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0,
});

// 1. Define custom tools the agent can use
// We use Zod to validate the inputs going to the tool
const weatherTool = tool(
    async ({ location }) => {
        // Dummy data for weather
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
// We bind the tools and the LLM
const agent = createReactAgent({
    llm,
    tools: [weatherTool],
});

async function main() {
    console.log("Asking the agent a question...");

    try {
        // 3. Invoke the agent with a test input.
        const inputs = {
            messages: [{ role: "user", content: "What is the weather in San Francisco today?" }]
        };

        // Langgraph agents return a state object containing all messages exchanged
        const finalState = await agent.invoke(inputs);

        // 4. Retrieve the final response from the last message the agent sent
        const finalResponse = finalState.messages[finalState.messages.length - 1];

        console.log("\nAgent Response:");
        console.log(finalResponse.content);

    } catch (err) {
        console.error("Agent failed:", err);
    }
}

main();