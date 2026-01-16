import { buildDALSystemPrompt } from "../prompts/dalSystem.js";
import { createAdapter } from "./llm/adapter.js";

/**
 * Compress conversation history to manage context size
 * Strategy:
 * - Keep last 10 messages intact
 * - Summarize older messages in packets of 20
 * - Include up to 10 summaries
 *
 * @param {Array} messages - Full conversation history
 * @returns {Array} - Compressed messages array
 */
function compressConversation(messages) {
  const KEEP_RECENT = 10;
  const PACKET_SIZE = 20;
  const MAX_SUMMARIES = 10;

  if (messages.length <= KEEP_RECENT) {
    return messages;
  }

  // Split into recent and older messages
  const recentMessages = messages.slice(-KEEP_RECENT);
  const olderMessages = messages.slice(0, -KEEP_RECENT);

  if (olderMessages.length === 0) {
    return recentMessages;
  }

  // Create summaries for older messages in packets
  const summaries = [];
  for (let i = 0; i < olderMessages.length && summaries.length < MAX_SUMMARIES; i += PACKET_SIZE) {
    const packet = olderMessages.slice(i, i + PACKET_SIZE);

    // Extract key points from the packet
    const keyPoints = [];
    packet.forEach(msg => {
      if (msg.role === 'user') {
        // Keep user requests short
        const shortContent = msg.content.length > 100
          ? msg.content.substring(0, 100) + '...'
          : msg.content;
        keyPoints.push(`User: ${shortContent}`);
      } else if (msg.role === 'assistant' && msg.state_update) {
        // For assistant messages, focus on what was accomplished
        const updates = Object.keys(msg.state_update || {});
        if (updates.length > 0) {
          keyPoints.push(`Assistant updated: ${updates.join(', ')}`);
        }
      }
    });

    // Create summary message
    if (keyPoints.length > 0) {
      summaries.push({
        role: 'system',
        content: `[Conversation summary - messages ${i + 1} to ${Math.min(i + PACKET_SIZE, olderMessages.length)}]\n${keyPoints.slice(0, 5).join('\n')}`
      });
    }
  }

  console.log(`[Conversation] Compressed ${messages.length} messages: ${summaries.length} summaries + ${recentMessages.length} recent`);

  // Combine summaries and recent messages
  return [...summaries, ...recentMessages];
}

/**
 * Process a chat message and get LLM response
 *
 * @param {Object} params
 * @param {Object} params.domain - DraftDomain object
 * @param {string} params.userMessage - User's message
 * @param {Object} params.uiFocus - Optional UI focus context
 */
export async function processMessage({ domain, userMessage, uiFocus }) {
  // Compress conversation if too long
  const compressedHistory = compressConversation(domain.conversation);

  // Build messages array for LLM
  const messages = compressedHistory.map(m => ({
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
  const systemPrompt = buildDALSystemPrompt(domain);

  // Get LLM adapter
  const settings = domain._settings;
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

  // Check for truncated response
  if (response.stopReason === 'length') {
    console.log("[Conversation] WARNING: Response was truncated (hit token limit)");
    return {
      message: "I apologize, but my response was too long and got cut off. Let me try a shorter response. Could you ask me to do one thing at a time? For example:\n- First, let's define the tools\n- Then, we'll set up the policies\n- Finally, we'll configure mock data",
      stateUpdate: {},
      suggestedFocus: null,
      inputHint: {
        mode: "selection",
        options: ["Define tools first", "Set up policies first", "Let's do one step at a time"]
      },
      usage: response.usage,
      toolsUsed: null
    };
  }

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
