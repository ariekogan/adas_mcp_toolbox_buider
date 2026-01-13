import { buildSystemPrompt, buildPromptForState } from "../prompts/system.js";
import { createAdapter } from "./llm/adapter.js";

/**
 * Process a chat message and get LLM response
 *
 * Supports both:
 * - Legacy format: { project, toolbox, conversation }
 * - DraftDomain format: { domain }
 */
export async function processMessage({ project, toolbox, conversation, domain, userMessage, uiFocus }) {
  // Determine if we're using legacy or new format
  const isNewFormat = domain !== undefined;
  const state = isNewFormat ? domain : toolbox;
  const messages_history = isNewFormat ? domain.conversation : conversation.messages;
  // Build messages array for LLM
  const messages = messages_history.map(m => ({
    role: m.role,
    content: m.content
  }));
  
  // Add UI focus context to user message
  const contextualMessage = uiFocus 
    ? `[UI Focus: ${uiFocus.type}${uiFocus.id ? ` - ${uiFocus.id}` : ""}]\n\n${userMessage}`
    : userMessage;
  
  messages.push({
    role: "user",
    content: contextualMessage
  });
  
  // Build system prompt with current state (auto-detects format)
  const systemPrompt = isNewFormat ? buildPromptForState(domain) : buildSystemPrompt(toolbox);

  // Get LLM adapter - settings can come from project (legacy) or domain._settings (new)
  const settings = isNewFormat ? domain._settings : project?.settings;
  const provider = settings?.llm_provider || process.env.LLM_PROVIDER || "anthropic";
  const adapter = createAdapter(provider, {
    apiKey: settings?.api_key,
    model: settings?.llm_model
  });
  
  // Send to LLM
  const response = await adapter.chat({
    systemPrompt,
    messages,
    maxTokens: 4096,
    temperature: 0.7
  });
  
  // Parse response
  let parsed;
  try {
    // Extract JSON from response (handle potential markdown wrapping)
    let content = response.content.trim();
    if (content.startsWith("```json")) {
      content = content.slice(7);
    }
    if (content.startsWith("```")) {
      content = content.slice(3);
    }
    if (content.endsWith("```")) {
      content = content.slice(0, -3);
    }

    // Try to find JSON object in the content
    content = content.trim();
    if (!content.startsWith("{")) {
      // Look for first { in content
      const jsonStart = content.indexOf("{");
      if (jsonStart !== -1) {
        content = content.slice(jsonStart);
      }
    }
    if (!content.endsWith("}")) {
      // Look for last } in content
      const jsonEnd = content.lastIndexOf("}");
      if (jsonEnd !== -1) {
        content = content.slice(0, jsonEnd + 1);
      }
    }

    parsed = JSON.parse(content.trim());
    console.log("[Conversation] Parsed JSON response, state_update keys:", Object.keys(parsed.state_update || {}));
    console.log("[Conversation] input_hint:", parsed.input_hint ? JSON.stringify(parsed.input_hint) : "none");
  } catch (err) {
    // If parsing fails, check if the content looks like JSON with a "message" field
    // and try to extract just the message
    console.log("[Conversation] Failed to parse JSON:", err.message);
    console.log("[Conversation] First 300 chars:", response.content.substring(0, 300));

    // Try regex to extract message field
    const messageMatch = response.content.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (messageMatch) {
      console.log("[Conversation] Extracted message via regex");
      parsed = {
        message: messageMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        state_update: {},
        suggested_focus: null
      };
    } else {
      // Treat entire response as message
      parsed = {
        message: response.content,
        state_update: {},
        suggested_focus: null
      };
    }
  }
  
  return {
    message: parsed.message || "",
    stateUpdate: parsed.state_update || {},
    suggestedFocus: parsed.suggested_focus || null,
    inputHint: parsed.input_hint || null,
    usage: response.usage,
    toolsUsed: response.toolsUsed || null
  };
}

export default { processMessage };
