/**
 * Tenant API Routes
 *
 * REST API for tenant configuration management:
 * - Communication channels (email, slack)
 * - Routing rules
 * - Policies
 *
 * @module routes/tenant
 */

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import { listEmailAliases, retentionCleanup } from "../services/cpAdminBridge.js";

const router = Router();

// ============================================
// Storage Path
// ============================================

const MEMORY_PATH = process.env.MEMORY_PATH || "/memory";
const TENANT_FILE = path.join(MEMORY_PATH, "tenant.json");

// ============================================
// Helper Functions
// ============================================

/**
 * Load tenant config from disk
 * @returns {Promise<Object|null>}
 */
async function loadTenantConfig() {
  try {
    const data = await fs.readFile(TENANT_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Save tenant config to disk
 * @param {Object} config
 */
async function saveTenantConfig(config) {
  // Ensure directory exists
  await fs.mkdir(path.dirname(TENANT_FILE), { recursive: true });
  await fs.writeFile(TENANT_FILE, JSON.stringify(config, null, 2));
  // Note: Actual routing is handled by CORE, not DAL
  // DAL just persists the config for UI and deploys it with skills
}

/**
 * Create default tenant config
 * @returns {Object}
 */
function createDefaultTenantConfig() {
  const now = new Date().toISOString();
  return {
    tenant_id: uuidv4(),
    name: "Default Tenant",
    channels: {
      email: {
        enabled: false,
        connector_id: "gmail",
        routing: {
          mode: "dedicated_mailbox",
          rules: [],
        },
      },
      slack: {
        enabled: false,
        connector_id: "slack",
        workspace_id: "",
        routing: {
          mode: "mention_based",
          rules: [],
        },
      },
      telegram: {
        enabled: false,
        connector_id: "telegram-mcp",
        routing: {
          mode: "command_prefix",
          command_aliases: {},
          rules: [],
        },
      },
    },
    policies: {
      allow_external_users: true,
      default_skill_slug: null,
      retention_days: 30,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================
// Initialize on startup
// ============================================

(async () => {
  try {
    const config = await loadTenantConfig();
    if (config) {
      console.log("[tenant] Loaded tenant config on startup");
      // Note: Routing is handled by CORE, DAL just stores the config
    }
  } catch (err) {
    console.error("[tenant] Failed to load tenant config on startup:", err.message);
  }
})();

// ============================================
// Tenant Config Endpoints
// ============================================

/**
 * GET /api/tenant
 * Get tenant configuration
 */
router.get("/", async (req, res) => {
  try {
    let config = await loadTenantConfig();

    // Create default if not exists
    if (!config) {
      config = createDefaultTenantConfig();
      await saveTenantConfig(config);
    }

    res.json(config);
  } catch (err) {
    console.error("[tenant] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant
 * Update entire tenant configuration
 */
router.put("/", async (req, res) => {
  try {
    const existingConfig = await loadTenantConfig();
    const updatedConfig = {
      ...createDefaultTenantConfig(),
      ...req.body,
      tenant_id: existingConfig?.tenant_id || req.body.tenant_id || uuidv4(),
      createdAt: existingConfig?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveTenantConfig(updatedConfig);
    res.json(updatedConfig);
  } catch (err) {
    console.error("[tenant] PUT error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant
 * Partially update tenant configuration
 */
router.patch("/", async (req, res) => {
  try {
    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    // Deep merge
    const updatedConfig = deepMerge(config, req.body);
    updatedConfig.updatedAt = new Date().toISOString();

    await saveTenantConfig(updatedConfig);
    res.json(updatedConfig);
  } catch (err) {
    console.error("[tenant] PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Channel Configuration Endpoints
// ============================================

/**
 * GET /api/tenant/channels
 * Get all channel configurations
 */
router.get("/channels", async (req, res) => {
  try {
    const config = await loadTenantConfig();
    res.json(config?.channels || {});
  } catch (err) {
    console.error("[tenant] GET channels error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant/channels/:channel
 * Update specific channel configuration (email or slack)
 */
router.put("/channels/:channel", async (req, res) => {
  try {
    const { channel } = req.params;

    if (!["email", "slack", "telegram"].includes(channel)) {
      return res.status(400).json({ error: `Invalid channel: ${channel}. Must be 'email', 'slack', or 'telegram'.` });
    }

    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    config.channels[channel] = {
      ...config.channels[channel],
      ...req.body,
    };
    config.updatedAt = new Date().toISOString();

    await saveTenantConfig(config);
    res.json(config.channels[channel]);
  } catch (err) {
    console.error("[tenant] PUT channel error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant/channels/:channel/enable
 * Enable or disable a channel
 */
router.patch("/channels/:channel/enable", async (req, res) => {
  try {
    const { channel } = req.params;
    const { enabled } = req.body;

    if (!["email", "slack", "telegram"].includes(channel)) {
      return res.status(400).json({ error: `Invalid channel: ${channel}` });
    }

    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    // Initialize channel structure if missing (e.g., telegram added to older configs)
    if (!config.channels[channel]) {
      const defaults = createDefaultTenantConfig();
      config.channels[channel] = defaults.channels[channel] || { enabled: false, routing: { rules: [] } };
    }

    config.channels[channel].enabled = !!enabled;
    config.updatedAt = new Date().toISOString();

    await saveTenantConfig(config);
    res.json({ channel, enabled: config.channels[channel].enabled });
  } catch (err) {
    console.error("[tenant] PATCH channel enable error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Routing Rules Endpoints
// ============================================

/**
 * GET /api/tenant/channels/:channel/routing
 * Get routing rules for a channel
 */
router.get("/channels/:channel/routing", async (req, res) => {
  try {
    const { channel } = req.params;
    const config = await loadTenantConfig();

    if (!config?.channels?.[channel]) {
      return res.status(404).json({ error: `Channel '${channel}' not configured` });
    }

    res.json(config.channels[channel].routing || {});
  } catch (err) {
    console.error("[tenant] GET routing error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant/channels/email/routing/rules
 * Add email routing rule
 */
router.post("/channels/email/routing/rules", async (req, res) => {
  try {
    const { address, skill_slug } = req.body;

    if (!address || !skill_slug) {
      return res.status(400).json({ error: "Both 'address' and 'skill_slug' are required" });
    }

    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    // Check for duplicates
    const existing = config.channels.email.routing.rules.find(
      (r) => r.address.toLowerCase() === address.toLowerCase()
    );
    if (existing) {
      return res.status(409).json({ error: `Rule for address '${address}' already exists` });
    }

    const rule = { address: address.toLowerCase(), skill_slug };
    config.channels.email.routing.rules.push(rule);
    config.updatedAt = new Date().toISOString();

    await saveTenantConfig(config);

    res.status(201).json(rule);
  } catch (err) {
    console.error("[tenant] POST email rule error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/tenant/channels/email/routing/rules/:address
 * Remove email routing rule
 */
router.delete("/channels/email/routing/rules/:address", async (req, res) => {
  try {
    const { address } = req.params;

    let config = await loadTenantConfig();
    if (!config) {
      return res.status(404).json({ error: "Tenant config not found" });
    }

    const initialLength = config.channels.email.routing.rules.length;
    config.channels.email.routing.rules = config.channels.email.routing.rules.filter(
      (r) => r.address.toLowerCase() !== address.toLowerCase()
    );

    if (config.channels.email.routing.rules.length === initialLength) {
      return res.status(404).json({ error: `Rule for address '${address}' not found` });
    }

    config.updatedAt = new Date().toISOString();
    await saveTenantConfig(config);

    res.json({ deleted: address });
  } catch (err) {
    console.error("[tenant] DELETE email rule error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant/channels/slack/routing/rules
 * Add Slack routing rule
 */
router.post("/channels/slack/routing/rules", async (req, res) => {
  try {
    const { mention_handle, channel_id, skill_slug, bot_user_id } = req.body;

    if (!skill_slug) {
      return res.status(400).json({ error: "'skill_slug' is required" });
    }

    if (!mention_handle && !channel_id) {
      return res.status(400).json({ error: "Either 'mention_handle' or 'channel_id' is required" });
    }

    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    // Check for duplicates
    const key = mention_handle?.toLowerCase() || channel_id;
    const existing = config.channels.slack.routing.rules.find((r) => {
      if (mention_handle && r.mention_handle) {
        return r.mention_handle.toLowerCase() === mention_handle.toLowerCase();
      }
      if (channel_id && r.channel_id) {
        return r.channel_id === channel_id;
      }
      return false;
    });

    if (existing) {
      return res.status(409).json({ error: `Rule for '${key}' already exists` });
    }

    const rule = { skill_slug };
    if (mention_handle) rule.mention_handle = mention_handle.toLowerCase();
    if (channel_id) rule.channel_id = channel_id;
    if (bot_user_id) rule.bot_user_id = bot_user_id;

    config.channels.slack.routing.rules.push(rule);
    config.updatedAt = new Date().toISOString();

    await saveTenantConfig(config);

    res.status(201).json(rule);
  } catch (err) {
    console.error("[tenant] POST slack rule error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/tenant/channels/slack/routing/rules
 * Remove Slack routing rule by mention_handle or channel_id
 */
router.delete("/channels/slack/routing/rules", async (req, res) => {
  try {
    const { mention_handle, channel_id } = req.query;

    if (!mention_handle && !channel_id) {
      return res.status(400).json({ error: "Either 'mention_handle' or 'channel_id' query param is required" });
    }

    let config = await loadTenantConfig();
    if (!config) {
      return res.status(404).json({ error: "Tenant config not found" });
    }

    const initialLength = config.channels.slack.routing.rules.length;
    config.channels.slack.routing.rules = config.channels.slack.routing.rules.filter((r) => {
      if (mention_handle && r.mention_handle) {
        return r.mention_handle.toLowerCase() !== mention_handle.toLowerCase();
      }
      if (channel_id && r.channel_id) {
        return r.channel_id !== channel_id;
      }
      return true;
    });

    if (config.channels.slack.routing.rules.length === initialLength) {
      return res.status(404).json({ error: "Rule not found" });
    }

    config.updatedAt = new Date().toISOString();
    await saveTenantConfig(config);

    res.json({ deleted: mention_handle || channel_id });
  } catch (err) {
    console.error("[tenant] DELETE slack rule error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Telegram Routing Rules
// ============================================

/**
 * POST /api/tenant/channels/telegram/routing/rules
 * Add Telegram routing rule (command alias → skill)
 */
router.post("/channels/telegram/routing/rules", async (req, res) => {
  try {
    const { command, skill_slug, chat_id, username } = req.body;

    if (!skill_slug) {
      return res.status(400).json({ error: "'skill_slug' is required" });
    }

    if (!command && !chat_id && !username) {
      return res.status(400).json({ error: "At least one of 'command', 'chat_id', or 'username' is required" });
    }

    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    // Ensure telegram channel structure exists
    if (!config.channels.telegram) {
      config.channels.telegram = { enabled: false, connector_id: "telegram-mcp", routing: { mode: "command_prefix", command_aliases: {}, rules: [] } };
    }
    if (!config.channels.telegram.routing) {
      config.channels.telegram.routing = { mode: "command_prefix", command_aliases: {}, rules: [] };
    }
    if (!config.channels.telegram.routing.command_aliases) {
      config.channels.telegram.routing.command_aliases = {};
    }
    if (!config.channels.telegram.routing.rules) {
      config.channels.telegram.routing.rules = [];
    }

    // If command alias, add to command_aliases map
    if (command) {
      const cmd = command.toLowerCase().replace(/^\//, "");
      if (config.channels.telegram.routing.command_aliases[cmd]) {
        return res.status(409).json({ error: `Command alias '/${cmd}' already exists` });
      }
      config.channels.telegram.routing.command_aliases[cmd] = skill_slug;
    } else {
      // Otherwise add as a routing rule (chat_id or username)
      const rule = { skill_slug };
      if (chat_id) rule.chat_id = String(chat_id);
      if (username) rule.username = username.toLowerCase().replace(/^@/, "");

      // Check for duplicates
      const duplicate = config.channels.telegram.routing.rules.find(r => {
        if (chat_id && r.chat_id) return String(r.chat_id) === String(chat_id);
        if (username && r.username) return r.username === rule.username;
        return false;
      });
      if (duplicate) {
        return res.status(409).json({ error: `Rule already exists` });
      }

      config.channels.telegram.routing.rules.push(rule);
    }

    config.updatedAt = new Date().toISOString();
    await saveTenantConfig(config);

    res.status(201).json({ command, chat_id, username, skill_slug });
  } catch (err) {
    console.error("[tenant] POST telegram rule error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/tenant/channels/telegram/routing/rules
 * Remove Telegram routing rule by command, chat_id, or username
 */
router.delete("/channels/telegram/routing/rules", async (req, res) => {
  try {
    const { command, chat_id, username } = req.query;

    if (!command && !chat_id && !username) {
      return res.status(400).json({ error: "Either 'command', 'chat_id', or 'username' query param is required" });
    }

    let config = await loadTenantConfig();
    if (!config) {
      return res.status(404).json({ error: "Tenant config not found" });
    }

    let deleted = false;

    if (command) {
      const cmd = command.toLowerCase().replace(/^\//, "");
      if (config.channels.telegram?.routing?.command_aliases?.[cmd]) {
        delete config.channels.telegram.routing.command_aliases[cmd];
        deleted = true;
      }
    } else {
      const rules = config.channels.telegram?.routing?.rules || [];
      const initialLength = rules.length;

      config.channels.telegram.routing.rules = rules.filter(r => {
        if (chat_id && r.chat_id) return String(r.chat_id) !== String(chat_id);
        if (username && r.username) return r.username !== username.toLowerCase().replace(/^@/, "");
        return true;
      });

      deleted = config.channels.telegram.routing.rules.length < initialLength;
    }

    if (!deleted) {
      return res.status(404).json({ error: "Rule not found" });
    }

    config.updatedAt = new Date().toISOString();
    await saveTenantConfig(config);

    res.json({ deleted: command || chat_id || username });
  } catch (err) {
    console.error("[tenant] DELETE telegram rule error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Email Aliases (from CORE via cpAdminBridge)
// ============================================

/**
 * GET /api/tenant/email-aliases
 * Get available Gmail "Send As" email aliases from CORE
 */
router.get("/email-aliases", async (req, res) => {
  try {
    const result = await listEmailAliases();
    res.json(result);
  } catch (err) {
    console.error("[tenant] GET email-aliases error:", err);
    res.status(500).json({ ok: false, error: err.message, aliases: [] });
  }
});

// ============================================
// Policies Endpoints
// ============================================

/**
 * GET /api/tenant/policies
 * Get tenant policies
 */
router.get("/policies", async (req, res) => {
  try {
    const config = await loadTenantConfig();
    res.json(config?.policies || {});
  } catch (err) {
    console.error("[tenant] GET policies error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant/policies
 * Update tenant policies
 */
router.patch("/policies", async (req, res) => {
  try {
    let config = await loadTenantConfig();
    if (!config) {
      config = createDefaultTenantConfig();
    }

    config.policies = {
      ...config.policies,
      ...req.body,
    };
    config.updatedAt = new Date().toISOString();

    await saveTenantConfig(config);
    res.json(config.policies);
  } catch (err) {
    console.error("[tenant] PATCH policies error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Retention Cleanup Endpoints
// ============================================

/**
 * POST /api/tenant/retention/cleanup
 * Trigger retention cleanup via CORE
 */
router.post("/retention/cleanup", async (req, res) => {
  try {
    const { dryRun = false } = req.body || {};
    // Read retention_days from tenant config
    const config = await loadTenantConfig();
    const retention_days = config?.policies?.retention_days ?? 30;

    const result = await retentionCleanup({ retention_days, dryRun });
    res.json(result);
  } catch (err) {
    console.error("[tenant] POST retention/cleanup error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/tenant/retention/preview
 * Preview what would be cleaned up (dry run)
 */
router.get("/retention/preview", async (req, res) => {
  try {
    const config = await loadTenantConfig();
    const retention_days = config?.policies?.retention_days ?? 30;

    const result = await retentionCleanup({ retention_days, dryRun: true });
    res.json(result);
  } catch (err) {
    console.error("[tenant] GET retention/preview error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// Utility Functions
// ============================================

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

export default router;
