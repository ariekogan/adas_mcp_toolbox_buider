import { Router } from "express";
import store from "../store/projects.js";
import { generateExportFiles } from "../services/export.js";

const router = Router();

// Export project as MCP server
router.get("/:projectId", async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const log = req.app.locals.log;
    
    log.info(`Exporting project ${projectId}`);
    
    // Load project
    const { toolbox } = await store.load(projectId);
    
    // Check if ready to export
    const incompleteTool = toolbox.tools?.find(t => t.status !== "COMPLETE");
    if (incompleteTool) {
      return res.status(400).json({ 
        error: "Not all tools are complete",
        incomplete_tool: incompleteTool.name
      });
    }
    
    // Generate files
    const files = generateExportFiles(toolbox);
    
    // Save export
    const version = toolbox.version || 1;
    await store.saveExport(projectId, version, files);
    
    // Update toolbox status
    toolbox.status = "EXPORTED";
    await store.saveToolbox(projectId, toolbox);
    
    res.json({
      version,
      files: files.map(f => ({ 
        name: f.name, 
        size: f.content.length,
        preview: f.content.slice(0, 200) + (f.content.length > 200 ? "..." : "")
      })),
      download_url: `/api/export/${projectId}/download/${version}`
    });
    
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Project not found" });
    }
    next(err);
  }
});

// Download export as files (returns JSON with file contents)
router.get("/:projectId/download/:version", async (req, res, next) => {
  try {
    const { projectId, version } = req.params;
    
    const files = await store.getExport(projectId, Number(version));
    
    res.json({ files });
    
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Export not found" });
    }
    next(err);
  }
});

// Preview generated code without saving
router.get("/:projectId/preview", async (req, res, next) => {
  try {
    const { projectId } = req.params;
    
    const { toolbox } = await store.load(projectId);
    const files = generateExportFiles(toolbox);
    
    res.json({
      files: files.map(f => ({
        name: f.name,
        content: f.content
      }))
    });
    
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Project not found" });
    }
    next(err);
  }
});

export default router;
