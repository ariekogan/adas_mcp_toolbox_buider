import { Router } from "express";
import store from "../store/projects.js";
import { processMessage } from "../services/conversation.js";
import { applyStateUpdate, calculateProgress } from "../services/state.js";

const router = Router();

// Send chat message
router.post("/", async (req, res, next) => {
  try {
    const { project_id, message, ui_focus } = req.body;
    const log = req.app.locals.log;
    
    if (!project_id) {
      return res.status(400).json({ error: "project_id is required" });
    }
    
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    
    log.debug(`Chat request for project ${project_id}`);
    
    // Load project data
    let data;
    try {
      data = await store.load(project_id);
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "Project not found" });
      }
      throw err;
    }
    
    const { project, toolbox, conversation } = data;
    
    // Save user message
    await store.appendMessage(project_id, {
      role: "user",
      content: message
    });
    
    // Process with LLM
    log.debug("Sending to LLM...");
    const response = await processMessage({
      project,
      toolbox,
      conversation,
      userMessage: message,
      uiFocus: ui_focus
    });
    
    log.debug("LLM response received", { usage: response.usage });
    
    // Apply state updates
    let updatedToolbox = toolbox;
    if (response.stateUpdate && Object.keys(response.stateUpdate).length > 0) {
      log.debug("Applying state updates", response.stateUpdate);
      updatedToolbox = applyStateUpdate(toolbox, response.stateUpdate);
      await store.saveToolbox(project_id, updatedToolbox);
    }
    
    // Save assistant message
    await store.appendMessage(project_id, {
      role: "assistant",
      content: response.message
    });
    
    // Calculate progress
    const progress = calculateProgress(updatedToolbox);
    
    res.json({
      message: response.message,
      toolbox: updatedToolbox,
      suggested_focus: response.suggestedFocus,
      progress,
      usage: response.usage
    });
    
  } catch (err) {
    req.app.locals.log.error("Chat error:", err);
    next(err);
  }
});

// Get initial greeting (for new conversations)
router.get("/greeting", async (req, res) => {
  res.json({
    message: `Hi! I'm here to help you build a custom AI toolbox.

A toolbox is a set of tools that an AI assistant (like Claude) can use to help you with specific tasks.

For example, someone might build a toolbox for:
- Managing customer emails automatically
- Tracking expenses and generating reports
- Scheduling appointments

What problem would YOU like to solve?`
  });
});

export default router;
