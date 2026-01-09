/**
 * OpenAI API Adapter
 */
export default class OpenAIAdapter {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = "https://api.openai.com/v1";
  }

  async chat({ systemPrompt, messages, maxTokens = 4096, temperature = 0.7 }) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ],
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0
      },
      stopReason: data.choices[0]?.finish_reason
    };
  }

  async validateKey() {
    try {
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
      "gpt-4-turbo",
      "gpt-4",
      "gpt-4o",
      "gpt-3.5-turbo"
    ];
  }
}
