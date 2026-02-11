import { Router } from "express";
import skillsStore from "../store/skills.js";
import { processMessage } from "../services/conversation.js";
import { applyStateUpdateWithValidation, calculateProgress, shouldSuggestPhaseAdvance } from "../services/state.js";
import { digestFileContent, getFileType } from "../services/fileDigestion.js";
import { getHelpDoc, formatHelpDoc } from "../data/helpDocs.js";
import { enhanceWithStateContext } from "../services/stateSync.js";
import { getAllPrebuiltConnectors } from "./connectors.js";

const router = Router();

/**
 * Detect if message is an "explain" request and extract topic
 * @param {string} message - User message
 * @returns {string|null} - Topic to explain, or null if not an explain request
 */
function detectExplainRequest(message) {
  // Pattern: "Tell me about the "X" section - what's the current status..."
  const explainPattern = /Tell me about the ["']([^"']+)["'] section/i;
  const match = message.match(explainPattern);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Enhance explain message with system documentation
 * @param {string} message - Original user message
 * @param {string} topic - Topic to explain
 * @returns {string} - Enhanced message with documentation
 */
function enhanceExplainMessage(message, topic) {
  const helpDoc = getHelpDoc(topic);
  if (!helpDoc) {
    return message;
  }

  const formattedDoc = formatHelpDoc(helpDoc);

  return `${message}

---
**SYSTEM DOCUMENTATION FOR THIS TOPIC:**

${formattedDoc}
---

Use the documentation above to explain this section in the context of the current skill being built. Be specific about how the current settings/values affect this particular skill. Make recommendations based on what's already defined (problem, tools, intents, etc.).`;
}

/**
 * Send chat message for a skill
 * POST /api/chat/skill
 *
 * Body: { solution_id: string, skill_id: string, message: string, ui_focus?: object }
 */
router.post("/skill", async (req, res, next) => {
  try {
    const { solution_id, skill_id, message, ui_focus } = req.body;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id is required" });
    }

    if (!skill_id) {
      return res.status(400).json({ error: "skill_id is required" });
    }

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    log.debug(`Skill chat request for ${skill_id} in solution ${solution_id}`);

    // Load skill
    let skill;
    try {
      skill = await skillsStore.load(solution_id, skill_id);
    } catch (err) {
      if (err.message?.includes('not found') || err.code === "ENOENT") {
        return res.status(404).json({ error: "Skill not found" });
      }
      throw err;
    }

    // Ensure conversation array exists (safety net)
    if (!Array.isArray(skill.conversation)) {
      skill.conversation = [];
    }

    // Save user message to skill conversation (original message)
    skill.conversation.push({
      id: `msg_${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date().toISOString()
    });

    // Check if this is an explain request and enhance with documentation
    let processedMessage = message;
    const explainTopic = detectExplainRequest(message);
    if (explainTopic) {
      log.debug(`Detected explain request for topic: ${explainTopic}`);
      const helpDoc = getHelpDoc(explainTopic);
      log.debug(`Help doc found: ${helpDoc ? helpDoc.title : 'NOT FOUND'}`);
      processedMessage = enhanceExplainMessage(message, explainTopic);
      log.debug(`Enhanced message length: ${processedMessage.length} chars`);
    }

    // State context injection - keeps AI aligned with current entity names
    try {
      const enhanced = enhanceWithStateContext(processedMessage, skill);
      if (enhanced !== processedMessage) {
        processedMessage = enhanced;
        log.debug("State context injected into message");
      }
    } catch (stateSyncErr) {
      log.warn("State sync failed (non-blocking):", stateSyncErr.message);
    }

    // Process with LLM (using skill format)
    log.debug("Sending to LLM (skill format)...");
    const response = await processMessage({
      skill,
      userMessage: processedMessage,
      uiFocus: ui_focus
    });

    log.debug("LLM response received", { usage: response.usage });

    // Enrich DAL-created tools with MCP source info for ui_capable connectors
    // The DAL generates ui.* tools from prompt instructions without source metadata
    if (response.stateUpdate?.tools_push) {
      const catalog = getAllPrebuiltConnectors();
      const uiConnectorIds = (skill.connectors || []).filter(id => catalog[id]?.ui_capable);
      if (uiConnectorIds.length > 0) {
        const tools = Array.isArray(response.stateUpdate.tools_push)
          ? response.stateUpdate.tools_push
          : [response.stateUpdate.tools_push];
        for (const tool of tools) {
          if (tool.name?.startsWith('ui.') && !tool.source) {
            tool.source = {
              type: 'mcp_bridge',
              connection_id: uiConnectorIds[0],
              mcp_tool: tool.name
            };
          }
        }
      }
    }

    // Apply state updates with validation
    let updatedSkill = skill;
    if (response.stateUpdate && Object.keys(response.stateUpdate).length > 0) {
      log.debug("Applying state updates", response.stateUpdate);
      updatedSkill = applyStateUpdateWithValidation(skill, response.stateUpdate);
    }

    // Backfill source on existing ui.* tools missing it (from earlier DAL sessions)
    if (updatedSkill.tools?.length && updatedSkill.connectors?.length) {
      const catalog = getAllPrebuiltConnectors();
      const uiConnId = updatedSkill.connectors.find(id => catalog[id]?.ui_capable);
      if (uiConnId) {
        for (const tool of updatedSkill.tools) {
          if (tool.name?.startsWith('ui.') && !tool.source) {
            tool.source = {
              type: 'mcp_bridge',
              connection_id: uiConnId,
              mcp_tool: tool.name
            };
          }
        }
      }
    }

    // Save assistant message to skill conversation
    updatedSkill.conversation.push({
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: response.message,
      timestamp: new Date().toISOString(),
      state_update: response.stateUpdate,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint
    });

    // Save updated skill
    await skillsStore.save(updatedSkill);

    // Calculate progress from validation completeness
    const progress = calculateProgress(updatedSkill);

    // Check if we should suggest phase advancement
    const phaseSuggestion = shouldSuggestPhaseAdvance(updatedSkill);

    res.json({
      message: response.message,
      skill: updatedSkill,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint,
      progress,
      validation: updatedSkill.validation,
      phase_suggestion: phaseSuggestion,
      usage: response.usage,
      tools_used: response.toolsUsed
    });

  } catch (err) {
    req.app.locals.log.error("Skill chat error:", err);
    next(err);
  }
});

/**
 * Get initial greeting for skill chat
 * GET /api/chat/skill/greeting
 */
router.get("/skill/greeting", async (req, res) => {
  res.json({
    message: `Hi! I'm here to help you build a custom AI agent skill.

A skill teaches your AI agent how to handle a specific type of work. For example:

- **Customer support** - handle orders, refunds, shipping questions
- **Sales assistance** - look up products, generate quotes
- **HR helpdesk** - answer benefits questions, process time-off

---

What problem would you like your AI agent to solve?`,
    input_hint: {
      mode: "selection",
      options: [
        "Customer support - handle orders, refunds, and shipping questions",
        "Sales assistance - look up products and generate quotes",
        "HR helpdesk - answer benefits questions and process requests",
        "Something else - I'll describe my use case"
      ]
    }
  });
});

/**
 * Digest uploaded file to extract intents and scenarios
 * POST /api/chat/skill/digest
 */
router.post("/skill/digest", (req, res, next) => {
  const upload = req.app.locals.upload;

  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { skill_id } = req.body;
      const log = req.app.locals.log;

      if (!skill_id) {
        return res.status(400).json({ error: "skill_id is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      log.debug(`File digest request for ${skill_id}: ${req.file.originalname}`);

      // Load skill (solution_id comes from form body)
      const { solution_id } = req.body;
      if (!solution_id) {
        return res.status(400).json({ error: "solution_id is required" });
      }

      let skill;
      try {
        skill = await skillsStore.load(solution_id, skill_id);
      } catch (err) {
        if (err.message?.includes('not found') || err.code === "ENOENT") {
          return res.status(404).json({ error: "Skill not found" });
        }
        throw err;
      }

      // Extract file content
      const fileContent = req.file.buffer.toString('utf-8');
      const fileName = req.file.originalname;
      const fileType = getFileType(fileName);

      log.debug(`Processing file: ${fileName} (${fileType}, ${fileContent.length} chars)`);

      // Process with LLM for extraction
      const extraction = await digestFileContent({
        skill,
        fileContent,
        fileName,
        fileType
      });

      // Return extraction for user review (NOT applied yet)
      res.json({
        extraction,
        file_info: {
          name: fileName,
          type: fileType,
          size: req.file.size,
          lines: fileContent.split('\n').length
        }
      });

    } catch (err) {
      req.app.locals.log.error("File digest error:", err);
      next(err);
    }
  });
});

/**
 * Apply confirmed file extraction to skill
 * POST /api/chat/skill/digest/apply
 */
router.post("/skill/digest/apply", async (req, res, next) => {
  try {
    const { solution_id, skill_id, extraction } = req.body;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id is required" });
    }

    if (!skill_id) {
      return res.status(400).json({ error: "skill_id is required" });
    }

    if (!extraction) {
      return res.status(400).json({ error: "extraction is required" });
    }

    log.debug(`Applying extraction for ${skill_id}`);

    // Load skill
    let skill = await skillsStore.load(solution_id, skill_id);

    // Build and apply state updates from extraction
    const intentsCount = extraction.intents?.length || 0;
    const scenariosCount = extraction.scenarios?.length || 0;

    // Apply intents
    for (const intent of extraction.intents || []) {
      const update = {
        "intents.supported_push": {
          description: intent.description,
          examples: intent.examples || [],
          maps_to_workflow_resolved: true
        }
      };
      skill = applyStateUpdateWithValidation(skill, update);
    }

    // Apply scenarios
    for (const scenario of extraction.scenarios || []) {
      const update = {
        "scenarios_push": {
          title: scenario.title,
          description: scenario.description,
          steps: scenario.steps || [],
          expected_outcome: scenario.expected_outcome || ""
        }
      };
      skill = applyStateUpdateWithValidation(skill, update);
    }

    // Add message about the import
    skill.conversation.push({
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: `Imported ${intentsCount} intent(s) and ${scenariosCount} scenario(s) from your uploaded file.`,
      timestamp: new Date().toISOString()
    });

    // Save
    await skillsStore.save(skill);

    const progress = calculateProgress(skill);

    res.json({
      message: `Imported ${intentsCount} intent(s) and ${scenariosCount} scenario(s)`,
      skill,
      progress,
      validation: skill.validation
    });

  } catch (err) {
    req.app.locals.log.error("Apply extraction error:", err);
    next(err);
  }
});

export default router;
