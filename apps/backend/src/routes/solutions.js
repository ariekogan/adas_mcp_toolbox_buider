/**
 * Solutions API Routes
 *
 * Manages Solution definitions — the cross-skill architecture layer
 * that captures handoff flows, grant economy, channel routing, and
 * security contracts between skills.
 */

import { Router } from 'express';
import solutionsStore from '../store/solutions.js';
import { processSolutionMessage } from '../services/solutionConversation.js';
import { validateSolution } from '../validators/solutionValidator.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * List all solutions
 * GET /api/solutions
 */
router.get('/', async (req, res, next) => {
  try {
    const solutions = await solutionsStore.list();
    res.json({ solutions });
  } catch (err) {
    next(err);
  }
});

/**
 * Create new solution
 * POST /api/solutions
 * Body: { name: string }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Solution name is required' });
    }

    const solution = await solutionsStore.create(name);
    res.status(201).json({ solution });
  } catch (err) {
    next(err);
  }
});

/**
 * Get solution by ID
 * GET /api/solutions/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    res.json({ solution });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Update solution
 * PATCH /api/solutions/:id
 * Body: { state_update: Object }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { state_update } = req.body;

    if (!state_update || Object.keys(state_update).length === 0) {
      return res.status(400).json({ error: 'state_update is required' });
    }

    const solution = await solutionsStore.updateState(req.params.id, state_update);
    res.json({ solution });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Delete solution
 * DELETE /api/solutions/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await solutionsStore.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════

/**
 * Send message to Solution Bot
 * POST /api/solutions/:id/chat
 * Body: { message: string }
 */
router.post('/:id/chat', async (req, res, next) => {
  try {
    const { message } = req.body;
    const log = req.app.locals.log;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    log.debug(`Solution chat request for ${req.params.id}`);

    // Load solution
    let solution;
    try {
      solution = await solutionsStore.load(req.params.id);
    } catch (err) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: 'Solution not found' });
      }
      throw err;
    }

    // Save user message
    solution.conversation.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Process with LLM
    const response = await processSolutionMessage({ solution, userMessage: message });

    log.debug('Solution LLM response received', { usage: response.usage });

    // Apply state updates
    if (response.stateUpdate && Object.keys(response.stateUpdate).length > 0) {
      log.debug('Applying solution state updates', response.stateUpdate);
      const storeModule = solutionsStore;
      // Apply directly via store's applyUpdates (re-load to get fresh state after user msg save)
      for (const [key, value] of Object.entries(response.stateUpdate)) {
        if (key === 'phase') {
          solution.phase = value;
        } else {
          // Use the store's updateState for proper _push/_delete handling
          // We'll apply inline since we already have the object in memory
          applyInlineUpdates(solution, { [key]: value });
        }
      }
    }

    // Save assistant message
    solution.conversation.push({
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      state_update: response.stateUpdate,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint,
    });

    // Save updated solution
    await solutionsStore.save(solution);

    // Run validation
    const validation = validateSolution(solution);

    res.json({
      message: response.message,
      solution,
      suggested_focus: response.suggestedFocus,
      input_hint: response.inputHint,
      validation,
      usage: response.usage,
    });
  } catch (err) {
    req.app.locals.log.error('Solution chat error:', err);
    next(err);
  }
});

/**
 * Get initial greeting for solution chat
 * GET /api/solutions/:id/greeting
 */
router.get('/:id/greeting', async (req, res) => {
  res.json({
    message: `Welcome to the Solution Builder! I'll help you design the cross-skill architecture for your solution.

A **solution** is a collection of skills that work together. I'll guide you through:

1. **Skill Topology** — What skills exist and their roles
2. **Grant Economy** — How verified claims flow between skills
3. **Handoff Flows** — How conversations transfer between skills
4. **Channel Routing** — Which skill handles which channel
5. **Security Contracts** — Cross-skill access requirements

---

Let's start! What kind of solution are you building?`,
    input_hint: {
      mode: 'selection',
      options: [
        'Customer support with identity verification',
        'Multi-department workflow (support, fulfillment, finance)',
        'API-driven automation with scheduled tasks',
        'Something else — I\'ll describe my use case',
      ],
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATION & TOPOLOGY
// ═══════════════════════════════════════════════════════════════

/**
 * Validate cross-skill contracts
 * GET /api/solutions/:id/validate
 */
router.get('/:id/validate', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);
    const validation = validateSolution(solution);
    res.json({ validation });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Get solution topology graph
 * GET /api/solutions/:id/topology
 */
router.get('/:id/topology', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);

    // Build topology graph for visualization
    const nodes = (solution.skills || []).map(skill => ({
      id: skill.id,
      role: skill.role,
      description: skill.description,
      entry_channels: skill.entry_channels || [],
      connectors: skill.connectors || [],
    }));

    const edges = (solution.handoffs || []).map(handoff => ({
      id: handoff.id,
      from: handoff.from,
      to: handoff.to,
      trigger: handoff.trigger,
      grants_passed: handoff.grants_passed || [],
      mechanism: handoff.mechanism,
    }));

    const channels = Object.entries(solution.routing || {}).map(([channel, config]) => ({
      channel,
      default_skill: config.default_skill,
      description: config.description,
    }));

    res.json({
      topology: { nodes, edges, channels },
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// INLINE STATE UPDATE HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Apply updates inline to a solution object (mirrors store/solutions.js logic)
 */
function applyInlineUpdates(solution, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (key.endsWith('_delete')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(solution, arrayKey);
      if (Array.isArray(arr)) {
        const ids = Array.isArray(value) ? value : [value];
        for (const id of ids) {
          const idx = arr.findIndex(item => item.id === id || item.key === id || item.name === id);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }
      continue;
    }

    if (key.endsWith('_push')) {
      const arrayKey = key.slice(0, -5);
      let arr = getNestedValue(solution, arrayKey);
      if (!Array.isArray(arr)) {
        setNestedValue(solution, arrayKey, []);
        arr = getNestedValue(solution, arrayKey);
      }
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        const matchKey = item.id || item.key || item.name;
        if (matchKey) {
          const idx = arr.findIndex(existing =>
            existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
          );
          if (idx !== -1) {
            arr[idx] = { ...arr[idx], ...item };
          } else {
            arr.push(item);
          }
        } else {
          arr.push(item);
        }
      }
      continue;
    }

    if (key.endsWith('_update')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(solution, arrayKey);
      if (Array.isArray(arr)) {
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) {
          const matchKey = item.id || item.key || item.name;
          if (matchKey) {
            const idx = arr.findIndex(existing =>
              existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
            );
            if (idx !== -1) {
              arr[idx] = { ...arr[idx], ...item };
            }
          }
        }
      }
      continue;
    }

    setNestedValue(solution, key, value);
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

export default router;
