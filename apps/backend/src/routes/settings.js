import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { getMemoryRoot } from "../utils/tenantContext.js";

const router = Router();

const SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS = {
  llm_provider: "openai",
  model_tier: "normal", // "fast" | "normal" | "deep"
  openai_api_key: "",
  anthropic_api_key: "",
};

/**
 * Resolve the settings file path for the current tenant.
 */
function settingsPath() {
  return path.join(getMemoryRoot(), SETTINGS_FILE);
}

/**
 * GET /api/settings — read current settings
 */
router.get("/", async (req, res, next) => {
  try {
    const filePath = settingsPath();
    let settings = { ...DEFAULT_SETTINGS };

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const stored = JSON.parse(raw);
      settings = { ...DEFAULT_SETTINGS, ...stored };
    } catch (err) {
      // File doesn't exist yet — return defaults
      if (err.code !== "ENOENT") throw err;
    }

    // Mask API keys for frontend display (show last 4 chars only)
    const masked = { ...settings };
    for (const k of ["openai_api_key", "anthropic_api_key"]) {
      if (masked[k] && masked[k].length > 8) {
        masked[k] = "***" + masked[k].slice(-4);
      }
    }
    // Tell frontend if env-level keys are set (tenant key overrides)
    masked._env_openai = !!process.env.OPENAI_API_KEY;
    masked._env_anthropic = !!process.env.ANTHROPIC_API_KEY;

    res.json(masked);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/settings — save settings
 */
router.put("/", async (req, res, next) => {
  try {
    const filePath = settingsPath();
    const updates = req.body;

    // Load existing
    let current = { ...DEFAULT_SETTINGS };
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      current = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    // Merge updates (only allow safe keys)
    const ALLOWED_KEYS = ["llm_provider", "model_tier", "openai_api_key", "anthropic_api_key"];
    for (const key of ALLOWED_KEYS) {
      if (updates[key] !== undefined) {
        // Don't overwrite stored key with masked value from GET response
        if ((key === "openai_api_key" || key === "anthropic_api_key") && updates[key].startsWith("***")) {
          continue;
        }
        current[key] = updates[key];
      }
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write
    await fs.writeFile(filePath, JSON.stringify(current, null, 2), "utf-8");

    req.app.locals.log.info(`[Settings] Saved: ${JSON.stringify(current)}`);
    res.json(current);
  } catch (err) {
    next(err);
  }
});

export default router;
