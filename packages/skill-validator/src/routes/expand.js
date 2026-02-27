/**
 * Expand API routes
 *
 * POST /expand/skill  — Expand a minimal skill into a full ADAS-compliant definition
 */

import { Router } from 'express';
import { expandSkill } from '../services/skillExpander.js';

const router = Router();

/**
 * POST /expand/skill
 *
 * Body: { skill: MinimalSkill }
 * Returns: { ok, skill: FullSkill, expanded_fields: string[] }
 */
router.post('/expand/skill', (req, res) => {
  const { skill } = req.body;

  if (!skill) {
    return res.status(400).json({ ok: false, error: 'Missing "skill" in request body' });
  }

  if (!skill.id || !skill.name) {
    return res.status(400).json({ ok: false, error: 'Minimal skill requires at least "id" and "name"' });
  }

  try {
    const result = expandSkill(skill);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Expander] Skill expansion error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
