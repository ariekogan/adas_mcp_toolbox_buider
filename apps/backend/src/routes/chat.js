import { Router } from "express";
import domainsStore from "../store/domains.js";
import { processMessage } from "../services/conversation.js";
import { applyStateUpdateWithValidation, calculateProgress, shouldSuggestPhaseAdvance } from "../services/state.js";

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
      suggested_focus: response.suggestedFocus
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

A skill teaches your AI agent how to handle a specific type of work:
- **Intents**: What requests can the agent handle?
- **Tools**: What actions can the agent perform?
- **Policy**: What rules must the agent follow?

For example, someone might build a skill for:
- Customer support (handle orders, refunds, shipping questions)
- Sales assistance (look up products, generate quotes, check inventory)
- HR helpdesk (answer benefits questions, process time-off requests)

What problem would YOU like your AI agent to solve?`
  });
});

export default router;
