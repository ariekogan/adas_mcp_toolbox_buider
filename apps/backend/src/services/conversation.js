import { buildSystemPrompt } from "../prompts/system.js";
import { createAdapter } from "./llm/adapter.js";

/**
 * Process a chat message and get LLM response
 */
export async function processMessage({ project, toolbox, conversation, userMessage, uiFocus }) {
  // Build messages array for LLM
  const messages = conversation.messages.map(m => ({
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
  
  // Build system prompt with current state
  const systemPrompt = buildSystemPrompt(toolbox);
  
  // Get LLM adapter
  const provider = project.settings?.llm_provider || process.env.LLM_PROVIDER || "anthropic";
  const adapter = createAdapter(provider, {
    apiKey: project.settings?.api_key,
    model: project.settings?.llm_model
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
    parsed = JSON.parse(content.trim());
    console.log("[Conversation] Parsed JSON response, state_update keys:", Object.keys(parsed.state_update || {}));
  } catch (err) {
    // If parsing fails, treat entire response as message
    console.log("[Conversation] Failed to parse JSON, treating as plain text. First 200 chars:", response.content.substring(0, 200));
    parsed = {
      message: response.content,
      state_update: {},
      suggested_focus: null
    };
  }
  
  return {
    message: parsed.message || "",
    stateUpdate: parsed.state_update || {},
    suggestedFocus: parsed.suggested_focus || null,
    usage: response.usage,
    toolsUsed: response.toolsUsed || null
  };
}

export default { processMessage };
