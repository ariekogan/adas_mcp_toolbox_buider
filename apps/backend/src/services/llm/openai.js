import { searchWeb, fetchUrl, isSearchAvailable } from "../webSearch.js";

/**
 * OpenAI API Adapter with tool/function calling support
 */
export default class OpenAIAdapter {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = "https://api.openai.com/v1";
  }

  /**
   * Get available tools for function calling
   */
  getTools() {
    const tools = [];

    if (isSearchAvailable()) {
      tools.push({
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for information about APIs, libraries, documentation, or any topic relevant to building tools. Use this when you need to research how something works or find technical details.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query (e.g., 'Stripe API documentation', 'how to authenticate with OAuth2')"
              }
            },
            required: ["query"]
          }
        }
      });

      tools.push({
        type: "function",
        function: {
          name: "fetch_url",
          description: "Fetch and read content from a specific URL. Use this to get detailed information from a webpage after finding it via search.",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL to fetch content from"
              }
            },
            required: ["url"]
          }
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
      throw new Error("OPENAI_API_KEY is not set");
    }

    const tools = enableTools ? this.getTools() : [];
    let allMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops
    const toolsUsedList = [];

    while (iterations < maxIterations) {
      iterations++;

      const requestBody = {
        model: this.model,
        messages: allMessages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: "json_object" }  // Force JSON output
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      totalInputTokens += data.usage?.prompt_tokens || 0;
      totalOutputTokens += data.usage?.completion_tokens || 0;

      const choice = data.choices[0];
      const message = choice?.message;

      // Check if there are tool calls to process
      if (message?.tool_calls && message.tool_calls.length > 0) {
        // Add assistant message with tool calls
        allMessages.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls
        });

        // Execute each tool call and add results
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

          console.log(`[OpenAI] Executing tool: ${toolName}`, toolArgs);
          toolsUsedList.push({ name: toolName, args: toolArgs });

          const toolResult = await this.executeTool(toolName, toolArgs);

          allMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult
          });
        }

        // Continue the loop to get the next response
        continue;
      }

      // No tool calls, return the final response
      return {
        content: message?.content || "",
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        },
        stopReason: choice?.finish_reason,
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
      "gpt-4-turbo",
      "gpt-4",
      "gpt-4o",
      "gpt-3.5-turbo"
    ];
  }
}
