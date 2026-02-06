/**
 * Skills API Routes (Solution-scoped)
 *
 * Skills belong to solutions. All routes are under:
 *   /api/solutions/:solutionId/skills
 *
 * @module routes/skills
 */

import { Router } from 'express';
import skillsStore from '../store/skills.js';
import templatesStore from '../store/templates.js';
import { getValidationSummary } from '../validators/index.js';

// mergeParams: true allows access to :solutionId from parent router
const router = Router({ mergeParams: true });

/**
 * List all skills for a solution
 * GET /api/solutions/:solutionId/skills
 */
router.get('/', async (req, res, next) => {
  try {
    const { solutionId } = req.params;
    console.log('[Skills] List for solutionId:', solutionId, 'params:', req.params);
    const skills = await skillsStore.list(solutionId);
    res.json({ skills });
  } catch (err) {
    next(err);
  }
});

/**
 * Create new skill within a solution
 * POST /api/solutions/:solutionId/skills
 *
 * Body: {
 *   name: string,
 *   settings?: { llm_provider, llm_model },
 *   templateId?: string  // Optional: template to use as starting point
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { solutionId } = req.params;
    const { name, settings, templateId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Skill name is required' });
    }

    // Load template if specified
    let template = null;
    if (templateId) {
      try {
        template = await templatesStore.load(templateId);
      } catch (err) {
        return res.status(400).json({ error: `Template "${templateId}" not found` });
      }
    }

    const skill = await skillsStore.create(solutionId, name, settings, template);
    res.status(201).json({ skill });
  } catch (err) {
    next(err);
  }
});

/**
 * Get skill by ID
 * GET /api/solutions/:solutionId/skills/:skillId
 */
router.get('/:skillId', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    const skill = await skillsStore.load(solutionId, skillId);
    res.json({ skill });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Skill not found' });
    }
    next(err);
  }
});

/**
 * Update skill state
 * PATCH /api/solutions/:solutionId/skills/:skillId
 *
 * Body: { updates: { ... state updates using dot notation ... } }
 */
router.patch('/:skillId', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates object is required' });
    }

    const skill = await skillsStore.updateState(solutionId, skillId, updates);
    res.json({ skill });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    next(err);
  }
});

/**
 * Update skill settings
 * PATCH /api/solutions/:solutionId/skills/:skillId/settings
 *
 * Body: { llm_provider?, llm_model?, ... }
 */
router.patch('/:skillId/settings', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    const settings = req.body;

    const skill = await skillsStore.updateSettings(solutionId, skillId, settings);
    res.json({ skill });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    next(err);
  }
});

/**
 * Get skill validation summary
 * GET /api/solutions/:solutionId/skills/:skillId/validation
 */
router.get('/:skillId/validation', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    const skill = await skillsStore.load(solutionId, skillId);
    const summary = getValidationSummary(skill);
    res.json({ validation: summary });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    next(err);
  }
});

/**
 * Delete skill
 * DELETE /api/solutions/:solutionId/skills/:skillId
 */
router.delete('/:skillId', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    await skillsStore.remove(solutionId, skillId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Append message to skill conversation
 * POST /api/solutions/:solutionId/skills/:skillId/messages
 *
 * Body: { role: 'user' | 'assistant', content: string }
 */
router.post('/:skillId/messages', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    const { role, content, state_update, suggested_focus } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    const message = { role, content, state_update, suggested_focus };
    const skill = await skillsStore.appendMessage(solutionId, skillId, message);
    res.json({ skill });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    next(err);
  }
});

export default router;
