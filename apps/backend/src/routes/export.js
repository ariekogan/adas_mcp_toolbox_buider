import { Router } from "express";
import domainsStore from "../store/domains.js";
import { generateExportFiles } from "../services/export.js";

const router = Router();

// Export domain as MCP server
router.get("/:domainId", async (req, res, next) => {
  try {
    const { domainId } = req.params;
    const log = req.app.locals.log;

    log.info(`Exporting domain ${domainId}`);

    // Load domain
    const domain = await domainsStore.load(domainId);

    // Check if ready to export
    const incompleteTool = domain.tools?.find(t => t.status !== "COMPLETE");
    if (incompleteTool) {
      return res.status(400).json({
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool.name
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

    const files = await domainsStore.getExport(domainId, Number(version));

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

export default router;
