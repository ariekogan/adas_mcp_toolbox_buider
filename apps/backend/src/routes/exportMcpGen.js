import { Router } from "express";
import skillsStore from "../store/skills.js";
import { generateMCPWithAgent, generateMCPSimple, isAgentSDKAvailable } from "../services/mcpGenerationAgent.js";
import { MCPDevelopmentSession, analyzeSkillForMCP } from "../services/mcpDevelopmentAgent.js";
import { generateNodeMCPFiles, generateGenericTemplate } from "../services/exportNodeMCP.js";

// In-memory session store (in production, use Redis or similar)
const activeSessions = new Map();

const router = Router();

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

export default router;
