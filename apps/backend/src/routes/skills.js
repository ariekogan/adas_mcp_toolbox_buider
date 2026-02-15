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
import solutionsStore from '../store/solutions.js';
import templatesStore from '../store/templates.js';
import { getValidationSummary } from '@adas/skill-validator';
import { getAllPrebuiltConnectors } from './connectors.js';

// mergeParams: true allows access to :solutionId from parent router
const router = Router({ mergeParams: true });

/**
 * Resolve a skill ID — tries direct load, then falls back to original_skill_id lookup.
 * External agents use original IDs (e.g., "e2e-greeter") but skills are stored
 * with internal IDs (e.g., "skill_fleet-ui-mcp").
 * @returns {string} The internal skill ID
 */
async function resolveSkillId(skillId) {
  // Check if the skillId exists directly as a directory
  try {
    await skillsStore.load(skillId);
    return skillId;
  } catch {
    // Not found — search by original_skill_id
    const allSkills = await skillsStore.list();
    const match = allSkills.find(s => s.original_skill_id === skillId);
    if (match) return match.id;
    throw new Error(`Skill ${skillId} not found`);
  }
}

/**
 * List all skills for a solution
 * GET /api/solutions/:solutionId/skills
 */
router.get('/', async (req, res, next) => {
  try {
    const { solutionId } = req.params;

    // Load the solution to get linked_skills
    const solution = await solutionsStore.load(solutionId);
    const linkedSkillIds = new Set(solution?.linked_skills || []);

    // Get all skills and filter by linked_skills
    const allSkills = await skillsStore.list();
    const skills = allSkills
      .filter(s => linkedSkillIds.has(s.id))
      .map(s => ({
        ...s,
        solution_id: solutionId  // Add solution_id to each skill
      }));

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
    const internalId = await resolveSkillId(skillId);
    const skill = await skillsStore.load(solutionId, internalId);

    // Backfill source on ui.* tools missing it (created by DAL without MCP bridge info)
    if (skill.tools?.length && skill.connectors?.length) {
      const catalog = getAllPrebuiltConnectors();
      const uiConnId = skill.connectors.find(id => catalog[id]?.ui_capable);
      if (uiConnId) {
        let patched = false;
        for (const tool of skill.tools) {
          if (tool.name?.startsWith('ui.') && !tool.source) {
            tool.source = {
              type: 'mcp_bridge',
              connection_id: uiConnId,
              mcp_tool: tool.name
            };
            patched = true;
          }
        }
        if (patched) {
          await skillsStore.save(skill);
        }
      }
    }

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

    const internalId = await resolveSkillId(skillId);
    const skill = await skillsStore.updateState(solutionId, internalId, updates);
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
    const internalId = await resolveSkillId(skillId);
    const skill = await skillsStore.load(solutionId, internalId);
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
 * Get skill conversation history
 * GET /api/solutions/:solutionId/skills/:skillId/conversation
 *
 * Returns just the conversation array, optionally limited by ?limit=N (most recent N messages).
 */
router.get('/:skillId/conversation', async (req, res, next) => {
  try {
    const { solutionId, skillId } = req.params;
    const internalId = await resolveSkillId(skillId);
    const skill = await skillsStore.load(solutionId, internalId);
    let messages = skill.conversation || [];

    // Optional limit parameter (return most recent N messages)
    const limit = parseInt(req.query.limit);
    if (limit > 0 && messages.length > limit) {
      messages = messages.slice(-limit);
    }

    res.json({
      skill_id: skillId,
      internal_id: internalId !== skillId ? internalId : undefined,
      message_count: (skill.conversation || []).length,
      messages,
    });
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
    const internalId = await resolveSkillId(skillId);

    // Load skill to get original_skill_id before deleting
    let originalId = skillId;
    try {
      const skill = await skillsStore.load(solutionId, internalId);
      if (skill.original_skill_id) originalId = skill.original_skill_id;
    } catch { /* proceed with deletion anyway */ }

    await skillsStore.remove(solutionId, internalId);

    // Also remove from solution's architecture skills array
    try {
      const solution = await solutionsStore.load(solutionId);
      if (Array.isArray(solution.skills)) {
        const idx = solution.skills.findIndex(s => s.id === originalId || s.id === internalId || s.id === skillId);
        if (idx !== -1) {
          solution.skills.splice(idx, 1);
          await solutionsStore.save(solution);
        }
      }
    } catch { /* non-fatal — solution may not exist */ }

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
