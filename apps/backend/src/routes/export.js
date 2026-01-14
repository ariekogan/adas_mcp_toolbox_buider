import { Router } from "express";
import domainsStore from "../store/domains.js";
import { generateExportFiles, generateAdasExportPayload, generateAdasExportFiles } from "../services/export.js";

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

    // If deploy=true, send to ADAS Core
    if (deploy === "true") {
      const targetUrl = adasUrl || process.env.ADAS_CORE_URL || "http://adas-backend:4000";
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

export default router;
