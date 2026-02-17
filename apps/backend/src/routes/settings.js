import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { getMemoryRoot } from "../utils/tenantContext.js";

const router = Router();

const SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS = {
  llm_provider: "openai",
  model_tier: "normal", // "fast" | "normal" | "deep"
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

    res.json(settings);
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
    const ALLOWED_KEYS = ["llm_provider", "model_tier"];
    for (const key of ALLOWED_KEYS) {
      if (updates[key] !== undefined) {
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
