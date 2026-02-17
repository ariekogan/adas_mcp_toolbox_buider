import AnthropicAdapter from "./anthropic.js";
import OpenAIAdapter from "./openai.js";

/**
 * Semantic model tiers — single source of truth.
 * Code uses "fast" / "normal" / "deep" everywhere;
 * this map resolves them to provider-specific model IDs.
 */
export const MODEL_MAP = {
  openai: {
    fast:   "gpt-4o-mini",
    normal: "gpt-5.2",
    deep:   "gpt-5.2-pro"
  },
  anthropic: {
    fast:   "claude-haiku-3-5-20241022",
    normal: "claude-sonnet-4-20250514",
    deep:   "claude-opus-4-20250514"
  }
};

/** Default semantic tier */
export const DEFAULT_TIER = "normal";

/**
 * Resolve a model identifier.
 * Accepts a semantic tier ("fast"/"normal"/"deep") OR a raw model id ("gpt-5.2").
 * Returns the provider-specific model id string.
 */
export function resolveModel(provider, modelOrTier) {
  const providerMap = MODEL_MAP[provider];
  if (!providerMap) return modelOrTier;

  // If it's a semantic tier, resolve it
  if (providerMap[modelOrTier]) {
    return providerMap[modelOrTier];
  }

  // Otherwise treat as raw model id (backward compat)
  return modelOrTier;
}

/**
 * Create LLM adapter based on provider
 * @param {string} provider - "anthropic" or "openai"
 * @param {object} options - { apiKey, model }
 * @returns {LLMAdapter}
 */
export function createAdapter(provider, options = {}) {
  const defaultModel = MODEL_MAP[provider]?.[DEFAULT_TIER];
  const rawModel = options.model || process.env[`${provider.toUpperCase()}_MODEL`] || defaultModel;
  const resolvedModel = resolveModel(provider, rawModel);

  switch (provider) {
    case "anthropic":
      return new AnthropicAdapter({
        apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
        model: resolvedModel
      });
    case "openai":
      return new OpenAIAdapter({
        apiKey: options.apiKey || process.env.OPENAI_API_KEY,
        model: resolvedModel
      });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Get default adapter from environment
 */
export function getDefaultAdapter() {
  const provider = process.env.LLM_PROVIDER || "openai";
  return createAdapter(provider);
}

export default { createAdapter, getDefaultAdapter, MODEL_MAP, DEFAULT_TIER, resolveModel };
