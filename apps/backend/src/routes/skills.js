/**
 * Skills API Routes
 *
 * Handles CRUD operations for DraftSkill objects.
 * Supports auto-migration from legacy project format.
 */

import { Router } from 'express';
import skillsStore from '../store/skills.js';
import templatesStore from '../store/templates.js';
import { getValidationSummary } from '../validators/index.js';

const router = Router();

/**
 * List all skills
 * GET /api/skills
 *
 * Returns both new-format skills and legacy projects (marked for migration)
 */
router.get('/', async (req, res, next) => {
  try {
    const skills = await skillsStore.list();
    res.json({ skills });
  } catch (err) {
    next(err);
  }
});

/**
 * Create new skill
 * POST /api/skills
 *
 * Body: {
 *   name: string,
 *   settings?: { llm_provider, llm_model },
 *   templateId?: string  // Optional: template to use as starting point
 * }
 */
router.post('/', async (req, res, next) => {
  try {
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

    const skill = await skillsStore.create(name, settings, template);
    res.status(201).json({ skill });
  } catch (err) {
    next(err);
  }
});

/**
 * Get skill by ID
 * GET /api/skills/:id
 *
 * Automatically migrates legacy projects to new format on first load
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const skill = await skillsStore.load(id);
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
 * PATCH /api/skills/:id
 *
 * Body: { updates: { ... state updates using dot notation ... } }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates object is required' });
    }

    const skill = await skillsStore.updateState(id, updates);
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
 * PATCH /api/skills/:id/settings
 *
 * Body: { llm_provider?, llm_model?, ... }
 */
router.patch('/:id/settings', async (req, res, next) => {
  try {
    const { id } = req.params;
    const settings = req.body;

    const skill = await skillsStore.updateSettings(id, settings);
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
 * GET /api/skills/:id/validation
 */
router.get('/:id/validation', async (req, res, next) => {
  try {
    const { id } = req.params;
    const skill = await skillsStore.load(id);
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
 * DELETE /api/skills/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await skillsStore.remove(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Append message to skill conversation
 * POST /api/skills/:id/messages
 *
 * Body: { role: 'user' | 'assistant', content: string }
 */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, content, state_update, suggested_focus } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    const message = { role, content, state_update, suggested_focus };
    const skill = await skillsStore.appendMessage(id, message);
    res.json({ skill });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    next(err);
  }
});

export default router;
