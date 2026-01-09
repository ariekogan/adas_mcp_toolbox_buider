import { Router } from "express";
import store from "../store/projects.js";

const router = Router();

// List all projects
router.get("/", async (req, res, next) => {
  try {
    const projects = await store.list();
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

// Create new project
router.post("/", async (req, res, next) => {
  try {
    const { name, settings } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }
    
    const result = await store.create(name, settings);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Get project by ID
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await store.load(id);
    res.json(result);
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Project not found" });
    }
    next(err);
  }
});

// Update project settings
router.patch("/:id/settings", async (req, res, next) => {
  try {
    const { id } = req.params;
    const settings = req.body;
    
    const project = await store.updateSettings(id, settings);
    res.json({ project });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Project not found" });
    }
    next(err);
  }
});

// Delete project
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await store.remove(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
