/**
 * Web Search Service
 * Provides web search capability for the LLM to research APIs, libraries, etc.
 *
 * Supports multiple providers:
 * - Tavily (recommended for AI apps, has free tier)
 * - SerpAPI (Google results)
 * - DuckDuckGo (no API key required, basic results)
 */

const TAVILY_API_URL = "https://api.tavily.com/search";
const DDG_API_URL = "https://api.duckduckgo.com/";

/**
 * Search the web using configured provider
 */
export async function searchWeb(query, options = {}) {
  const provider = process.env.SEARCH_PROVIDER || "duckduckgo";

  switch (provider) {
    case "tavily":
      return searchTavily(query, options);
    case "duckduckgo":
    default:
      return searchDuckDuckGo(query, options);
  }
}

/**
 * Search using Tavily API (best for AI applications)
 */
async function searchTavily(query, options = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY not set");
  }

  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: options.depth || "basic",
      include_answer: true,
      include_raw_content: false,
      max_results: options.maxResults || 5,
      include_domains: options.includeDomains || [],
      exclude_domains: options.excludeDomains || []
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Tavily API error: ${response.status} - ${error.message || response.statusText}`);
  }

  const data = await response.json();

  return {
    answer: data.answer || null,
    results: data.results?.map(r => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score
    })) || [],
    provider: "tavily"
  };
}

/**
 * Search using DuckDuckGo Instant Answer API (free, no key required)
 * Note: Limited to instant answers, not full search results
 */
async function searchDuckDuckGo(query, options = {}) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    no_redirect: "1",
    no_html: "1",
    skip_disambig: "1"
  });

  const response = await fetch(`${DDG_API_URL}?${params}`);

  if (!response.ok) {
    throw new Error(`DuckDuckGo API error: ${response.status}`);
  }

  const data = await response.json();

  const results = [];

  // Add abstract if available
  if (data.Abstract) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL || "",
      content: data.Abstract,
      score: 1.0
    });
  }

  // Add related topics
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, options.maxResults || 5)) {
      if (topic.Text) {
        results.push({
          title: topic.Text.split(" - ")[0] || "",
          url: topic.FirstURL || "",
          content: topic.Text,
          score: 0.8
        });
      }
    }
  }

  return {
    answer: data.Abstract || null,
    results,
    provider: "duckduckgo"
  };
}

/**
 * Fetch and extract content from a URL
 */
export async function fetchUrl(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MCPToolboxBuilder/1.0)"
      },
      signal: AbortSignal.timeout(options.timeout || 10000)
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, content: null };
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return { error: `Unsupported content type: ${contentType}`, content: null };
    }

    const html = await response.text();

    // Basic HTML to text extraction (remove scripts, styles, tags)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, options.maxLength || 5000);

    return { content: text, url };
  } catch (err) {
    return { error: err.message, content: null };
  }
}

/**
 * Check if web search is available
 */
export function isSearchAvailable() {
  const provider = process.env.SEARCH_PROVIDER || "duckduckgo";

  if (provider === "tavily") {
    return !!process.env.TAVILY_API_KEY;
  }

  // DuckDuckGo is always available
  return true;
}

export default { searchWeb, fetchUrl, isSearchAvailable };
