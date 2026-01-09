import { searchWeb, fetchUrl, isSearchAvailable } from "../webSearch.js";

/**
 * Anthropic Claude API Adapter with tool use support
 */
export default class AnthropicAdapter {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = "https://api.anthropic.com/v1";
  }

  /**
   * Get available tools for Claude
   */
  getTools() {
    const tools = [];

    if (isSearchAvailable()) {
      tools.push({
        name: "web_search",
        description: "Search the web for information about APIs, libraries, documentation, or any topic relevant to building tools. Use this when you need to research how something works or find technical details.",
        input_schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query (e.g., 'Stripe API documentation', 'how to authenticate with OAuth2')"
            }
          },
          required: ["query"]
        }
      });

      tools.push({
        name: "fetch_url",
        description: "Fetch and read content from a specific URL. Use this to get detailed information from a webpage after finding it via search.",
        input_schema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to fetch content from"
            }
          },
          required: ["url"]
        }
      });
    }

    return tools;
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolName, args) {
    switch (toolName) {
      case "web_search": {
        const result = await searchWeb(args.query, { maxResults: 5 });
        return JSON.stringify({
          answer: result.answer,
          results: result.results.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.substring(0, 300)
          }))
        });
      }
      case "fetch_url": {
        const result = await fetchUrl(args.url, { maxLength: 4000 });
        if (result.error) {
          return JSON.stringify({ error: result.error });
        }
        return JSON.stringify({ content: result.content });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  }

  async chat({ systemPrompt, messages, maxTokens = 4096, temperature = 0.7, enableTools = true }) {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const tools = enableTools ? this.getTools() : [];
    let allMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    const maxIterations = 5;
    const toolsUsedList = [];

    while (iterations < maxIterations) {
      iterations++;

      const requestBody = {
        model: this.model,
        system: systemPrompt,
        messages: allMessages,
        max_tokens: maxTokens,
        temperature
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      totalInputTokens += data.usage?.input_tokens || 0;
      totalOutputTokens += data.usage?.output_tokens || 0;

      // Check if there are tool uses in the response
      const toolUseBlocks = data.content.filter(block => block.type === "tool_use");

      if (toolUseBlocks.length > 0 && data.stop_reason === "tool_use") {
        // Add assistant message with all content blocks
        allMessages.push({
          role: "assistant",
          content: data.content
        });

        // Process each tool use and build tool results
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          console.log(`[Anthropic] Executing tool: ${toolUse.name}`, toolUse.input);
          toolsUsedList.push({ name: toolUse.name, args: toolUse.input });

          const result = await this.executeTool(toolUse.name, toolUse.input);

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result
          });
        }

        // Add tool results as user message
        allMessages.push({
          role: "user",
          content: toolResults
        });

        continue;
      }

      // No tool use, extract text and return
      const textContent = data.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("");

      return {
        content: textContent,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        },
        stopReason: data.stop_reason,
        toolsUsed: toolsUsedList.length > 0 ? toolsUsedList : null
      };
    }

    throw new Error("Max tool iterations reached");
  }

  async validateKey() {
    try {
      await this.chat({
        systemPrompt: "Respond with OK",
        messages: [{ role: "user", content: "test" }],
        maxTokens: 10,
        enableTools: false
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  getModels() {
    return [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-haiku-3-5-20241022"
    ];
  }
}
