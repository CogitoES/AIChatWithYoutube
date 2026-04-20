const rateLimits = new Map();
const LIMIT = process.env.WIKI_RATE_LIMIT ? parseInt(process.env.WIKI_RATE_LIMIT) : 5;
const WINDOW_MS = 60000;

/**
 * Basic in-memory rate limiter
 * @param {string} sessionId
 * @returns {boolean} - true if allowed, false if limit exceeded
 */
export function checkRateLimit(sessionId) {
    const now = Date.now();
    const session = rateLimits.get(sessionId) || { count: 0, startTime: now };

    // Reset window if expired
    if (now - session.startTime > WINDOW_MS) {
        session.count = 1;
        session.startTime = now;
    } else {
        session.count++;
    }

    rateLimits.set(sessionId, session);
    return session.count <= LIMIT;
}

/**
 * Fetches summary from Wikipedia
 * @param {string} query
 * @returns {Promise<{answer: string, sourceUrl: string} | null>}
 */
export async function fetchWikipediaSummary(query) {
    try {
        console.log(`[FactCheck] Searching Wikipedia for: "${query}"`);
        
        // 1. Search for page titles
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'AIChatWithYoutube-FactChecker/1.0' }
        });
        const searchData = await searchRes.json();

        if (!searchData.query || !searchData.query.search || searchData.query.search.length === 0) {
            console.log(`[FactCheck] No Wikipedia results for: "${query}"`);
            return null;
        }

        const title = searchData.query.search[0].title;
        console.log(`[FactCheck] Best match title: "${title}"`);

        // 2. Fetch page summary
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        const summaryRes = await fetch(summaryUrl, {
            headers: { 'User-Agent': 'AIChatWithYoutube-FactChecker/1.0' }
        });

        if (!summaryRes.ok) {
            console.error(`[FactCheck] Wikipedia Summary API error: ${summaryRes.status}`);
            return null;
        }

        const summaryData = await summaryRes.json();
        
        return {
            answer: summaryData.extract,
            sourceUrl: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
        };
    } catch (error) {
        console.error(`[FactCheck] Wikipedia fetch error:`, error.message);
        return null;
    }
}
