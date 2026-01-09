import AnthropicAdapter from "./anthropic.js";
import OpenAIAdapter from "./openai.js";

/**
 * Create LLM adapter based on provider
 * @param {string} provider - "anthropic" or "openai"
 * @param {object} options - { apiKey, model }
 * @returns {LLMAdapter}
 */
export function createAdapter(provider, options = {}) {
  switch (provider) {
    case "anthropic":
      return new AnthropicAdapter({
        apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
        model: options.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
      });
    case "openai":
      return new OpenAIAdapter({
        apiKey: options.apiKey || process.env.OPENAI_API_KEY,
        model: options.model || process.env.OPENAI_MODEL || "gpt-4-turbo"
      });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Get default adapter from environment
 */
export function getDefaultAdapter() {
  const provider = process.env.LLM_PROVIDER || "anthropic";
  return createAdapter(provider);
}

export default { createAdapter, getDefaultAdapter };
