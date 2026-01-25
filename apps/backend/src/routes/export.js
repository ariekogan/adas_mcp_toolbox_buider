import { Router } from "express";
import domainsStore from "../store/domains.js";
import { generateExportFiles, generateAdasExportPayload, generateAdasExportFiles } from "../services/export.js";
import { provisionSkillActor, listTriggers, toggleTrigger, getTriggerHistory } from "../services/cpAdminBridge.js";

const router = Router();

// Export domain as MCP server
router.get("/:domainId", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    log.info(`Exporting domain ${domainId}`);

    // Load domain
    const domain = await domainsStore.load(domainId);

    // Debug: log tools
    log.info(`Domain has ${domain.tools?.length || 0} tools`);
    domain.tools?.forEach((t, i) => {
      log.info(`Tool ${i}: name=${t.name}, hasDesc=${!!t.description}`);
    });

    // Check if tools have minimum required fields (name, description)
    const incompleteTool = domain.tools?.find(t => !t.name || !t.description);
    if (incompleteTool) {
      log.info(`Incomplete tool found: ${JSON.stringify(incompleteTool)}`);
      return res.status(400).json({
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool?.name || "unnamed tool",
        missing: !incompleteTool?.name ? "name" : "description"
      });
    }

    // Generate files
    const files = generateExportFiles(domain);

    // Save export
    const version = domain.version || 1;
    await domainsStore.saveExport(domainId, version, files);

    // Update domain status
    domain.phase = "EXPORTED";
    await domainsStore.save(domain);

    res.json({
      version,
      files: files.map(f => ({
        name: f.name,
        size: f.content.length,
        preview: f.content.slice(0, 200) + (f.content.length > 200 ? "..." : "")
      })),
      download_url: `/api/export/${domainId}/download/${version}`
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

// Download export as files (returns JSON with file contents)
router.get("/:domainId/download/:version", async (req, res, next) => {
  try {
    const { domainId, version } = req.params;

    const files = await domainsStore.getExport(domainId, version);

    res.json({ files });

  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Export not found" });
    }
    next(err);
  }
});

// Preview generated code without saving
router.get("/:domainId/preview", async (req, res, next) => {
  try {
    const { domainId } = req.params;

    const domain = await domainsStore.load(domainId);
    const files = generateExportFiles(domain);

    res.json({
      files: files.map(f => ({
        name: f.name,
        content: f.content
      }))
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

// ============================================================================
// ADAS CORE EXPORT ENDPOINTS
// ============================================================================

/**
 * POST /api/export/:domainId/adas
 *
 * Export domain to ADAS Core format and optionally deploy directly.
 *
 * Query params:
 *   - deploy=true: Send directly to ADAS Core import endpoint
 *   - adasUrl: ADAS Core URL (default: http://adas-backend:4000)
 */
router.post("/:domainId/adas", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const { deploy, adasUrl } = req.query;
    const log = req.app.locals.log;

    log.info(`Exporting domain ${domainId} to ADAS Core format`);

    // Load domain
    const domain = await domainsStore.load(domainId);

    // Check if tools have minimum required fields
    const incompleteTool = domain.tools?.find(t => !t.name);
    if (incompleteTool) {
      return res.status(400).json({
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool?.name || "unnamed tool"
      });
    }

    // Generate ADAS export payload
    const payload = generateAdasExportPayload(domain);

    log.info(`Generated ADAS payload: skillSlug=${payload.skillSlug}, tools=${payload.tools.length}`);

    // Auto-create skill actor before deploying
    let skillActorInfo = null;
    try {
      log.info(`Provisioning skill actor for: ${payload.skillSlug}`);
      const { actor, token, tokenId, created } = await provisionSkillActor({
        skillSlug: payload.skillSlug,
        displayName: domain.name || payload.skillSlug,
      });

      skillActorInfo = {
        actorId: actor.actorId,
        actorType: actor.actorType,
        actorRef: `agent::${payload.skillSlug}`,
        displayName: actor.displayName,
        token,
        tokenId,
        created,
      };

      log.info(`Skill actor ${created ? "created" : "found"}: ${actor.actorId}`);

      // Update domain with skill identity info
      if (!domain.skill_identity) {
        domain.skill_identity = {};
      }
      domain.skill_identity.actor_id = actor.actorId;
      domain.skill_identity.actor_ref = `agent::${payload.skillSlug}`;
      domain.skill_identity.display_name = actor.displayName;
      domain.skill_identity.activated_at = new Date().toISOString();

      // Include actor info in payload for CORE
      payload.skillActor = {
        actorId: actor.actorId,
        actorRef: `agent::${payload.skillSlug}`,
        token,
      };

    } catch (actorErr) {
      log.warn(`Failed to provision skill actor: ${actorErr.message}`);
      // Continue with deployment even if actor creation fails
      // CORE can work without pre-created actor
    }

    // If deploy=true, send to ADAS Core
    if (deploy === "true") {
      const targetUrl = adasUrl || process.env.ADAS_CORE_URL || "http://ai-dev-assistant-backend-1:4000";
      const importUrl = `${targetUrl}/api/skills/import`;

      log.info(`Deploying to ADAS Core: ${importUrl}`);

      try {
        const response = await fetch(importUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          return res.status(response.status).json({
            error: "ADAS Core import failed",
            details: result
          });
        }

        // Update domain status
        domain.phase = "DEPLOYED";
        domain.deployedAt = new Date().toISOString();
        domain.deployedTo = targetUrl;
        await domainsStore.save(domain);

        return res.json({
          ok: true,
          deployed: true,
          skillSlug: payload.skillSlug,
          toolsCount: payload.tools.length,
          skillActor: skillActorInfo,
          adasResponse: result
        });

      } catch (fetchErr) {
        log.error(`ADAS Core deploy failed: ${fetchErr.message}`);
        return res.status(502).json({
          error: "Failed to connect to ADAS Core",
          details: fetchErr.message,
          targetUrl: importUrl
        });
      }
    }

    // Return payload for manual deployment
    res.json({
      ok: true,
      deployed: false,
      skillSlug: payload.skillSlug,
      toolsCount: payload.tools.length,
      skillActor: skillActorInfo,
      payload // Full payload for manual POST to /api/skills/import
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:domainId/adas/preview
 *
 * Preview ADAS Core export files without deploying.
 */
router.get("/:domainId/adas/preview", async (req, res, next) => {
  try {
    const { domainId } = req.params;

    const domain = await domainsStore.load(domainId);
    const files = generateAdasExportFiles(domain);

    res.json({
      files: files.map(f => ({
        name: f.name,
        content: f.content,
        size: f.content.length
      }))
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

// ============================================================================
// TRIGGER MANAGEMENT ENDPOINTS (via cp.admin_api)
// ============================================================================

/**
 * Helper to get skillSlug from domain
 */
function getSkillSlug(domain, domainId) {
  return domain.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || domainId;
}

/**
 * GET /api/export/:domainId/triggers/status
 *
 * Get the status of triggers in CORE for a deployed skill.
 * Uses cp.admin_api listTriggers method.
 */
router.get("/:domainId/triggers/status", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    const domain = await domainsStore.load(domainId);
    const skillSlug = getSkillSlug(domain, domainId);

    log.info(`Fetching trigger status from CORE via cp.admin_api for skill: ${skillSlug}`);

    try {
      // Call CORE via cp.admin_api
      const result = await listTriggers({ skillSlug });

      // Merge CORE status with local triggers
      const localTriggers = domain.triggers || [];
      const coreTriggers = result.triggers || [];

      const mergedTriggers = localTriggers.map(local => {
        const coreMatch = coreTriggers.find(c => c.id === local.id);
        return {
          id: local.id,
          type: local.type,
          enabled: local.enabled,
          every: local.every,
          event: local.event,
          prompt: local.prompt,
          // CORE status
          coreActive: coreMatch?.active ?? null,
          coreLastRun: coreMatch?.lastRun ?? null,
          coreNextRun: coreMatch?.nextRun ?? null
        };
      });

      return res.json({
        source: "core",
        skillSlug,
        triggers: mergedTriggers
      });

    } catch (coreErr) {
      log.warn(`Failed to fetch trigger status from CORE: ${coreErr.message}`);
      // Return local state as fallback
      return res.json({
        source: "local",
        skillSlug,
        triggers: (domain.triggers || []).map(t => ({
          id: t.id,
          type: t.type,
          enabled: t.enabled,
          every: t.every,
          event: t.event,
          coreActive: null
        })),
        warning: "CORE not reachable, showing local state only"
      });
    }

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

/**
 * POST /api/export/:domainId/triggers/:triggerId/toggle
 *
 * Toggle a trigger's active state in CORE.
 * Uses cp.admin_api enableTrigger/disableTrigger methods.
 * Body: { active: boolean }
 */
router.post("/:domainId/triggers/:triggerId/toggle", async (req, res, next) => {
  try {
    const { domainId, triggerId } = req.params;
    const { active } = req.body;
    const log = req.app.locals.log;

    const domain = await domainsStore.load(domainId);
    const skillSlug = getSkillSlug(domain, domainId);

    log.info(`Toggling trigger in CORE via cp.admin_api: skill=${skillSlug}, trigger=${triggerId}, active=${active}`);

    try {
      // Call CORE via cp.admin_api
      const result = await toggleTrigger(skillSlug, triggerId, active);

      // Also update local state to stay in sync
      const triggerIndex = domain.triggers?.findIndex(t => t.id === triggerId);
      if (triggerIndex >= 0) {
        domain.triggers[triggerIndex].enabled = active;
        await domainsStore.save(domain);
      }

      return res.json({
        ok: true,
        method: "core",
        skillSlug,
        triggerId,
        active,
        trigger: result.trigger
      });

    } catch (coreErr) {
      log.warn(`Failed to toggle trigger in CORE: ${coreErr.message}`);

      // Update local state as fallback
      const triggerIndex = domain.triggers?.findIndex(t => t.id === triggerId);
      if (triggerIndex >= 0) {
        domain.triggers[triggerIndex].enabled = active;
        await domainsStore.save(domain);
      }

      return res.json({
        ok: true,
        method: "local-only",
        message: "CORE not reachable. Trigger state updated locally. Re-deploy to sync with CORE.",
        skillSlug,
        triggerId,
        active
      });
    }

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:domainId/triggers/:triggerId/history
 *
 * Get execution history for a trigger.
 * Uses cp.admin_api getTriggerHistory method.
 */
router.get("/:domainId/triggers/:triggerId/history", async (req, res, next) => {
  try {
    const { domainId, triggerId } = req.params;
    const { limit = 20 } = req.query;
    const log = req.app.locals.log;

    const domain = await domainsStore.load(domainId);
    const skillSlug = getSkillSlug(domain, domainId);

    log.info(`Fetching trigger history from CORE: skill=${skillSlug}, trigger=${triggerId}`);

    try {
      const result = await getTriggerHistory(skillSlug, triggerId, { limit: parseInt(limit) });

      return res.json({
        skillSlug,
        triggerId,
        executions: result.executions || []
      });

    } catch (coreErr) {
      log.warn(`Failed to fetch trigger history from CORE: ${coreErr.message}`);
      return res.json({
        skillSlug,
        triggerId,
        executions: [],
        warning: "CORE not reachable"
      });
    }

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

export default router;
