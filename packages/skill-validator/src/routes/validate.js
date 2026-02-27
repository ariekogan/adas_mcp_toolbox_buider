/**
 * Validation API routes
 *
 * POST /validate/skill     — Validate a single skill definition (auto-expands + auto-fixes)
 * POST /validate/solution   — Validate a solution (auto-expands + cross-skill + LLM quality)
 * POST /validate/section    — Validate a single section incrementally (progressive validation)
 * GET  /health              — Health check
 */

import { Router } from 'express';
import { validateDraftSkill } from '../validators/index.js';
import { validateSolution } from '../validators/solutionValidator.js';
import { validateSolutionQuality } from '../validators/solutionQualityValidator.js';
import { expandSkill } from '../services/skillExpander.js';

const router = Router();

/**
 * Auto-expand a skill if it's missing auto-expandable fields.
 */
function autoExpand(skill) {
  const needsExpand = !skill.intents || !skill.scenarios || !skill.role;
  if (!needsExpand) return { skill, expanded_fields: [] };
  const { skill: expanded, expanded_fields } = expandSkill(skill);
  return { skill: expanded, expanded_fields };
}

/**
 * Auto-fix: for each validation error, try to generate a fix using the expander.
 * Returns the fixed skill and list of applied fixes.
 */
function autoFix(skill, errors) {
  if (!errors || errors.length === 0) return { skill, fixes: [] };

  const fixes = [];
  let fixed = { ...skill };

  for (const err of errors) {
    const path = err.path || '';
    const code = err.code || '';

    // Missing problem → generate from description
    if (path.includes('problem') && !fixed.problem?.statement) {
      if (fixed.description) {
        fixed.problem = { statement: fixed.description, context: fixed.description, goals: [] };
        fixes.push({ error: code, path, fix: 'Generated problem.statement from skill description' });
      }
    }

    // Missing tool security classification → default to public
    if (path.includes('security') && path.includes('tools')) {
      const toolIdx = path.match(/tools\[(\d+)\]/)?.[1];
      if (toolIdx !== undefined && fixed.tools?.[toolIdx]) {
        if (!fixed.tools[toolIdx].security?.classification) {
          fixed.tools[toolIdx].security = { classification: 'public' };
          fixes.push({ error: code, path, fix: 'Set security.classification to "public"' });
        }
      }
    }

    // Missing guardrails → add empty
    if (path.includes('guardrails') && !fixed.policy?.guardrails) {
      fixed.policy = { ...(fixed.policy || {}), guardrails: { never: [], always: [] } };
      fixes.push({ error: code, path, fix: 'Added empty guardrails (never: [], always: [])' });
    }

    // Missing tool output → add generic
    if (path.includes('output') && path.includes('tools')) {
      const toolIdx = path.match(/tools\[(\d+)\]/)?.[1];
      if (toolIdx !== undefined && fixed.tools?.[toolIdx] && !fixed.tools[toolIdx].output) {
        fixed.tools[toolIdx].output = { type: 'object', description: 'Result' };
        fixes.push({ error: code, path, fix: 'Added default output: { type: "object", description: "Result" }' });
      }
    }

    // Missing tool input description → add from name
    if (path.includes('description') && path.includes('inputs')) {
      const toolIdx = path.match(/tools\[(\d+)\]/)?.[1];
      const inputIdx = path.match(/inputs\[(\d+)\]/)?.[1];
      if (toolIdx !== undefined && inputIdx !== undefined) {
        const inp = fixed.tools?.[toolIdx]?.inputs?.[inputIdx];
        if (inp && !inp.description) {
          inp.description = inp.name.replace(/_/g, ' ');
          fixes.push({ error: code, path, fix: `Set input description to "${inp.description}"` });
        }
      }
    }
  }

  return { skill: fixed, fixes };
}

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
 * Returns: ValidationResult + auto-fixes if applicable
 *
 * Pipeline: auto-expand → validate → auto-fix → re-validate
 */
router.post('/validate/skill', (req, res) => {
  const { skill } = req.body;

  if (!skill) {
    return res.status(400).json({ ok: false, error: 'Missing "skill" in request body' });
  }

  try {
    // Step 1: Auto-expand minimal skills
    const { skill: expanded, expanded_fields } = autoExpand(skill);

    // Step 2: First validation pass
    let result = validateDraftSkill(expanded);

    // Step 3: Auto-fix if there are errors
    let fixes = [];
    if (result.errors.length > 0) {
      const { skill: fixed, fixes: appliedFixes } = autoFix(expanded, result.errors);
      if (appliedFixes.length > 0) {
        fixes = appliedFixes;
        // Re-validate after fixes
        result = validateDraftSkill(fixed);
      }
    }

    const response = { ok: true, ...result };
    if (expanded_fields.length) response.expanded_fields = expanded_fields;
    if (fixes.length) response.auto_fixes = fixes;
    res.json(response);
  } catch (err) {
    console.error('[Validator] Skill validation error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /validate/section
 *
 * Progressive validation — validate one section at a time as the agent builds.
 * Body: { skill: PartialSkill, section: "problem"|"tools"|"guardrails"|"intents"|... }
 * Returns: { ok, section, valid, errors, message }
 */
router.post('/validate/section', (req, res) => {
  const { skill, section } = req.body;

  if (!skill) {
    return res.status(400).json({ ok: false, error: 'Missing "skill" in request body' });
  }
  if (!section) {
    return res.status(400).json({ ok: false, error: 'Missing "section" — specify which section to validate (e.g., "problem", "tools", "guardrails")' });
  }

  try {
    const checks = {
      problem: () => {
        const p = skill.problem;
        if (!p) return { valid: false, errors: ['Missing problem section'], message: 'Add a problem statement.' };
        const stmt = typeof p === 'string' ? p : p.statement;
        if (!stmt || stmt.length < 10) return { valid: false, errors: ['Problem statement too short (min 10 chars)'], message: 'Describe the problem in at least 10 characters.' };
        return { valid: true, errors: [], message: 'Problem looks good.' };
      },
      tools: () => {
        const tools = skill.tools;
        if (!tools || tools.length === 0) return { valid: false, errors: ['No tools defined'], message: 'Add at least one tool.' };
        const errs = [];
        for (let i = 0; i < tools.length; i++) {
          const t = tools[i];
          if (!t.name) errs.push(`tools[${i}]: missing name`);
          if (!t.description) errs.push(`tools[${i}]: missing description`);
        }
        if (errs.length) return { valid: false, errors: errs, message: `${errs.length} tool issue(s) found.` };
        return { valid: true, errors: [], message: `${tools.length} tools defined. All look good.` };
      },
      guardrails: () => {
        const g = skill.guardrails || skill.policy?.guardrails;
        if (!g) return { valid: true, errors: [], message: 'No guardrails defined (optional — defaults will be used).' };
        const never = g.never || [];
        const always = g.always || [];
        if (never.length === 0 && always.length === 0) return { valid: true, errors: [], message: 'Guardrails section is empty (consider adding constraints).' };
        return { valid: true, errors: [], message: `${never.length} never rules, ${always.length} always rules. Looks good.` };
      },
      intents: () => {
        if (!skill.intents) return { valid: true, errors: [], message: 'No intents defined (will be auto-generated from tools).' };
        const supported = skill.intents.supported || [];
        if (supported.length === 0) return { valid: false, errors: ['Empty supported intents array'], message: 'Add at least one intent or remove the intents section to use auto-generation.' };
        return { valid: true, errors: [], message: `${supported.length} intents defined.` };
      },
      role: () => {
        if (!skill.role) return { valid: true, errors: [], message: 'No role defined (will be auto-generated from problem + tools).' };
        if (!skill.role.persona) return { valid: false, errors: ['Missing role.persona'], message: 'Add a persona description.' };
        return { valid: true, errors: [], message: 'Role looks good.' };
      },
    };

    const checker = checks[section];
    if (!checker) {
      return res.status(400).json({
        ok: false,
        error: `Unknown section "${section}". Valid sections: ${Object.keys(checks).join(', ')}`,
      });
    }

    const result = checker();
    res.json({ ok: true, section, ...result });
  } catch (err) {
    console.error('[Validator] Section validation error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /validate/solution
 *
 * Body: { solution: Solution, skills: DraftSkill[] }
 * Returns: { valid, errors, warnings, summary, quality, expanded_skills? }
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
    // Auto-expand any minimal skills
    const allExpanded = [];
    const expandedSkills = skills.map(s => {
      const { skill: expanded, expanded_fields } = autoExpand(s);
      if (expanded_fields.length) allExpanded.push({ skill_id: s.id, expanded_fields });
      return expanded;
    });

    // Phase 1: Structural validation (cross-skill contracts)
    const context = (connectors || mcp_store) ? { skills: expandedSkills, connectors: connectors || [], mcp_store: mcp_store || {} } : undefined;
    const structural = validateSolution(solution, context);

    // Phase 2: LLM quality scoring
    let quality = null;
    try {
      const qualityResult = await validateSolutionQuality(solution, expandedSkills, {
        llm_provider: process.env.LLM_PROVIDER || 'anthropic',
        api_key: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
        llm_model: process.env.LLM_MODEL
      });
      quality = qualityResult;
    } catch (llmErr) {
      console.warn('[Validator] LLM quality scoring failed:', llmErr.message);
      quality = { error: llmErr.message, note: 'Quality scoring unavailable — structural validation still valid' };
    }

    const response = {
      ok: true,
      valid: structural.valid,
      errors: structural.errors || [],
      warnings: structural.warnings || [],
      summary: structural.summary || {},
      quality
    };
    if (allExpanded.length) response.expanded_skills = allExpanded;
    res.json(response);
  } catch (err) {
    console.error('[Validator] Solution validation error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
