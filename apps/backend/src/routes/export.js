import { Router } from "express";
import skillsStore from "../store/skills.js";
import solutionsStore from "../store/solutions.js";
import { generateExportFiles } from "../services/export.js";
import { getAllPrebuiltConnectors } from "./connectors.js";
import { generateAllConnectorFiles } from "../services/exportConnectorTemplate.js";
import { createTarGzStream } from "../services/exportBundle.js";
import mcpGenRouter from "./exportMcpGen.js";
import runtimeRouter from "./exportRuntime.js";


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

// Download export as tar.gz bundle (skill + connectors + README)
// NOTE: Must be registered BEFORE /:skillId/download/:version to avoid route shadowing
router.get("/:skillId/download/:version/bundle", async (req, res, next) => {
  try {
    const { skillId, version } = req.params;
    const { solution_id } = req.query;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id query param is required" });
    }

    // Load skill for connector metadata
    const skill = await skillsStore.load(solution_id, skillId);

    // Get saved export files
    const exportedFiles = await skillsStore.getExport(solution_id, skillId, version);

    // Generate connector templates (not in saved export)
    const connectorFiles = generateAllConnectorFiles(skill);

    // Merge: exported files + connector templates (avoid duplicates)
    const allFiles = [...exportedFiles];
    for (const cf of connectorFiles) {
      if (!allFiles.some(f => f.name === cf.name)) {
        allFiles.push(cf);
      }
    }

    // Create archive name
    const slug = (skill.name || 'skill')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const archiveName = `${slug}-mcp-v${version}`;

    // Stream tar.gz
    const archive = createTarGzStream(allFiles, archiveName);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}.tar.gz"`);

    archive.on('error', (err) => {
      req.app.locals.log?.error(`[Bundle] Archive error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });

    archive.pipe(res);

  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Export not found" });
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
// SUB-ROUTERS
// ============================================================================

router.use("/", mcpGenRouter);
router.use("/", runtimeRouter);

export default router;
