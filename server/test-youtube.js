import { getVideoDetails, loadVideoData, saveVideoData, extractVideoId } from './youtube.js';

const testVideoUrl = 'https://www.youtube.com/watch?v=y2lkVlB96y4';

async function runTest() {
    console.log(`Target: ${testVideoUrl}`);
    const videoId = extractVideoId(testVideoUrl);

    if (!videoId) {
        console.error('Failed to extract Video ID');
        return;
    }

    // 1. Try to load from local cache
    let data = loadVideoData(videoId);

    if (data) {
        console.log('Result: Loaded from local cache.');
    } else {
        // 2. If not in cache, fetch from API
        console.log('Result: Not in cache. Fetching from YouTube API...');
        try {
            data = await getVideoDetails(videoId);
            // 3. Save to local cache for future use
            saveVideoData(videoId, data);
        } catch (error) {
            console.error('\n--- API Fetch Failed ---');
            console.error(error.message);
            console.log('\nNote: Make sure you have added a valid YOUTUBE_API_KEY to your server/.env file.');
            return;
        }
    }

    console.log('\n--- Video Metadata ---');
    console.log(`Title: ${data.snippet.title}`);
    console.log(`Channel: ${data.snippet.channelTitle}`);
    if (data.transcription) {
        console.log(`Transcript: ${data.transcription.length} items found.`);
        console.log('Sample (first 2 lines):');
        console.log(data.transcription.slice(0, 2));
    } else {
        console.log('Transcript: Not available.');
    }
    
    // console.log(JSON.stringify(data, null, 2)); // Uncomment to see full JSON
    console.log('\n--- Success! ---');
}

runTest();
