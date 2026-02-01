import { Router } from "express";
import domainsStore from "../store/domains.js";
import { generateExportFiles, generateAdasExportPayload, generateAdasExportFiles } from "../services/export.js";
import { provisionSkillActor, listTriggers, toggleTrigger, getTriggerHistory } from "../services/cpAdminBridge.js";
import { generateMCPWithAgent, generateMCPSimple, isAgentSDKAvailable } from "../services/mcpGenerationAgent.js";
import { MCPDevelopmentSession, analyzeDomainForMCP, MCP_DEV_PHASES } from "../services/mcpDevelopmentAgent.js";
import { syncConnectorToADAS, startConnectorInADAS } from "../services/adasConnectorSync.js";
import { PREBUILT_CONNECTORS, getAllPrebuiltConnectors } from "./connectors.js";

// Store active development sessions (in production, use Redis or similar)
const activeSessions = new Map();

/**
 * Deploy a skill MCP to ADAS Core (shared logic used by both the HTTP route and deploy-all).
 * Reads the generated MCP files, sends to ADAS Core, and syncs linked connectors.
 *
 * @param {string} domainId - Domain ID to deploy
 * @param {object} log - Logger (console-compatible)
 * @returns {Promise<object>} Deploy result
 */
export async function deploySkillToADAS(domainId, log, onProgress) {
  const domain = await domainsStore.load(domainId);
  let version = domain.version;

  if (!version) {
    throw Object.assign(new Error('No MCP export found'), { code: 'NO_EXPORT' });
  }

  log.info(`[MCP Deploy] Starting deploy for ${domainId} (version ${version})`);

  const exportPath = await domainsStore.getExportPath(domainId, version);
  const fs = await import('fs/promises');
  const path = await import('path');
  let files = await fs.readdir(exportPath);
  let serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');

  // Auto-generate MCP if server.py is missing
  if (!serverFile) {
    log.info(`[MCP Deploy] No server.py in export for ${domainId} — auto-generating MCP`);
    if (onProgress) onProgress('generating_mcp', 'Generating MCP...');

    try {
      const genFiles = await generateMCPSimple(domain);
      const fileList = Object.entries(genFiles).map(([name, content]) => ({ name, content }));
      await domainsStore.saveExport(domainId, version, fileList);

      domain.phase = "EXPORTED";
      domain.lastExportedAt = new Date().toISOString();
      domain.lastExportType = "mcp-simple";
      await domainsStore.save(domain);

      log.info(`[MCP Deploy] Auto-generated MCP for ${domainId}: ${fileList.map(f => f.name).join(', ')}`);

      // Re-read after generation
      files = await fs.readdir(exportPath);
      serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');
    } catch (genErr) {
      log.error(`[MCP Deploy] MCP generation failed for ${domainId}: ${genErr.message}`);
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

  const skillSlug = domain.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || domainId;
  const adasUrl = process.env.ADAS_CORE_URL || "http://ai-dev-assistant-backend-1:4000";
  const deployUrl = `${adasUrl}/api/skills/deploy-mcp`;

  log.info(`[MCP Deploy] Sending to ADAS Core: ${deployUrl}`);

  const response = await fetch(deployUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillSlug, mcpServer, requirements }),
    signal: AbortSignal.timeout(120000) // 2 min timeout
  });

  const result = await response.json();

  if (!response.ok) {
    log.error(`[MCP Deploy] ADAS Core deployment failed: ${JSON.stringify(result)}`);
    throw new Error(result.error || `Deploy failed: ${response.status}`);
  }

  // Update domain status
  domain.phase = "DEPLOYED";
  domain.deployedAt = new Date().toISOString();
  domain.deployedTo = adasUrl;
  domain.mcpUri = result.mcpUri;
  domain.connectorId = result.connectorId;
  await domainsStore.save(domain);

  log.info(`[MCP Deploy] Successfully deployed! Skill: ${skillSlug}, MCP: ${result.mcpUri}`);

  // Sync linked connectors
  const connectorResults = [];
  const linkedConnectors = domain.connectors || [];

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
        await syncConnectorToADAS({
          id: connectorId, name: connector.name, type: 'mcp',
          transport: isStdio ? 'stdio' : 'http', endpoint: connector.endpoint,
          config: isStdio ? { command: connector.command, args: connector.args || [], env: connector.envDefaults || connector.env || {} } : undefined,
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
 * GET /api/export/mcps
 *
 * List all skills that have generated MCP exports.
 * Returns skills with their version info and export status.
 */
router.get("/mcps", async (req, res, next) => {
  try {
    const log = req.app.locals.log;
    log.info("Listing all skill MCP exports");

    // Get all domains
    const domains = await domainsStore.list();

    // Filter and enrich with export info
    const skillMcps = [];

    for (const domainSummary of domains) {
      try {
        const domain = await domainsStore.load(domainSummary.id);

        // Include skills with MCP exports OR deployed via "Deploy to ADAS" (JS path)
        const hasMcpExport = domain.version && domain.lastExportType?.startsWith('mcp');
        const isDeployed = domain.phase === "DEPLOYED" && domain.deployedAt;
        if (hasMcpExport || isDeployed) {
          // Get export files
          let exportFiles = [];
          try {
            exportFiles = await domainsStore.getExport(domain.id, domain.version);
          } catch {
            // No export files found
          }

          // Extract description from problem statement or identity
          const description = domain.problem?.statement ||
                             domain.identity?.role_description ||
                             `MCP server for ${domain.name}`;

          // Include full tool details
          const tools = (domain.tools || []).map(t => ({
            name: t.name,
            description: t.description || 'No description',
            parameters: t.parameters || [],
            returns: t.returns || { type: 'any' },
            policy: t.policy || {}
          }));

          skillMcps.push({
            id: domain.id,
            name: domain.name,
            description,
            version: domain.version,
            exportType: domain.lastExportType || (isDeployed ? "adas-js" : null),
            exportedAt: domain.lastExportedAt || domain.deployedAt,
            phase: domain.phase,
            toolsCount: tools.length,
            tools,
            files: exportFiles.map(f => ({ name: f.name, size: f.content?.length || 0 })),
            hasServerPy: exportFiles.some(f => f.name === 'server.py' || f.name === 'mcp_server.py'),
            downloadUrl: `/api/export/${domain.id}/download/${domain.version}`
          });
        }
      } catch (err) {
        // Skip domains that fail to load
        log.warn(`Failed to load domain ${domainSummary.id}: ${err.message}`);
      }
    }

    res.json({
      mcps: skillMcps.sort((a, b) => new Date(b.exportedAt) - new Date(a.exportedAt))
    });

  } catch (err) {
    next(err);
  }
});

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
// AGENT-POWERED MCP GENERATION
// ============================================================================

/**
 * POST /api/export/:domainId/mcp/generate
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
router.post("/:domainId/mcp/generate", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const { useAgent = "true" } = req.query;
    const log = req.app.locals.log;

    log.info(`Generating MCP for domain ${domainId} (useAgent=${useAgent})`);

    // Load domain
    const domain = await domainsStore.load(domainId);

    // Check if tools exist
    if (!domain.tools || domain.tools.length === 0) {
      return res.status(400).json({
        error: "Domain has no tools defined",
        hint: "Add tools to the domain before generating MCP"
      });
    }

    // Check if Agent SDK is available
    const agentAvailable = await isAgentSDKAvailable();

    if (useAgent === "true" && !agentAvailable) {
      log.warn("Agent SDK not available, falling back to simple generation");
    }

    // Prepare output directory
    const version = (domain.version || 0) + 1;
    const outputDir = await domainsStore.getExportPath(domainId, version);

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
        domainId,
        version,
        toolsCount: domain.tools.length,
        timestamp: new Date().toISOString()
      });

      try {
        for await (const message of generateMCPWithAgent(domain, {
          outputDir,
          onProgress: (msg) => log.info(`[MCPAgent] ${msg}`)
        })) {
          sendEvent("progress", message);

          if (message.type === "complete") {
            // Update domain
            domain.version = version;
            domain.phase = "EXPORTED";
            domain.lastExportedAt = new Date().toISOString();
            domain.lastExportType = "mcp-agent";
            await domainsStore.save(domain);

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

      const files = await generateMCPSimple(domain);

      // Save files
      const fileList = Object.entries(files).map(([name, content]) => ({
        name,
        content
      }));
      await domainsStore.saveExport(domainId, version, fileList);

      // Update domain
      domain.version = version;
      domain.phase = "EXPORTED";
      domain.lastExportedAt = new Date().toISOString();
      domain.lastExportType = "mcp-simple";
      await domainsStore.save(domain);

      res.json({
        ok: true,
        version,
        method: "simple",
        files: fileList.map(f => ({
          name: f.name,
          size: f.content.length
        })),
        download_url: `/api/export/${domainId}/download/${version}`
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
 * GET /api/export/:domainId/mcp/status
 *
 * Check if Agent SDK is available and get generation capabilities.
 */
router.get("/:domainId/mcp/status", async (req, res) => {
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
 * POST /api/export/:domainId/mcp/develop
 *
 * ONE-SHOT MCP generation. No questions, no sessions to manage.
 *
 * 1. Analyzes domain and infers missing details
 * 2. Generates complete MCP server
 * 3. Returns files
 *
 * User can optionally refine after by calling /mcp/develop/refine
 */
router.post("/:domainId/mcp/develop", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    log.info(`Starting autonomous MCP generation for ${domainId}`);

    const domain = await domainsStore.load(domainId);

    if (!domain.tools || domain.tools.length === 0) {
      return res.status(400).json({
        error: "Domain has no tools defined",
        hint: "Add at least one tool before generating MCP"
      });
    }

    // Create output directory - parse version as integer (handles semver strings like "2.0.0")
    const prevVersion = typeof domain.version === "string" ? parseInt(domain.version, 10) || 0 : (domain.version || 0);
    const version = prevVersion + 1;
    const outputDir = await domainsStore.getExportPath(domainId, version);

    // Create session
    const session = new MCPDevelopmentSession(domain, {
      outputDir,
      onProgress: (msg) => log.info(`[MCPDev] ${JSON.stringify(msg)}`)
    });

    // Analyze and enrich (no questions - just infer)
    const enrichment = session.analyzeAndEnrich();
    log.info(`Enriched ${enrichment.toolsCount} tools with inferences`);

    // Store session for potential refinement
    const sessionId = `${domainId}_${Date.now()}`;
    activeSessions.set(sessionId, { session, domainId, version });

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
      domainId,
      version,
      toolsCount: domain.tools.length,
      inferences: enrichment.inferences,
      message: "Starting generation (no questions - we figured it out!)"
    });

    try {
      for await (const event of session.generate()) {
        sendEvent("progress", event);

        if (event.type === "complete") {
          // Update domain
          domain.version = version;
          domain.phase = "EXPORTED";
          domain.lastExportedAt = new Date().toISOString();
          domain.lastExportType = "mcp-autonomous";
          await domainsStore.save(domain);

          sendEvent("complete", {
            sessionId,
            version,
            files: event.files,
            validation: event.validation,
            download_url: `/api/export/${domainId}/download/${version}`,
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
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

/**
 * POST /api/export/:domainId/mcp/develop/refine
 *
 * Refine a previously generated MCP based on feedback.
 * Just tell us what to change, we'll do it.
 */
router.post("/:domainId/mcp/develop/refine", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const { sessionId, feedback } = req.body;
    const log = req.app.locals.log;

    if (!feedback) {
      return res.status(400).json({
        error: "No feedback provided",
        hint: "Tell us what to change, e.g., 'Add retry logic to API calls'"
      });
    }

    // Find or recreate session
    let session, version;

    if (sessionId && activeSessions.has(sessionId)) {
      ({ session, version } = activeSessions.get(sessionId));
    } else {
      // No session - create one from the latest export
      const domain = await domainsStore.load(domainId);
      version = domain.version || 1;
      const outputDir = await domainsStore.getExportPath(domainId, version);

      session = new MCPDevelopmentSession(domain, {
        outputDir,
        onProgress: (msg) => log.info(`[MCPDev] ${JSON.stringify(msg)}`)
      });

      // Load existing files
      try {
        const existingFiles = await domainsStore.getExport(domainId, version);
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
      domainId,
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
            download_url: `/api/export/${domainId}/download/${version}`
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
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

/**
 * GET /api/export/:domainId/mcp/develop/preview
 *
 * Preview what will be inferred before generating.
 * Shows the inferences without actually generating.
 */
router.get("/:domainId/mcp/develop/preview", async (req, res, next) => {
  try {
    const { domainId } = req.params;

    const domain = await domainsStore.load(domainId);
    const analysis = analyzeDomainForMCP(domain);

    res.json({
      domainId,
      domainName: domain.name,
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

// ============================================================================
// MCP SERVER RUNTIME MANAGEMENT
// ============================================================================

// Store running MCP processes
const runningMCPs = new Map();

/**
 * POST /api/export/:domainId/mcp/run
 *
 * Start the generated MCP server.
 * Returns the server status and port.
 */
router.post("/:domainId/mcp/run", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    // Check if already running
    if (runningMCPs.has(domainId)) {
      const existing = runningMCPs.get(domainId);
      return res.json({
        ok: true,
        status: 'already_running',
        pid: existing.pid,
        port: existing.port,
        startedAt: existing.startedAt
      });
    }

    const domain = await domainsStore.load(domainId);
    const version = domain.version;

    if (!version) {
      return res.status(400).json({
        error: "No MCP export found",
        hint: "Generate an MCP first using the Export dialog"
      });
    }

    // Get export path
    const exportPath = await domainsStore.getExportPath(domainId, version);

    log.info(`Starting MCP server for ${domainId} from ${exportPath}`);

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
      log.info(`[MCP:${domainId}] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
      log.warn(`[MCP:${domainId}] ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      log.error(`[MCP:${domainId}] Process error: ${err.message}`);
      runningMCPs.delete(domainId);
    });

    proc.on('exit', (code) => {
      log.info(`[MCP:${domainId}] Process exited with code ${code}`);
      runningMCPs.delete(domainId);
    });

    // Store process info
    const mcpInfo = {
      pid: proc.pid,
      port: basePort,
      startedAt: new Date().toISOString(),
      process: proc,
      domainId,
      version
    };
    runningMCPs.set(domainId, mcpInfo);

    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check if still running
    if (!runningMCPs.has(domainId)) {
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
      return res.status(404).json({ error: "Domain not found" });
    }
    next(err);
  }
});

/**
 * POST /api/export/:domainId/mcp/stop
 *
 * Stop the running MCP server.
 */
router.post("/:domainId/mcp/stop", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    if (!runningMCPs.has(domainId)) {
      return res.json({
        ok: true,
        status: 'not_running'
      });
    }

    const mcpInfo = runningMCPs.get(domainId);
    log.info(`Stopping MCP server for ${domainId} (pid: ${mcpInfo.pid})`);

    mcpInfo.process.kill('SIGTERM');
    runningMCPs.delete(domainId);

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
 * GET /api/export/:domainId/mcp/status
 *
 * Get MCP server running status.
 */
router.get("/:domainId/mcp/running", async (req, res) => {
  const { domainId } = req.params;

  if (runningMCPs.has(domainId)) {
    const info = runningMCPs.get(domainId);
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
 * POST /api/export/:domainId/mcp/deploy
 *
 * ONE-CLICK DEPLOY: Start MCP server + Register with ADAS Core
 *
 * This is the CLEAN pure-MCP deploy flow:
 * 1. Start the generated MCP server locally
 * 2. Register MCP URI with ADAS Core via /api/skills/install-mcp
 * 3. Skill is now available in ADAS Core (loaded fresh from MCP)
 */
router.post("/:domainId/mcp/deploy", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    const result = await deploySkillToADAS(domainId, log);
    return res.json(result);

  } catch (err) {
    if (err.code === 'NO_EXPORT') {
      return res.status(400).json({ error: err.message, hint: "Generate an MCP first using the Export dialog" });
    }
    if (err.code === 'NO_SERVER') {
      return res.status(400).json({ error: err.message, hint: "Generate MCP first" });
    }
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Domain not found" });
    }
    if (err.message?.includes('Failed to fetch') || err.message?.includes('fetch failed')) {
      return res.status(502).json({ error: "Failed to connect to ADAS Core", details: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/export/:domainId/files/:version/:filename
 *
 * Get content of a specific export file.
 */
router.get("/:domainId/files/:version/:filename", async (req, res, next) => {
  try {
    const { domainId, version, filename } = req.params;

    const files = await domainsStore.getExport(domainId, version);
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
