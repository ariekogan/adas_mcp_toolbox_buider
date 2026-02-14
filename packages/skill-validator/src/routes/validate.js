/**
 * Validation API routes
 *
 * POST /validate/skill     — Validate a single skill definition
 * POST /validate/solution   — Validate a solution (cross-skill + LLM quality)
 * GET  /health              — Health check
 */

import { Router } from 'express';
import { validateDraftSkill } from '../validators/index.js';
import { validateSolution } from '../validators/solutionValidator.js';
import { validateSolutionQuality } from '../validators/solutionQualityValidator.js';

const router = Router();

/**
 * GET /health
 */
router.get('/health', (_req, res) => {
  res.json({ ok: true, service: '@adas/skill-validator' });
});

/**
 * POST /validate/skill
 *
 * Body: { skill: DraftSkill }
 * Returns: ValidationResult
 */
router.post('/validate/skill', (req, res) => {
  const { skill } = req.body;

  if (!skill) {
    return res.status(400).json({ ok: false, error: 'Missing "skill" in request body' });
  }

  try {
    const result = validateDraftSkill(skill);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Validator] Skill validation error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /validate/solution
 *
 * Body: { solution: Solution, skills: DraftSkill[] }
 * Returns: { valid, errors, warnings, summary, quality }
 */
router.post('/validate/solution', async (req, res) => {
  const { solution, skills, connectors, mcp_store } = req.body;

  if (!solution) {
    return res.status(400).json({ ok: false, error: 'Missing "solution" in request body' });
  }
  if (!skills || !Array.isArray(skills)) {
    return res.status(400).json({ ok: false, error: 'Missing "skills" array in request body' });
  }

  try {
    // Phase 1: Structural validation (cross-skill contracts)
    // Pass deployment context for connector binding validation
    const context = (connectors || mcp_store) ? { skills, connectors: connectors || [], mcp_store: mcp_store || {} } : undefined;
    const structural = validateSolution(solution, context);

    // Phase 2: LLM quality scoring
    let quality = null;
    try {
      const qualityResult = await validateSolutionQuality(solution, skills, {
        llm_provider: process.env.LLM_PROVIDER || 'anthropic',
        api_key: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
        llm_model: process.env.LLM_MODEL
      });
      quality = qualityResult;
    } catch (llmErr) {
      console.warn('[Validator] LLM quality scoring failed:', llmErr.message);
      quality = { error: llmErr.message, note: 'Quality scoring unavailable — structural validation still valid' };
    }

    res.json({
      ok: true,
      valid: structural.valid,
      errors: structural.errors || [],
      warnings: structural.warnings || [],
      summary: structural.summary || {},
      quality
    });
  } catch (err) {
    console.error('[Validator] Solution validation error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
