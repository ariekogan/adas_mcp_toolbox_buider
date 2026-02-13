import { Router } from "express";
import skillsStore from "../store/skills.js";
import { generateAdasExportPayload, generateAdasExportFiles } from "../services/exportAdasCore.js";
import { provisionSkillActor, listTriggers, toggleTrigger, getTriggerHistory } from "../services/cpAdminBridge.js";
import { deployIdentityToADAS, deploySkillToADAS, getSkillSlug } from "../services/exportDeploy.js";
import adasCore from "../services/adasCoreClient.js";

// Store running MCP processes
const runningMCPs = new Map();

const router = Router();

// ============================================================================
// ADAS CORE EXPORT ENDPOINTS
// ============================================================================

/**
 * POST /api/export/:skillId/adas
 *
 * Export skill to ADAS Core format and optionally deploy directly.
 *
 * Query params:
 *   - deploy=true: Send directly to ADAS Core import endpoint
 *   - adasUrl: ADAS Core URL (default: http://adas-backend:4000)
 */
router.post("/:skillId/adas", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { deploy, solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    log.info(`Exporting skill ${skillId} (solution=${solution_id}) to ADAS Core format`);

    // Deploy solution-level identity config before skill deployment
    if (deploy === "true" && solution_id) {
      try {
        const identityResult = await deployIdentityToADAS(solution_id, log);
        if (identityResult.ok && !identityResult.skipped) {
          log.info(`[ADAS Export] Identity config deployed: ${identityResult.actor_types?.length || 0} actor types`);
        }
      } catch (err) {
        log.warn(`[ADAS Export] Identity deploy failed (non-fatal): ${err.message}`);
      }
    }

    // Load skill
    const skill = await skillsStore.load(solution_id, skillId);

    // Check if tools have minimum required fields
    const incompleteTool = skill.tools?.find(t => !t.name);
    if (incompleteTool) {
      return res.status(400).json({
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool?.name || "unnamed tool"
      });
    }

    // Generate ADAS export payload
    const payload = generateAdasExportPayload(skill);

    log.info(`Generated ADAS payload: skillSlug=${payload.skillSlug}, tools=${payload.tools.length}`);

    // Auto-create skill actor before deploying
    let skillActorInfo = null;
    try {
      log.info(`Provisioning skill actor for: ${payload.skillSlug}`);
      const { actor, token, tokenId, created } = await provisionSkillActor({
        skillSlug: payload.skillSlug,
        displayName: skill.name || payload.skillSlug,
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

      // Update skill with skill identity info
      if (!skill.skill_identity) {
        skill.skill_identity = {};
      }
      skill.skill_identity.actor_id = actor.actorId;
      skill.skill_identity.actor_ref = `agent::${payload.skillSlug}`;
      skill.skill_identity.display_name = actor.displayName;
      skill.skill_identity.activated_at = new Date().toISOString();

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
      log.info(`Deploying to ADAS Core: ${adasCore.getBaseUrl()}/api/skills/import`);

      try {
        const result = await adasCore.importSkillPayload(payload);

        // Update skill status
        skill.phase = "DEPLOYED";
        skill.deployedAt = new Date().toISOString();
        skill.deployedTo = adasCore.getBaseUrl();
        await skillsStore.save(skill);

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
        return res.status(fetchErr.status || 502).json({
          error: "Failed to connect to ADAS Core",
          details: fetchErr.message,
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
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:skillId/adas/preview
 *
 * Preview ADAS Core export files without deploying.
 */
router.get("/:skillId/adas/preview", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const files = generateAdasExportFiles(skill);

    res.json({
      files: files.map(f => ({
        name: f.name,
        content: f.content,
        size: f.content.length
      }))
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});
// ============================================================================
// TRIGGER MANAGEMENT ENDPOINTS (via cp.admin_api)
// ============================================================================


/**
 * GET /api/export/:skillId/triggers/status
 *
 * Get the status of triggers in CORE for a deployed skill.
 * Uses cp.admin_api listTriggers method.
 */
router.get("/:skillId/triggers/status", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const skillSlug = getSkillSlug(skill, skillId);

    log.info(`Fetching trigger status from CORE via cp.admin_api for skill: ${skillSlug}`);

    try {
      // Call CORE via cp.admin_api
      const result = await listTriggers({ skillSlug });

      // Merge CORE status with local triggers
      const localTriggers = skill.triggers || [];
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
        triggers: (skill.triggers || []).map(t => ({
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
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * POST /api/export/:skillId/triggers/:triggerId/toggle
 *
 * Toggle a trigger's active state in CORE.
 * Uses cp.admin_api enableTrigger/disableTrigger methods.
 * Body: { active: boolean }
 */
router.post("/:skillId/triggers/:triggerId/toggle", async (req, res, next) => {
  try {
    const { skillId, triggerId } = req.params;
    const { active, solution_id } = req.body;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id is required in body" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const skillSlug = getSkillSlug(skill, skillId);

    log.info(`Toggling trigger in CORE via cp.admin_api: skill=${skillSlug}, trigger=${triggerId}, active=${active}`);

    try {
      // Call CORE via cp.admin_api
      const result = await toggleTrigger(skillSlug, triggerId, active);

      // Also update local state to stay in sync
      const triggerIndex = skill.triggers?.findIndex(t => t.id === triggerId);
      if (triggerIndex >= 0) {
        skill.triggers[triggerIndex].enabled = active;
        await skillsStore.save(skill);
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
      const triggerIndex = skill.triggers?.findIndex(t => t.id === triggerId);
      if (triggerIndex >= 0) {
        skill.triggers[triggerIndex].enabled = active;
        await skillsStore.save(skill);
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
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:skillId/triggers/:triggerId/history
 *
 * Get execution history for a trigger.
 * Uses cp.admin_api getTriggerHistory method.
 */
router.get("/:skillId/triggers/:triggerId/history", async (req, res, next) => {
  try {
    const { skillId, triggerId } = req.params;
    const { limit = 20, solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const skillSlug = getSkillSlug(skill, skillId);

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
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

// ============================================================================
// MCP SERVER RUNTIME MANAGEMENT
// ============================================================================

/**
 * POST /api/export/:skillId/mcp/run
 *
 * Start the generated MCP server.
 * Returns the server status and port.
 */
router.post("/:skillId/mcp/run", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.body;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id is required in body" });
    }

    // Check if already running
    if (runningMCPs.has(skillId)) {
      const existing = runningMCPs.get(skillId);
      return res.json({
        ok: true,
        status: 'already_running',
        pid: existing.pid,
        port: existing.port,
        startedAt: existing.startedAt
      });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const version = skill.version;

    if (!version) {
      return res.status(400).json({
        error: "No MCP export found",
        hint: "Generate an MCP first using the Export dialog"
      });
    }

    // Get export path
    const exportPath = await skillsStore.getExportPath(solution_id, skillId, version);

    log.info(`Starting MCP server for ${skillId} from ${exportPath}`);

    // Find the server file
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = await fs.readdir(exportPath);
    const serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');

    if (!serverFile) {
      return res.status(400).json({
        error: "No server.py found in export",
        files
      });
    }

    // Spawn python process
    const { spawn } = await import('child_process');
    const serverPath = path.join(exportPath, serverFile);

    // Find available port (start from 8100)
    const basePort = 8100 + Math.floor(Math.random() * 100);

    const proc = spawn('python', [serverPath], {
      cwd: exportPath,
      env: {
        ...process.env,
        MCP_PORT: String(basePort),
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
      log.info(`[MCP:${skillId}] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
      log.warn(`[MCP:${skillId}] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      log.error(`[MCP:${skillId}] Process error: ${err.message}`);
      runningMCPs.delete(skillId);
    });

    proc.on('exit', (code) => {
      log.info(`[MCP:${skillId}] Process exited with code ${code}`);
      runningMCPs.delete(skillId);
    });

    // Store process info
    const mcpInfo = {
      pid: proc.pid,
      port: basePort,
      startedAt: new Date().toISOString(),
      process: proc,
      skillId,
      version
    };
    runningMCPs.set(skillId, mcpInfo);

    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check if still running
    if (!runningMCPs.has(skillId)) {
      return res.status(500).json({
        error: "MCP server failed to start",
        output,
        errorOutput
      });
    }

    res.json({
      ok: true,
      status: 'started',
      pid: proc.pid,
      port: basePort,
      startedAt: mcpInfo.startedAt,
      message: `MCP server running on port ${basePort}`
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * POST /api/export/:skillId/mcp/stop
 *
 * Stop the running MCP server.
 */
router.post("/:skillId/mcp/stop", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const log = req.app.locals.log;

    if (!runningMCPs.has(skillId)) {
      return res.json({
        ok: true,
        status: 'not_running'
      });
    }

    const mcpInfo = runningMCPs.get(skillId);
    log.info(`Stopping MCP server for ${skillId} (pid: ${mcpInfo.pid})`);

    mcpInfo.process.kill('SIGTERM');
    runningMCPs.delete(skillId);

    res.json({
      ok: true,
      status: 'stopped',
      pid: mcpInfo.pid
    });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/export/:skillId/mcp/status
 *
 * Get MCP server running status.
 */
router.get("/:skillId/mcp/running", async (req, res) => {
  const { skillId } = req.params;

  if (runningMCPs.has(skillId)) {
    const info = runningMCPs.get(skillId);
    return res.json({
      running: true,
      pid: info.pid,
      port: info.port,
      startedAt: info.startedAt,
      registered: info.registered || false,
      mcpUri: info.mcpUri || null
    });
  }

  res.json({ running: false });
});

/**
 * POST /api/export/:skillId/mcp/deploy
 *
 * ONE-CLICK DEPLOY: Start MCP server + Register with ADAS Core
 *
 * This is the CLEAN pure-MCP deploy flow:
 * 1. Start the generated MCP server locally
 * 2. Register MCP URI with ADAS Core via /api/skills/install-mcp
 * 3. Skill is now available in ADAS Core (loaded fresh from MCP)
 */
router.post("/:skillId/mcp/deploy", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.body;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id is required in body" });
    }

    const result = await deploySkillToADAS(solution_id, skillId, log);
    return res.json(result);

  } catch (err) {
    if (err.code === 'NO_EXPORT') {
      return res.status(400).json({ error: err.message, hint: "Generate an MCP first using the Export dialog" });
    }
    if (err.code === 'NO_SERVER') {
      return res.status(400).json({ error: err.message, hint: "Generate MCP first" });
    }
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    if (err.message?.includes('Failed to fetch') || err.message?.includes('fetch failed')) {
      return res.status(502).json({ error: "Failed to connect to ADAS Core", details: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/export/:skillId/files/:version/:filename
 *
 * Get content of a specific export file.
 */
router.get("/:skillId/files/:version/:filename", async (req, res, next) => {
  try {
    const { skillId, version, filename } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const files = await skillsStore.getExport(solution_id, skillId, version);
    const file = files.find(f => f.name === filename);

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({
      name: file.name,
      content: file.content,
      size: file.content.length
    });

  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Export not found" });
    }
    next(err);
  }
});

export default router;
