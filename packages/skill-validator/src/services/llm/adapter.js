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

// ─── Core-backed settings fetcher ──────────────────────────────────────
//
// Core is the single source of truth for LLM credentials (stored in
// adas_system.global_settings { _id: "llm" } in MongoDB). The Skill
// Builder is FS-only by architecture rule and must NOT touch MongoDB
// directly — it has to go through Core's HTTP API.
//
// When the Builder starts up, env vars like ANTHROPIC_API_KEY are
// typically empty. This module fetches the real keys from Core once,
// caches them in module scope for the lifetime of the process, and
// hands them to createAdapter() as if they came from the environment.
//
// Auth: uses the shared internal secret (ADAS_MCP_TOKEN aka
// CORE_MCP_SECRET). Core's attachActor middleware honors x-adas-token
// for internal callers.

const CORE_URL = process.env.ADAS_CORE_URL || "http://adas-backend:4000";
const CORE_SECRET =
  process.env.ADAS_MCP_TOKEN || process.env.CORE_MCP_SECRET || "";

let _cachedCoreSettings = null;
let _coreFetchPromise = null;
let _coreFetchAttempted = false;

async function fetchCoreLlmSettings() {
  if (_cachedCoreSettings) return _cachedCoreSettings;
  if (_coreFetchPromise) return _coreFetchPromise;
  if (_coreFetchAttempted && !CORE_SECRET) return null;

  _coreFetchPromise = (async () => {
    try {
      if (!CORE_SECRET) {
        console.warn(
          "[llm/adapter] ADAS_MCP_TOKEN not set — cannot fetch LLM settings from Core, falling back to env vars only"
        );
        return null;
      }
      const resp = await fetch(`${CORE_URL}/api/internal/llm-settings`, {
        headers: { "x-adas-token": CORE_SECRET },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        console.warn(
          `[llm/adapter] Core LLM settings fetch failed: ${resp.status} ${resp.statusText}`
        );
        return null;
      }
      const data = await resp.json();
      if (!data?.ok || !data?.settings) {
        console.warn("[llm/adapter] Core returned empty LLM settings");
        return null;
      }
      _cachedCoreSettings = data.settings;
      console.log(
        `[llm/adapter] Loaded LLM settings from Core (provider=${data.settings.llmProvider})`
      );
      return _cachedCoreSettings;
    } catch (e) {
      console.warn(
        `[llm/adapter] Failed to fetch LLM settings from Core: ${e.message}`
      );
      return null;
    } finally {
      _coreFetchAttempted = true;
      _coreFetchPromise = null;
    }
  })();
  return _coreFetchPromise;
}

/**
 * Get default adapter from environment, with a Core fallback.
 *
 * Resolution order:
 *   1. Environment variables (LLM_PROVIDER, ANTHROPIC_API_KEY,
 *      OPENAI_API_KEY, *_MODEL) — used as-is if set.
 *   2. Core's /api/internal/llm-settings — fetched once, cached for the
 *      process lifetime. This is the canonical source for the Skill
 *      Builder in production deployments.
 *   3. If neither is available, createAdapter() will throw when the
 *      adapter actually tries to use an empty key. That's the correct
 *      fail-loud behavior per the architecture rule.
 */
export async function getDefaultAdapter() {
  // Fast path: env already has a key for the declared provider.
  const envProvider = process.env.LLM_PROVIDER || "anthropic";
  const envKeyPresent =
    (envProvider === "anthropic" && process.env.ANTHROPIC_API_KEY) ||
    (envProvider === "openai" && process.env.OPENAI_API_KEY);
  if (envKeyPresent) {
    return createAdapter(envProvider);
  }

  // Slow path: fetch from Core, build adapter from returned settings.
  const core = await fetchCoreLlmSettings();
  if (core) {
    const provider = core.llmProvider || envProvider;
    const apiKey =
      provider === "anthropic" ? core.anthropicApiKey : core.openaiApiKey;
    const model =
      provider === "anthropic"
        ? core.llmModelNormal || core.llmModelFast || undefined
        : core.llmModelNormal || core.llmModelFast || undefined;
    return createAdapter(provider, { apiKey, model });
  }

  // No env, no Core — fall through to env-based adapter so createAdapter
  // throws with a clear error when its first call runs. This matches the
  // pre-existing behavior so nothing silently degrades.
  return createAdapter(envProvider);
}

export default { createAdapter, getDefaultAdapter };
