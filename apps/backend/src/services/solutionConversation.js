/**
 * Solution Conversation Service
 *
 * Processes chat messages for the Solution Bot.
 * Follows the same pattern as conversation.js but uses
 * the solution system prompt instead of the DAL system prompt.
 */

import { buildSolutionSystemPrompt } from '../prompts/solutionSystem.js';
import { createAdapter } from './llm/adapter.js';

/**
 * Compress conversation history (same strategy as skill conversation)
 */
function compressConversation(messages) {
  const KEEP_RECENT = 10;
  const PACKET_SIZE = 20;
  const MAX_SUMMARIES = 10;

  if (messages.length <= KEEP_RECENT) {
    return messages;
  }

  const recentMessages = messages.slice(-KEEP_RECENT);
  const olderMessages = messages.slice(0, -KEEP_RECENT);

  if (olderMessages.length === 0) {
    return recentMessages;
  }

  const summaries = [];
  for (let i = 0; i < olderMessages.length && summaries.length < MAX_SUMMARIES; i += PACKET_SIZE) {
    const packet = olderMessages.slice(i, i + PACKET_SIZE);

    const keyPoints = [];
    packet.forEach(msg => {
      if (msg.role === 'user') {
        const shortContent = msg.content.length > 100
          ? msg.content.substring(0, 100) + '...'
          : msg.content;
        keyPoints.push(`User: ${shortContent}`);
      } else if (msg.role === 'assistant' && msg.state_update) {
        const updates = Object.keys(msg.state_update || {});
        if (updates.length > 0) {
          keyPoints.push(`Assistant updated: ${updates.join(', ')}`);
        }
      }
    });

    if (keyPoints.length > 0) {
      summaries.push({
        role: 'system',
        content: `[Conversation summary - messages ${i + 1} to ${Math.min(i + PACKET_SIZE, olderMessages.length)}]\n${keyPoints.slice(0, 5).join('\n')}`,
      });
    }
  }

  return [...summaries, ...recentMessages];
}

/**
 * Process a solution chat message
 *
 * @param {Object} params
 * @param {Object} params.solution - Solution object
 * @param {string} params.userMessage - User's message
 * @returns {Promise<Object>} - Parsed response with message, stateUpdate, etc.
 */
export async function processSolutionMessage({ solution, userMessage }) {
  const compressedHistory = compressConversation(solution.conversation);

  // Build messages array
  const messages = compressedHistory.map(m => ({
    role: m.role,
    content: m.content,
  }));

  messages.push({
    role: 'user',
    content: userMessage,
  });

  // Build system prompt
  const systemPrompt = buildSolutionSystemPrompt(solution);

  // Get LLM adapter
  const provider = process.env.LLM_PROVIDER || 'anthropic';
  const adapter = createAdapter(provider, {});

  // Send to LLM
  const response = await adapter.chat({
    systemPrompt,
    messages,
    maxTokens: 4096,
    temperature: 0.7,
  });

  // Handle truncated response
  if (response.stopReason === 'length') {
    return {
      message: 'My response was too long. Let me try a shorter answer. Could you ask about one section at a time?',
      stateUpdate: {},
      suggestedFocus: null,
      inputHint: {
        mode: 'selection',
        options: ['Define skills', 'Define grants', 'Define handoffs', 'Set up routing'],
      },
      usage: response.usage,
    };
  }

  // Parse JSON response
  let parsed;
  try {
    let content = response.content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);

    content = content.trim();
    if (!content.startsWith('{')) {
      const jsonStart = content.indexOf('{');
      if (jsonStart !== -1) content = content.slice(jsonStart);
    }
    if (!content.endsWith('}')) {
      const jsonEnd = content.lastIndexOf('}');
      if (jsonEnd !== -1) content = content.slice(0, jsonEnd + 1);
    }

    parsed = JSON.parse(content.trim());
    console.log('[SolutionConversation] Parsed JSON, state_update keys:', Object.keys(parsed.state_update || {}));
  } catch (err) {
    console.log('[SolutionConversation] Failed to parse JSON:', err.message);

    // Try regex extraction
    const messageMatch = response.content.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (messageMatch) {
      parsed = {
        message: messageMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        state_update: {},
        suggested_focus: null,
      };
    } else {
      parsed = {
        message: response.content,
        state_update: {},
        suggested_focus: null,
      };
    }
  }

  return {
    message: parsed.message || '',
    stateUpdate: parsed.state_update || {},
    suggestedFocus: parsed.suggested_focus || null,
    inputHint: parsed.input_hint || null,
    usage: response.usage,
  };
}

export default { processSolutionMessage };
