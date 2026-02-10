import { Router } from "express";
import skillsStore from "../store/skills.js";
import solutionsStore from "../store/solutions.js";
import { generateExportFiles, generateAdasExportPayload, generateAdasExportFiles } from "../services/export.js";
import { generateNodeMCPFiles, generateGenericTemplate } from "../services/exportNodeMCP.js";
import { provisionSkillActor, listTriggers, toggleTrigger, getTriggerHistory } from "../services/cpAdminBridge.js";
import { generateMCPWithAgent, generateMCPSimple, isAgentSDKAvailable } from "../services/mcpGenerationAgent.js";
import { MCPDevelopmentSession, analyzeSkillForMCP, MCP_DEV_PHASES } from "../services/mcpDevelopmentAgent.js";
import { syncConnectorToADAS, startConnectorInADAS } from "../services/adasConnectorSync.js";
import { PREBUILT_CONNECTORS, getAllPrebuiltConnectors } from "./connectors.js";

// Store active development sessions (in production, use Redis or similar)
const activeSessions = new Map();

/**
 * Deploy a skill MCP to ADAS Core (shared logic used by both the HTTP route and deploy-all).
 * Reads the generated MCP files, sends to ADAS Core, and syncs linked connectors.
 *
 * @param {string} solutionId - Solution ID
 * @param {string} skillId - Skill ID to deploy
 * @param {object} log - Logger (console-compatible)
 * @returns {Promise<object>} Deploy result
 */
export async function deploySkillToADAS(solutionId, skillId, log, onProgress) {
  const skill = await skillsStore.load(solutionId, skillId);
  let version = skill.version;

  if (!version) {
    throw Object.assign(new Error('No MCP export found'), { code: 'NO_EXPORT' });
  }

  log.info(`[MCP Deploy] Starting deploy for ${skillId} (version ${version})`);

  const exportPath = await skillsStore.getExportPath(solutionId, skillId, version);
  const fs = await import('fs/promises');
  const path = await import('path');
  let files = await fs.readdir(exportPath);
  let serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');

  // Auto-generate MCP if server.py is missing
  if (!serverFile) {
    log.info(`[MCP Deploy] No server.py in export for ${skillId} — auto-generating MCP`);
    if (onProgress) onProgress('generating_mcp', 'Generating MCP...');

    try {
      const genFiles = await generateMCPSimple(skill);
      const fileList = Object.entries(genFiles).map(([name, content]) => ({ name, content }));
      await skillsStore.saveExport(solutionId, skillId, version, fileList);

      skill.phase = "EXPORTED";
      skill.lastExportedAt = new Date().toISOString();
      skill.lastExportType = "mcp-simple";
      await skillsStore.save(skill);

      log.info(`[MCP Deploy] Auto-generated MCP for ${skillId}: ${fileList.map(f => f.name).join(', ')}`);

      // Re-read after generation
      files = await fs.readdir(exportPath);
      serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');
    } catch (genErr) {
      log.error(`[MCP Deploy] MCP generation failed for ${skillId}: ${genErr.message}`);
      throw Object.assign(new Error(`MCP generation failed: ${genErr.message}`), { code: 'GEN_FAILED' });
    }
  }

  if (!serverFile) {
    throw Object.assign(new Error('No server.py found even after generation'), { code: 'NO_SERVER' });
  }

  if (onProgress) onProgress('deploying', 'Deploying to ADAS...');

  const serverPath = path.join(exportPath, serverFile);
  const mcpServer = await fs.readFile(serverPath, 'utf8');

  let requirements = null;
  try {
    requirements = await fs.readFile(path.join(exportPath, 'requirements.txt'), 'utf8');
  } catch { /* optional */ }

  log.info(`[MCP Deploy] Read MCP files (${mcpServer.length} bytes)`);

  // Generate a valid skillSlug (lowercase alphanumeric with hyphens only)
  // ADAS Core requires: /^[a-z0-9]+(-[a-z0-9]+)*$/
  // Examples: "identity-assurance-manager", "customer-support-tier-1"
  // NOT: "dom_260534ac" (has underscore), "dom-260534ac" (fine but ugly)

  // Priority 1: Use skill.name slugified (most readable)
  // Priority 2: Use original_skill_id if set (from imported solutions)
  // Priority 3: Convert skillId (dom_xxx -> dom-xxx) as last resort
  let skillSlug;

  if (skill.name) {
    // Slugify the skill name: "Identity Assurance Manager" -> "identity-assurance-manager"
    skillSlug = skill.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")  // Replace non-alphanumeric with hyphens
      .replace(/-+/g, "-")          // Collapse multiple hyphens
      .replace(/^-|-$/g, "");       // Trim leading/trailing hyphens
  } else if (skill.original_skill_id) {
    // Use imported skill ID (already should be valid)
    skillSlug = skill.original_skill_id.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  } else {
    // Last resort: convert skillId (dom_260534ac -> dom-260534ac)
    skillSlug = skillId.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  // Final validation: ensure it matches ADAS Core requirements
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillSlug)) {
    log.warn(`[MCP Deploy] Generated skillSlug "${skillSlug}" may be invalid, sanitizing...`);
    skillSlug = skillSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  log.info(`[MCP Deploy] Using skillSlug: "${skillSlug}" (from skill.name: "${skill.name}")`);

  const adasUrl = process.env.ADAS_CORE_URL || "http://ai-dev-assistant-backend-1:4000";
  const deployUrl = `${adasUrl}/api/skills/deploy-mcp`;

  log.info(`[MCP Deploy] Sending to ADAS Core: ${deployUrl}`);

  const tenant = (process.env.SB_TENANT || 'main').trim().toLowerCase();
  const response = await fetch(deployUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ADAS-TENANT": tenant },
    body: JSON.stringify({ skillSlug, mcpServer, requirements }),
    signal: AbortSignal.timeout(120000) // 2 min timeout
  });

  const result = await response.json();

  if (!response.ok) {
    log.error(`[MCP Deploy] ADAS Core deployment failed: ${JSON.stringify(result)}`);
    throw new Error(result.error || `Deploy failed: ${response.status}`);
  }

  // Update skill status
  skill.phase = "DEPLOYED";
  skill.deployedAt = new Date().toISOString();
  skill.deployedTo = adasUrl;
  skill.mcpUri = result.mcpUri;
  skill.connectorId = result.connectorId;
  await skillsStore.save(skill);

  log.info(`[MCP Deploy] Successfully deployed! Skill: ${skillSlug}, MCP: ${result.mcpUri}`);

  // Sync linked connectors
  const connectorResults = [];
  const linkedConnectors = skill.connectors || [];

  if (linkedConnectors.length > 0) {
    log.info(`[MCP Deploy] Syncing ${linkedConnectors.length} linked connectors: ${linkedConnectors.join(', ')}`);
    const allConnectors = getAllPrebuiltConnectors();

    for (const connectorId of linkedConnectors) {
      const connector = allConnectors[connectorId];
      if (!connector) {
        connectorResults.push({ id: connectorId, ok: false, error: 'unknown connector' });
        continue;
      }
      try {
        const isStdio = connector.transport === 'stdio' || connector.command;
        // For stdio connectors with mcp-store code, use /mcp-store/ path
        // (the original args from the catalog point to bare "server.js")
        const stdioCfg = isStdio ? {
          command: connector.command,
          args: connector.args || [],
          env: connector.envDefaults || connector.env || {}
        } : undefined;
        // If connector has mcp_store code, OR if args is just "server.js" (no path),
        // use the /mcp-store/ path so ADAS Core can find the code
        if (stdioCfg) {
          const hasBarePath = stdioCfg.args?.length === 1 && !stdioCfg.args[0].includes('/');
          if (connector.mcp_store_included || hasBarePath) {
            stdioCfg.args = [`/mcp-store/${connectorId}/server.js`];
          }
        }
        await syncConnectorToADAS({
          id: connectorId, name: connector.name, type: 'mcp',
          transport: isStdio ? 'stdio' : 'http', endpoint: connector.endpoint,
          config: stdioCfg,
          credentials: {}
        });
        const startResult = await startConnectorInADAS(connectorId);
        const toolCount = startResult?.tools?.length || 0;
        log.info(`[MCP Deploy] Connector "${connectorId}" started: ${toolCount} tools`);
        connectorResults.push({ id: connectorId, ok: true, tools: toolCount });
      } catch (err) {
        log.warn(`[MCP Deploy] Connector "${connectorId}" failed: ${err.message}`);
        connectorResults.push({ id: connectorId, ok: false, error: err.message });
      }
    }
  }

  return {
    ok: true, status: 'deployed', skillSlug,
    mcpUri: result.mcpUri, port: result.port, connectorId: result.connectorId,
    connectors: connectorResults, adasResponse: result,
    message: `Skill "${skillSlug}" deployed to ADAS Core and running!`
  };
}

const router = Router();

// ============================================================================
// LIST ALL SKILL MCP EXPORTS
// ============================================================================

/**
 * GET /api/export/mcps?solution_id=xxx
 *
 * List all skills that have generated MCP exports.
 * If solution_id is provided, returns MCPs for that solution only.
 * If no solution_id, returns MCPs from ALL solutions.
 */
router.get("/mcps", async (req, res, next) => {
  try {
    const { solution_id } = req.query;
    const log = req.app.locals.log;

    // Get solutions to iterate
    let solutionIds = [];
    if (solution_id) {
      solutionIds = [solution_id];
      log.info(`Listing MCP exports for solution ${solution_id}`);
    } else {
      // List ALL solutions and get MCPs from each
      const solutions = await solutionsStore.list();
      solutionIds = solutions.map(s => s.id);
      log.info(`Listing MCP exports for all ${solutionIds.length} solutions`);
    }

    // Get all skills for these solutions
    let skills = [];
    for (const solId of solutionIds) {
      try {
        const solSkills = await skillsStore.list(solId);
        skills.push(...solSkills.map(s => ({ ...s, _solutionId: solId })));
      } catch (err) {
        log.warn(`Failed to list skills for solution ${solId}: ${err.message}`);
      }
    }

    // Filter and enrich with export info
    const skillMcps = [];

    for (const skillSummary of skills) {
      const solId = skillSummary._solutionId || solution_id;
      try {
        const skill = await skillsStore.load(solId, skillSummary.id);

        // Include skills with MCP exports OR deployed via "Deploy to ADAS" (JS path)
        const hasMcpExport = skill.version && skill.lastExportType?.startsWith('mcp');
        const isDeployed = skill.phase === "DEPLOYED" && skill.deployedAt;
        if (hasMcpExport || isDeployed) {
          // Get export files
          let exportFiles = [];
          try {
            exportFiles = await skillsStore.getExport(solId, skill.id, skill.version);
          } catch {
            // No export files found
          }

          // Extract description from problem statement or identity
          const description = skill.problem?.statement ||
                             skill.identity?.role_description ||
                             `MCP server for ${skill.name}`;

          // Include full tool details
          const tools = (skill.tools || []).map(t => ({
            name: t.name,
            description: t.description || 'No description',
            parameters: t.parameters || [],
            returns: t.returns || { type: 'any' },
            policy: t.policy || {}
          }));

          skillMcps.push({
            id: skill.id,
            solution_id: solId,
            name: skill.name,
            description,
            version: skill.version,
            exportType: skill.lastExportType || (isDeployed ? "adas-js" : null),
            exportedAt: skill.lastExportedAt || skill.deployedAt,
            phase: skill.phase,
            toolsCount: tools.length,
            tools,
            files: exportFiles.map(f => ({ name: f.name, size: f.content?.length || 0 })),
            hasServerPy: exportFiles.some(f => f.name === 'server.py' || f.name === 'mcp_server.py'),
            downloadUrl: `/api/export/${skill.id}/download/${skill.version}?solution_id=${solId}`
          });
        }
      } catch (err) {
        // Skip skills that fail to load
        log.warn(`Failed to load skill ${skillSummary.id}: ${err.message}`);
      }
    }

    res.json({
      mcps: skillMcps.sort((a, b) => new Date(b.exportedAt) - new Date(a.exportedAt))
    });

  } catch (err) {
    next(err);
  }
});

// Export skill as MCP server
router.get("/:skillId", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    log.info(`Exporting skill ${skillId} for solution ${solution_id}`);

    // Load skill
    const skill = await skillsStore.load(solution_id, skillId);

    // Debug: log tools
    log.info(`Skill has ${skill.tools?.length || 0} tools`);
    skill.tools?.forEach((t, i) => {
      log.info(`Tool ${i}: name=${t.name}, hasDesc=${!!t.description}`);
    });

    // Check if tools have minimum required fields (name, description)
    const incompleteTool = skill.tools?.find(t => !t.name || !t.description);
    if (incompleteTool) {
      log.info(`Incomplete tool found: ${JSON.stringify(incompleteTool)}`);
      return res.status(400).json({
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool?.name || "unnamed tool",
        missing: !incompleteTool?.name ? "name" : "description"
      });
    }

    // Generate files
    const files = generateExportFiles(skill);

    // Save export
    const version = skill.version || 1;
    await skillsStore.saveExport(solution_id, skillId, version, files);

    // Update skill status
    skill.phase = "EXPORTED";
    await skillsStore.save(skill);

    res.json({
      version,
      files: files.map(f => ({
        name: f.name,
        size: f.content.length,
        preview: f.content.slice(0, 200) + (f.content.length > 200 ? "..." : "")
      })),
      download_url: `/api/export/${skillId}/download/${version}?solution_id=${solution_id}`
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

// Download export as files (returns JSON with file contents)
router.get("/:skillId/download/:version", async (req, res, next) => {
  try {
    const { skillId, version } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const files = await skillsStore.getExport(solution_id, skillId, version);

    res.json({ files });

  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Export not found" });
    }
    next(err);
  }
});

// Preview generated code without saving
router.get("/:skillId/preview", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const files = generateExportFiles(skill);

    res.json({
      files: files.map(f => ({
        name: f.name,
        content: f.content
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
// AGENT-POWERED MCP GENERATION
// ============================================================================

/**
 * POST /api/export/:skillId/mcp/generate
 *
 * Generate a complete MCP server using the Claude Agent SDK.
 * Streams progress events via Server-Sent Events (SSE).
 *
 * This endpoint uses an AI agent to:
 * - Generate fully-implemented tools (not stubs)
 * - Add discovery endpoints
 * - Create proper error handling
 * - Research APIs when needed
 */
router.post("/:skillId/mcp/generate", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { useAgent = "true", solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    log.info(`Generating MCP for skill ${skillId} (solution=${solution_id}, useAgent=${useAgent})`);

    // Load skill
    const skill = await skillsStore.load(solution_id, skillId);

    // Check if tools exist
    if (!skill.tools || skill.tools.length === 0) {
      return res.status(400).json({
        error: "Skill has no tools defined",
        hint: "Add tools to the skill before generating MCP"
      });
    }

    // Check if Agent SDK is available
    const agentAvailable = await isAgentSDKAvailable();

    if (useAgent === "true" && !agentAvailable) {
      log.warn("Agent SDK not available, falling back to simple generation");
    }

    // Prepare output directory
    const version = (skill.version || 0) + 1;
    const outputDir = await skillsStore.getExportPath(solution_id, skillId, version);

    if (useAgent === "true" && agentAvailable) {
      // Use Agent SDK with streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent("start", {
        skillId,
        version,
        toolsCount: skill.tools.length,
        timestamp: new Date().toISOString()
      });

      try {
        for await (const message of generateMCPWithAgent(skill, {
          outputDir,
          onProgress: (msg) => log.info(`[MCPAgent] ${msg}`)
        })) {
          sendEvent("progress", message);

          if (message.type === "complete") {
            // Update skill
            skill.version = version;
            skill.phase = "EXPORTED";
            skill.lastExportedAt = new Date().toISOString();
            skill.lastExportType = "mcp-agent";
            await skillsStore.save(skill);

            sendEvent("complete", {
              version,
              outputDir,
              message: "MCP generation complete"
            });
          }
        }
      } catch (agentErr) {
        log.error(`Agent generation failed: ${agentErr.message}`);
        sendEvent("error", { error: agentErr.message });
      }

      res.end();

    } else {
      // Use simple generation (no agent)
      log.info("Using simple MCP generation (no agent)");

      const files = await generateMCPSimple(skill);

      // Save files
      const fileList = Object.entries(files).map(([name, content]) => ({
        name,
        content
      }));
      await skillsStore.saveExport(solution_id, skillId, version, fileList);

      // Update skill
      skill.version = version;
      skill.phase = "EXPORTED";
      skill.lastExportedAt = new Date().toISOString();
      skill.lastExportType = "mcp-simple";
      await skillsStore.save(skill);

      res.json({
        ok: true,
        version,
        method: "simple",
        files: fileList.map(f => ({
          name: f.name,
          size: f.content.length
        })),
        download_url: `/api/export/${skillId}/download/${version}?solution_id=${solution_id}`
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
 * GET /api/export/:skillId/mcp/status
 *
 * Check if Agent SDK is available and get generation capabilities.
 */
router.get("/:skillId/mcp/status", async (req, res) => {
  const agentAvailable = await isAgentSDKAvailable();

  res.json({
    agentSDKAvailable: agentAvailable,
    capabilities: agentAvailable ? [
      "full-implementation",
      "api-research",
      "error-handling",
      "discovery-endpoints",
      "streaming-progress"
    ] : [
      "stub-implementation",
      "basic-structure"
    ],
    recommendedMethod: agentAvailable ? "agent" : "simple"
  });
});

// ============================================================================
// MCP DEVELOPMENT - AUTONOMOUS (no questions, just generate)
// ============================================================================

/**
 * POST /api/export/:skillId/mcp/develop
 *
 * ONE-SHOT MCP generation. No questions, no sessions to manage.
 *
 * 1. Analyzes skill and infers missing details
 * 2. Generates complete MCP server
 * 3. Returns files
 *
 * User can optionally refine after by calling /mcp/develop/refine
 */
router.post("/:skillId/mcp/develop", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    log.info(`Starting autonomous MCP generation for ${skillId} (solution=${solution_id})`);

    const skill = await skillsStore.load(solution_id, skillId);

    if (!skill.tools || skill.tools.length === 0) {
      return res.status(400).json({
        error: "Skill has no tools defined",
        hint: "Add at least one tool before generating MCP"
      });
    }

    // Create output directory - parse version as integer (handles semver strings like "2.0.0")
    const prevVersion = typeof skill.version === "string" ? parseInt(skill.version, 10) || 0 : (skill.version || 0);
    const version = prevVersion + 1;
    const outputDir = await skillsStore.getExportPath(solution_id, skillId, version);

    // Create session
    const session = new MCPDevelopmentSession(skill, {
      outputDir,
      onProgress: (msg) => log.info(`[MCPDev] ${JSON.stringify(msg)}`)
    });

    // Analyze and enrich (no questions - just infer)
    const enrichment = session.analyzeAndEnrich();
    log.info(`Enriched ${enrichment.toolsCount} tools with inferences`);

    // Store session for potential refinement
    const sessionId = `${skillId}_${Date.now()}`;
    activeSessions.set(sessionId, { session, skillId, solutionId: solution_id, version });

    // Set up SSE streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("start", {
      sessionId,
      skillId,
      version,
      toolsCount: skill.tools.length,
      inferences: enrichment.inferences,
      message: "Starting generation (no questions - we figured it out!)"
    });

    try {
      for await (const event of session.generate()) {
        sendEvent("progress", event);

        if (event.type === "complete") {
          // Update skill
          skill.version = version;
          skill.phase = "EXPORTED";
          skill.lastExportedAt = new Date().toISOString();
          skill.lastExportType = "mcp-autonomous";
          await skillsStore.save(skill);

          sendEvent("complete", {
            sessionId,
            version,
            files: event.files,
            validation: event.validation,
            download_url: `/api/export/${skillId}/download/${version}?solution_id=${solution_id}`,
            message: "MCP generated! Use /mcp/develop/refine if you want changes."
          });
        }
      }
    } catch (genErr) {
      log.error(`Generation failed: ${genErr.message}`);
      sendEvent("error", { error: genErr.message });
    }

    res.end();

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * POST /api/export/:skillId/mcp/develop/refine
 *
 * Refine a previously generated MCP based on feedback.
 * Just tell us what to change, we'll do it.
 */
router.post("/:skillId/mcp/develop/refine", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { sessionId, feedback, solution_id } = req.body;
    const log = req.app.locals.log;

    if (!feedback) {
      return res.status(400).json({
        error: "No feedback provided",
        hint: "Tell us what to change, e.g., 'Add retry logic to API calls'"
      });
    }

    // Find or recreate session
    let session, version, solutionId;

    if (sessionId && activeSessions.has(sessionId)) {
      ({ session, version, solutionId } = activeSessions.get(sessionId));
    } else {
      // No session - need solution_id to create one from the latest export
      if (!solution_id) {
        return res.status(400).json({ error: "solution_id is required when no session exists" });
      }
      solutionId = solution_id;

      // No session - create one from the latest export
      const skill = await skillsStore.load(solutionId, skillId);
      version = skill.version || 1;
      const outputDir = await skillsStore.getExportPath(solutionId, skillId, version);

      session = new MCPDevelopmentSession(skill, {
        outputDir,
        onProgress: (msg) => log.info(`[MCPDev] ${JSON.stringify(msg)}`)
      });

      // Load existing files
      try {
        const existingFiles = await skillsStore.getExport(solutionId, skillId, version);
        session.generatedFiles = existingFiles.map(f => f.name);
      } catch {
        return res.status(400).json({
          error: "No previous generation found",
          hint: "Generate first with POST /mcp/develop"
        });
      }
    }

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("start", {
      skillId,
      version,
      feedback,
      message: "Applying your changes..."
    });

    try {
      for await (const event of session.refine(feedback)) {
        sendEvent("progress", event);

        if (event.type === "complete" || event.type === "refinement_complete") {
          sendEvent("complete", {
            version,
            files: session.generatedFiles,
            validation: session.validationResults,
            download_url: `/api/export/${skillId}/download/${version}?solution_id=${solutionId}`
          });
        }
      }
    } catch (refineErr) {
      log.error(`Refinement failed: ${refineErr.message}`);
      sendEvent("error", { error: refineErr.message });
    }

    res.end();

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:skillId/mcp/develop/preview
 *
 * Preview what will be inferred before generating.
 * Shows the inferences without actually generating.
 */
router.get("/:skillId/mcp/develop/preview", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const analysis = analyzeSkillForMCP(skill);

    res.json({
      skillId,
      skillName: skill.name,
      ready: analysis.ready,
      toolsCount: analysis.toolsCount,
      inferences: analysis.inferences,
      summary: analysis.summary,
      message: analysis.ready
        ? "Ready to generate! Call POST /mcp/develop to start."
        : "Add some tools first."
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

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
    const { deploy, adasUrl, solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    log.info(`Exporting skill ${skillId} (solution=${solution_id}) to ADAS Core format`);

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
      const targetUrl = adasUrl || process.env.ADAS_CORE_URL || "http://ai-dev-assistant-backend-1:4000";
      const importUrl = `${targetUrl}/api/skills/import`;

      log.info(`Deploying to ADAS Core: ${importUrl}`);

      try {
        const tenantHeader = (process.env.SB_TENANT || 'main').trim().toLowerCase();
        const response = await fetch(importUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-ADAS-TENANT": tenantHeader },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          return res.status(response.status).json({
            error: "ADAS Core import failed",
            details: result
          });
        }

        // Update skill status
        skill.phase = "DEPLOYED";
        skill.deployedAt = new Date().toISOString();
        skill.deployedTo = targetUrl;
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
// GENERIC NODE.JS MCP TEMPLATE (not tied to any skill)
// ============================================================================

/**
 * GET /api/export/mcp/template/generic
 *
 * Download a generic/blank Node.js MCP template as a reference starting point.
 * No skill or solution required.
 */
router.get("/mcp/template/generic", async (_req, res, next) => {
  try {
    const files = generateGenericTemplate();
    res.json({
      ok: true,
      method: "generic-node-mcp-template",
      files: files.map(f => ({
        name: f.name,
        content: f.content,
        size: f.content.length
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// NODE.JS MCP TEMPLATE EXPORT (from specific skill)
// ============================================================================

/**
 * POST /api/export/:skillId/mcp/template
 *
 * Generate a Node.js MCP template from the skill's tool definitions.
 * Returns file listing with download URL.
 */
router.post("/:skillId/mcp/template", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);

    if (!skill.tools?.length) {
      return res.status(400).json({ error: "Skill has no tools defined" });
    }

    const incompleteTool = skill.tools.find(t => !t.name || !t.description);
    if (incompleteTool) {
      return res.status(400).json({
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool?.name || "unnamed tool",
        missing: !incompleteTool?.name ? "name" : "description"
      });
    }

    log.info(`[export] Generating Node.js MCP template for skill ${skillId}`);

    const files = generateNodeMCPFiles(skill);

    // Save as a new export version
    const version = (skill.version || 0) + 1;
    skill.version = version;
    await skillsStore.saveExport(solution_id, skillId, version, files);

    skill.phase = "EXPORTED";
    await skillsStore.save(skill);

    res.json({
      ok: true,
      version,
      method: "node-mcp-template",
      files: files.map(f => ({
        name: f.name,
        size: f.content.length,
        preview: f.content.slice(0, 200) + (f.content.length > 200 ? "..." : "")
      })),
      download_url: `/api/export/${skillId}/download/${version}?solution_id=${solution_id}`
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:skillId/mcp/template/preview
 *
 * Preview Node.js MCP template files without saving.
 */
router.get("/:skillId/mcp/template/preview", async (req, res, next) => {
  try {
    const { skillId } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    const skill = await skillsStore.load(solution_id, skillId);
    const files = generateNodeMCPFiles(skill);

    res.json({
      ok: true,
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
 * Helper to get skillSlug from skill
 * ADAS Core requires: /^[a-z0-9]+(-[a-z0-9]+)*$/
 */
function getSkillSlug(skill, skillId) {
  let slug;

  if (skill.name) {
    // Slugify the skill name: "Identity Assurance Manager" -> "identity-assurance-manager"
    slug = skill.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  } else if (skill.original_skill_id) {
    slug = skill.original_skill_id.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  } else {
    slug = skillId.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  // Final cleanup
  return slug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

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

// Store running MCP processes
const runningMCPs = new Map();

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
