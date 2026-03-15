// Using global fetch (available in Node 18+)

async function testApi() {
    const url = "http://localhost:3000/chat";
    const body = {
        video_id: "y2lkVlB96y4",
        prompt: "Who was the most powerful pirate in this video?",
        thread_id: "test-thread-rest"
    };

    console.log("Sending request to API...");
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log("\n--- API Response ---");
        console.log(JSON.stringify(data, null, 2));

        if (data.answer && data.video_id === body.video_id) {
            console.log("\nVerification SUCCESS: API returned expected fields.");
        } else {
            console.log("\nVerification FAILED: Missing or incorrect fields in response.");
        }
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

testApi();
