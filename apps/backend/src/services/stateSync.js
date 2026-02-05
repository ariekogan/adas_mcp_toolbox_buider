/**
 * State Synchronization Service
 *
 * Provides context injection to keep AI responses aligned with current skill state.
 * This prevents the AI from referencing tools, intents, or other entities that have
 * been renamed or deleted during the conversation.
 *
 * The approach is generic and extendable:
 * 1. Generate a concise "state context" string listing current entities
 * 2. Inject this context into user messages when significant state changes occurred
 * 3. The AI sees the latest entity names, preventing stale references
 */

/**
 * Generate a concise state context string for injection
 * Only includes tool names (the most important for preventing stale references)
 *
 * @param {Object} skill - The current skill state
 * @returns {string} - Context string to prepend to user message
 */
export function generateStateContext(skill) {
  try {
    // Only include tool names - this is the most critical for preventing stale references
    const tools = skill.tools || [];
    if (tools.length === 0) {
      return '';
    }

    const toolNames = tools.map(t => t.name).filter(Boolean);
    if (toolNames.length === 0) {
      return '';
    }

    // Keep it very short and focused
    return `[Note: Current tools are: ${toolNames.join(', ')}]`;
  } catch (err) {
    console.error('[StateSync] Error generating context:', err);
    return '';
  }
}

/**
 * Detect if state was recently modified (tools added/removed/renamed)
 * by comparing conversation history for assistant messages with state_updates
 *
 * Only triggers for SIGNIFICANT changes (tool name changes, additions, removals)
 * NOT for minor updates like descriptions or mock data
 *
 * @param {Object} skill - The current skill state
 * @param {number} lookbackMessages - How many messages to look back (default: 2)
 * @returns {boolean} - True if state was recently modified
 */
export function wasStateRecentlyModified(skill, lookbackMessages = 2) {
  try {
    const conversation = skill.conversation || [];
    if (conversation.length < 2) {
      return false;
    }

    // Only look at the most recent assistant message
    const recentMessages = conversation.slice(-lookbackMessages);

    for (const msg of recentMessages) {
      if (msg.role === 'assistant' && msg.state_update) {
        const update = msg.state_update;
        const keys = Object.keys(update);

        // Only trigger for tool/intent NAME changes or additions
        // These are the cases where the AI might reference wrong names
        for (const key of keys) {
          // Tool name changes: tools[0].name, tools[1].name
          if (/tools\[\d+\]\.name/.test(key)) {
            return true;
          }
          // New tools being pushed
          if (key === 'tools_push') {
            return true;
          }
          // Intent changes that affect names/descriptions
          if (/intents\.supported\[\d+\]\.description/.test(key)) {
            return true;
          }
          if (key === 'intents.supported_push') {
            return true;
          }
        }
      }
    }

    return false;
  } catch (err) {
    // If anything fails, don't inject context (safer default)
    console.error('[StateSync] Error checking state modifications:', err);
    return false;
  }
}

/**
 * Enhance user message with state context if needed
 *
 * @param {string} message - Original user message
 * @param {Object} skill - Current skill state
 * @param {Object} options - Options
 * @param {boolean} options.force - Force context injection even if no recent changes
 * @param {boolean} options.verbose - Include more detailed context
 * @returns {string} - Enhanced message with state context (or original if error)
 */
export function enhanceWithStateContext(message, skill, options = {}) {
  try {
    const { force = false } = options;

    // Only inject context if state was recently modified (or forced)
    if (!force && !wasStateRecentlyModified(skill)) {
      return message;
    }

    const context = generateStateContext(skill);
    if (!context) {
      return message;
    }

    // Prepend context to message
    console.log('[StateSync] Injecting context:', context.substring(0, 100) + '...');
    return `${context}\n\n${message}`;
  } catch (err) {
    // If anything fails, return original message (safer default)
    console.error('[StateSync] Error enhancing message:', err);
    return message;
  }
}

/**
 * Generate a state refresh reminder for significant changes
 * This can be used to inject a system-like note when major changes occur
 *
 * @param {Object} previousSkill - Skill state before change
 * @param {Object} currentSkill - Skill state after change
 * @returns {string|null} - Reminder message or null if no significant changes
 */
export function generateStateChangeReminder(previousSkill, currentSkill) {
  const changes = [];

  // Check tools
  const prevTools = (previousSkill?.tools || []).map(t => t.name).filter(Boolean);
  const currTools = (currentSkill?.tools || []).map(t => t.name).filter(Boolean);

  // Find renamed/removed tools
  const removedTools = prevTools.filter(t => !currTools.includes(t));
  const addedTools = currTools.filter(t => !prevTools.includes(t));

  if (removedTools.length > 0 && addedTools.length > 0) {
    // Likely a rename
    changes.push(`Tools changed: removed "${removedTools.join('", "')}", added "${addedTools.join('", "')}"`);
  } else if (removedTools.length > 0) {
    changes.push(`Tools removed: "${removedTools.join('", "')}"`);
  } else if (addedTools.length > 0) {
    changes.push(`Tools added: "${addedTools.join('", "')}"`);
  }

  // Check intents
  const prevIntents = (previousSkill?.intents?.supported || []).map(i => i.description || i.id).filter(Boolean);
  const currIntents = (currentSkill?.intents?.supported || []).map(i => i.description || i.id).filter(Boolean);

  const removedIntents = prevIntents.filter(i => !currIntents.includes(i));
  const addedIntents = currIntents.filter(i => !prevIntents.includes(i));

  if (removedIntents.length > 0) {
    changes.push(`Intents removed: "${removedIntents.join('", "')}"`);
  }
  if (addedIntents.length > 0) {
    changes.push(`Intents added: "${addedIntents.join('", "')}"`);
  }

  if (changes.length === 0) {
    return null;
  }

  return `[State Updated: ${changes.join(' | ')}. Use only current entity names in responses.]`;
}

export default {
  generateStateContext,
  wasStateRecentlyModified,
  enhanceWithStateContext,
  generateStateChangeReminder
};
