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
 * Resolve a skill ID — tries direct load, then legacy skill_ prefix fallback.
 * Since skill.id IS the developer's original ID (no prefix), direct load is the normal path.
 * @returns {string} The skill ID
 */
async function resolveSkillId(skillId) {
  try {
    await skillsStore.load(skillId);
    return skillId;
  } catch {
    // Backward compat: try legacy skill_ prefix
    const legacyId = `skill_${skillId}`;
    try {
      await skillsStore.load(legacyId);
      return legacyId;
    } catch {
      throw new Error(`Skill ${skillId} not found`);
    }
  }
}

/**
 * List all skills for a solution
 * GET /api/solutions/:solutionId/skills
 */
router.get('/', async (req, res, next) => {
  try {
    const { solutionId } = req.params;

    // Load the solution to determine which skills belong to it.
    // UNION semantics (F3 drift fix): a skill is "in this solution" if it
    // appears in EITHER solution.linked_skills[] OR solution.skills[].id.
    // Historically we only consulted linked_skills (with skills[] as a fallback
    // only when linked_skills was empty) — that caused skills added to the
    // topology via ateam_github_patch or ateam_build_and_run (which updates
    // skills[] but not always linked_skills) to disappear from the listing
    // even though their skill.json was present on disk.
    // See: /Users/arie/.claude/plans/peaceful-dazzling-dijkstra.md (PR-4).
    const solution = await solutionsStore.load(solutionId);
    const fromLinkedField = Array.isArray(solution?.linked_skills) ? solution.linked_skills : [];
    const fromTopology = (solution?.skills || []).map(s => s.id).filter(Boolean);
    const linkedSkillIds = new Set([...fromLinkedField, ...fromTopology]);

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
    const cleanup = { fs: false, solution_skills: false, linked_skills: false, core: false, core_error: null };

    // 1. Remove the skill's files from Builder FS (skill.json, exports, etc.)
    try {
      await skillsStore.remove(solutionId, internalId);
      cleanup.fs = true;
    } catch (err) {
      console.warn(`[DeleteSkill] FS removal failed for ${internalId}: ${err.message}`);
    }

    // 2. Remove from solution.json (both skills[] and linked_skills[])
    try {
      const solution = await solutionsStore.load(solutionId);
      let changed = false;
      if (Array.isArray(solution.skills)) {
        const before = solution.skills.length;
        solution.skills = solution.skills.filter(s => s.id !== internalId && s.id !== skillId);
        if (solution.skills.length !== before) { cleanup.solution_skills = true; changed = true; }
      }
      if (Array.isArray(solution.linked_skills)) {
        const before = solution.linked_skills.length;
        solution.linked_skills = solution.linked_skills.filter(s => s !== internalId && s !== skillId);
        if (solution.linked_skills.length !== before) { cleanup.linked_skills = true; changed = true; }
      }
      if (changed) await solutionsStore.save(solution);
    } catch (err) {
      console.warn(`[DeleteSkill] solution.json cleanup failed: ${err.message}`);
    }

    // 3. Tell A-Team Core to stop the MCP process + drop the skill from Mongo.
    // Core's DELETE /api/skills/:slug handler is responsible for killing the
    // tracked MCP process, releasing the port, and removing the skill registry
    // entry. Non-fatal: if Core is down we still clean local state.
    try {
      const adasCore = (await import('../services/adasCoreClient.js')).default;
      await adasCore.deleteSkill(internalId);
      cleanup.core = true;
    } catch (err) {
      cleanup.core_error = err.message;
      console.warn(`[DeleteSkill] Core deletion failed for ${internalId}: ${err.message}`);
    }

    res.json({ ok: true, skill_id: internalId, cleanup });
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
