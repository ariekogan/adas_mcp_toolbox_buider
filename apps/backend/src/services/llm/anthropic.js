/**
 * Anthropic Claude API Adapter
 */
export default class AnthropicAdapter {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = "https://api.anthropic.com/v1";
  }

  async chat({ systemPrompt, messages, maxTokens = 4096, temperature = 0.7 }) {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.content[0]?.text || "",
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0
      },
      stopReason: data.stop_reason
    };
  }

  async validateKey() {
    try {
      // Make a minimal request to validate the key
      await this.chat({
        systemPrompt: "Respond with OK",
        messages: [{ role: "user", content: "test" }],
        maxTokens: 10
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
