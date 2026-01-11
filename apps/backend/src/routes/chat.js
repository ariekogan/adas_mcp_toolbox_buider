import { Router } from "express";
import domainsStore from "../store/domains.js";
import { processMessage } from "../services/conversation.js";
import { applyStateUpdateWithValidation, calculateProgress, shouldSuggestPhaseAdvance } from "../services/state.js";
import { digestFileContent, getFileType } from "../services/fileDigestion.js";

const router = Router();

/**
 * Send chat message for a domain
 * POST /api/chat/domain
 *
 * Body: { domain_id: string, message: string, ui_focus?: object }
 */
router.post("/domain", async (req, res, next) => {
  try {
    const { domain_id, message, ui_focus } = req.body;
    const log = req.app.locals.log;

    if (!domain_id) {
      return res.status(400).json({ error: "domain_id is required" });
    }

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    log.debug(`Domain chat request for ${domain_id}`);

    // Load domain (auto-migrates if legacy)
    let domain;
    try {
      domain = await domainsStore.load(domain_id);
    } catch (err) {
      if (err.message?.includes('not found') || err.code === "ENOENT") {
        return res.status(404).json({ error: "Domain not found" });
      }
      throw err;
    }

    // Save user message to domain conversation
    domain.conversation.push({
      id: `msg_${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date().toISOString()
    });

    // Process with LLM (using domain format)
    log.debug("Sending to LLM (domain format)...");
    const response = await processMessage({
      domain,
      userMessage: message,
      uiFocus: ui_focus
    });

    log.debug("LLM response received", { usage: response.usage });

    // Apply state updates with validation
    let updatedDomain = domain;
    if (response.stateUpdate && Object.keys(response.stateUpdate).length > 0) {
      log.debug("Applying state updates", response.stateUpdate);
      updatedDomain = applyStateUpdateWithValidation(domain, response.stateUpdate);
    }

    // Save assistant message to domain conversation
    updatedDomain.conversation.push({
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: response.message,
      timestamp: new Date().toISOString(),
      state_update: response.stateUpdate,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint
    });

    // Save updated domain
    await domainsStore.save(updatedDomain);

    // Calculate progress from validation completeness
    const progress = calculateProgress(updatedDomain);

    // Check if we should suggest phase advancement
    const phaseSuggestion = shouldSuggestPhaseAdvance(updatedDomain);

    res.json({
      message: response.message,
      domain: updatedDomain,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint,
      progress,
      validation: updatedDomain.validation,
      phase_suggestion: phaseSuggestion,
      usage: response.usage,
      tools_used: response.toolsUsed
    });

  } catch (err) {
    req.app.locals.log.error("Domain chat error:", err);
    next(err);
  }
});

/**
 * Get initial greeting for skill chat
 * GET /api/chat/domain/greeting
 */
router.get("/domain/greeting", async (req, res) => {
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
 * POST /api/chat/domain/digest
 */
router.post("/domain/digest", (req, res, next) => {
  const upload = req.app.locals.upload;

  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
      }
      return res.status(400).json({ error: err.message });
    }

    try {
      const { domain_id } = req.body;
      const log = req.app.locals.log;

      if (!domain_id) {
        return res.status(400).json({ error: "domain_id is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      log.debug(`File digest request for ${domain_id}: ${req.file.originalname}`);

      // Load domain
      let domain;
      try {
        domain = await domainsStore.load(domain_id);
      } catch (err) {
        if (err.message?.includes('not found') || err.code === "ENOENT") {
          return res.status(404).json({ error: "Domain not found" });
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
        domain,
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
 * Apply confirmed file extraction to domain
 * POST /api/chat/domain/digest/apply
 */
router.post("/domain/digest/apply", async (req, res, next) => {
  try {
    const { domain_id, extraction } = req.body;
    const log = req.app.locals.log;

    if (!domain_id) {
      return res.status(400).json({ error: "domain_id is required" });
    }

    if (!extraction) {
      return res.status(400).json({ error: "extraction is required" });
    }

    log.debug(`Applying extraction for ${domain_id}`);

    // Load domain
    let domain = await domainsStore.load(domain_id);

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
      domain = applyStateUpdateWithValidation(domain, update);
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
      domain = applyStateUpdateWithValidation(domain, update);
    }

    // Add message about the import
    domain.conversation.push({
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: `Imported ${intentsCount} intent(s) and ${scenariosCount} scenario(s) from your uploaded file.`,
      timestamp: new Date().toISOString()
    });

    // Save
    await domainsStore.save(domain);

    const progress = calculateProgress(domain);

    res.json({
      message: `Imported ${intentsCount} intent(s) and ${scenariosCount} scenario(s)`,
      domain,
      progress,
      validation: domain.validation
    });

  } catch (err) {
    req.app.locals.log.error("Apply extraction error:", err);
    next(err);
  }
});

export default router;
