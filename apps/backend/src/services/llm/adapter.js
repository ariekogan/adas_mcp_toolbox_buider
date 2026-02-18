import AnthropicAdapter from "./anthropic.js";
import OpenAIAdapter from "./openai.js";
import fs from "fs";
import path from "path";
import { getMemoryRoot } from "../../utils/tenantContext.js";

/**
 * Read the current tenant's settings.json (sync, cached briefly).
 * Returns { openai_api_key, anthropic_api_key, llm_provider, ... } or {}.
 */
const _settingsCache = new Map(); // key=path, value={ data, ts }
const SETTINGS_CACHE_TTL = 30_000; // 30s

function _readJsonCached(filePath) {
  try {
    const cached = _settingsCache.get(filePath);
    if (cached && Date.now() - cached.ts < SETTINGS_CACHE_TTL) return cached.data;
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    _settingsCache.set(filePath, { data, ts: Date.now() });
    return data;
  } catch {
    return {};
  }
}

function getTenantSettings() {
  const memRoot = getMemoryRoot();
  return _readJsonCached(path.join(memRoot, "settings.json"));
}

/**
 * Read Core's per-tenant LLM config from /tenants/<tenant>/secrets/llm.json.
 * Falls back to empty object if not found.
 */
function getCoreLlmConfig() {
  const memRoot = getMemoryRoot();
  // Builder memRoot is like /tenants/<tenant>/_builder
  // Core secrets are at /tenants/<tenant>/secrets/llm.json
  const coreRoot = memRoot.replace(/\/_builder\/?$/, "");
  return _readJsonCached(path.join(coreRoot, "secrets", "llm.json"));
}

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

  // Key resolution order:
  // 1. Builder per-tenant settings.json
  // 2. Core per-tenant secrets/llm.json (shared tenant LLM config)
  // 3. Env var
  // 4. Frontend-provided options.apiKey
  const tenantSettings = getTenantSettings();
  const coreLlm = getCoreLlmConfig();
  const tenantKey = provider === "openai"
    ? (tenantSettings.openai_api_key || tenantSettings.openaiApiKey)
    : (tenantSettings.anthropic_api_key || tenantSettings.anthropicApiKey);
  const coreKey = (coreLlm.useGlobalKeys)
    ? null  // useGlobalKeys means skip tenant key, go to env
    : provider === "openai"
      ? coreLlm.openaiApiKey
      : coreLlm.anthropicApiKey;
  const envKey = provider === "openai"
    ? process.env.OPENAI_API_KEY
    : process.env.ANTHROPIC_API_KEY;
  const apiKey = tenantKey || coreKey || envKey || options.apiKey;

  switch (provider) {
    case "anthropic":
      return new AnthropicAdapter({
        apiKey,
        model: resolvedModel
      });
    case "openai":
      return new OpenAIAdapter({
        apiKey,
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
