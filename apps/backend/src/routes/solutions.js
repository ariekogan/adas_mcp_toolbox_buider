/**
 * Solutions API Routes
 *
 * Manages Solution definitions — the cross-skill architecture layer
 * that captures handoff flows, grant economy, channel routing, and
 * security contracts between skills.
 */

import { Router } from 'express';
import solutionsStore from '../store/solutions.js';
import skillsStore from '../store/skills.js';
import { processSolutionMessage } from '../services/solutionConversation.js';
import { validateSolution } from '../validators/solutionValidator.js';
import { validateSecurity } from '../validators/securityValidator.js';
import skillsRouter from './skills.js';

const router = Router();

// Mount skills router under /solutions/:solutionId/skills
router.use('/:solutionId/skills', skillsRouter);

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
 * Validate solution including all skills
 * GET /api/solutions/:id/validate
 *
 * Returns aggregated validation from:
 * - Solution-level validation (grants, handoffs, routing, security_contracts)
 * - Per-skill validation (tools, security classifications, access policies, etc.)
 */
router.get('/:id/validate', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);

    // Load all skills in this solution
    const skillList = await skillsStore.list(req.params.id);
    const skills = await Promise.all(
      skillList.map(async (s) => {
        try {
          return await skillsStore.load(req.params.id, s.id);
        } catch {
          return s;
        }
      })
    );

    // Solution-level validation
    const solutionValidation = validateSolution(solution);

    // Per-skill validation (includes security validation)
    const skillValidation = validateSkills(skills, solution);

    // Aggregate all issues
    const allErrors = [
      ...solutionValidation.errors,
      ...skillValidation.issues.filter(i => i.severity === 'error'),
    ];
    const allWarnings = [
      ...solutionValidation.warnings,
      ...skillValidation.issues.filter(i => i.severity === 'warning'),
    ];

    res.json({
      validation: {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
        summary: {
          ...solutionValidation.summary,
          skills_validated: skills.length,
          error_count: allErrors.length,
          warning_count: allWarnings.length,
        },
        bySkill: skillValidation.issues.reduce((acc, issue) => {
          if (issue.skillId) {
            if (!acc[issue.skillId]) acc[issue.skillId] = [];
            acc[issue.skillId].push(issue);
          }
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Get comprehensive validation including skills
 * GET /api/solutions/:id/validation
 */
router.get('/:id/validation', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);

    // Load skill list then fetch full data for each skill
    const skillList = await skillsStore.list(req.params.id);
    const skills = await Promise.all(
      skillList.map(async (s) => {
        try {
          return await skillsStore.load(req.params.id, s.id);
        } catch {
          return s; // Fall back to list data if full load fails
        }
      })
    );

    // Solution-level validation
    const solutionValidation = validateSolution(solution);

    // Skill-level validation
    const skillValidation = validateSkills(skills, solution);

    // Combined validation
    const combinedIssues = [
      ...solutionValidation.errors.map(e => ({ ...e, category: 'solution', severity: 'error' })),
      ...solutionValidation.warnings.map(w => ({ ...w, category: 'solution', severity: 'warning' })),
      ...skillValidation.issues,
    ];

    // Calculate overall score
    const errorCount = combinedIssues.filter(i => i.severity === 'error').length;
    const warningCount = combinedIssues.filter(i => i.severity === 'warning').length;
    let score = 100;
    score -= errorCount * 15;
    score -= warningCount * 5;
    score = Math.max(0, Math.min(100, score));

    res.json({
      validation: {
        score,
        status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'valid',
        issues: combinedIssues,
        categories: {
          skills: skillValidation,
          grants: extractCategoryIssues(combinedIssues, 'grants'),
          handoffs: extractCategoryIssues(combinedIssues, 'handoffs'),
          routing: extractCategoryIssues(combinedIssues, 'routing'),
          security: extractCategoryIssues(combinedIssues, 'security'),
        },
        solutionValidation,
        skillValidation,
      },
    });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Validate skills within a solution
 */
function validateSkills(skills, solution) {
  const issues = [];

  // Use solution.skills for topology validation (semantic IDs like 'identity-assurance')
  // Use skills (from skillsStore) for implementation validation (database IDs like 'dom_xxx')
  const solutionSkillIds = new Set((solution.skills || []).map(s => s.id));

  // Validate skill implementations (from skillsStore)
  skills.forEach(skill => {
    const skillName = skill.name || skill.id;
    const toolCount = (skill.tools || []).length;
    const hasPrompt = !!skill.prompt;
    const hasExamples = (skill.example_conversations || []).length > 0;

    if (toolCount === 0) {
      issues.push({
        category: 'skills',
        severity: 'warning',
        title: `${skillName}: No tools defined`,
        detail: 'Define at least one tool for this skill',
        skillId: skill.id,
      });
    }

    if (!hasPrompt) {
      issues.push({
        category: 'skills',
        severity: 'warning',
        title: `${skillName}: No system prompt`,
        detail: 'Add a system prompt to guide the skill behavior',
        skillId: skill.id,
      });
    }

    if (!hasExamples) {
      issues.push({
        category: 'skills',
        severity: 'info',
        title: `${skillName}: No example conversations`,
        detail: 'Consider adding examples for better documentation',
        skillId: skill.id,
      });
    }

    // Run security validation on each skill
    const securityIssues = validateSecurity(skill);
    securityIssues.forEach(issue => {
      issues.push({
        category: 'security',
        severity: issue.severity,
        title: `${skillName}: ${issue.message}`,
        detail: issue.suggestion || '',
        path: issue.path,
        code: issue.code,
        skillId: skill.id,
      });
    });
  });

  // Check solution topology references using solution.skills (semantic IDs)
  const grants = solution.grants || [];
  const handoffs = solution.handoffs || [];
  const routing = solution.routing || {};

  // Validate grant references against solution.skills
  grants.forEach(grant => {
    (grant.issued_by || []).forEach(id => {
      if (!solutionSkillIds.has(id)) {
        issues.push({
          category: 'grants',
          severity: 'error',
          title: `Grant "${grant.key}": Invalid issuer`,
          detail: `Skill "${id}" doesn't exist in solution topology`,
        });
      }
    });

    (grant.consumed_by || []).forEach(id => {
      if (!solutionSkillIds.has(id)) {
        issues.push({
          category: 'grants',
          severity: 'error',
          title: `Grant "${grant.key}": Invalid consumer`,
          detail: `Skill "${id}" doesn't exist in solution topology`,
        });
      }
    });
  });

  // Validate handoff references against solution.skills
  handoffs.forEach(handoff => {
    if (handoff.from && !solutionSkillIds.has(handoff.from)) {
      issues.push({
        category: 'handoffs',
        severity: 'error',
        title: `Handoff: Invalid source "${handoff.from}"`,
        detail: 'Source skill doesn\'t exist in solution topology',
      });
    }
    if (handoff.to && !solutionSkillIds.has(handoff.to)) {
      issues.push({
        category: 'handoffs',
        severity: 'error',
        title: `Handoff: Invalid target "${handoff.to}"`,
        detail: 'Target skill doesn\'t exist in solution topology',
      });
    }
  });

  // Validate routing references against solution.skills
  Object.entries(routing).forEach(([channel, config]) => {
    if (config.default_skill && !solutionSkillIds.has(config.default_skill)) {
      issues.push({
        category: 'routing',
        severity: 'error',
        title: `Channel "${channel}": Invalid skill`,
        detail: `Skill "${config.default_skill}" doesn't exist in solution topology`,
      });
    }
  });

  return {
    count: skills.length,
    issues,
    status: issues.some(i => i.severity === 'error') ? 'error' :
            issues.some(i => i.severity === 'warning') ? 'warning' : 'valid',
  };
}

/**
 * Extract issues by category
 */
function extractCategoryIssues(issues, category) {
  const categoryIssues = issues.filter(i => i.category === category);
  return {
    count: categoryIssues.length,
    issues: categoryIssues,
    status: categoryIssues.some(i => i.severity === 'error') ? 'error' :
            categoryIssues.some(i => i.severity === 'warning') ? 'warning' : 'valid',
  };
}

/**
 * Export comprehensive validation report (for PB consumption)
 * GET /api/solutions/:id/validation-report
 *
 * Returns a structured report with three validation levels:
 * - Level 1: Technical (ID mismatches, missing references)
 * - Level 2: Completeness (missing descriptions, tools, prompts)
 * - Level 3: Intelligent (placeholder - requires LLM analysis)
 */
router.get('/:id/validation-report', async (req, res, next) => {
  try {
    const solution = await solutionsStore.load(req.params.id);

    // Load full skill data (not just list summaries) for accurate validation
    const skillList = await skillsStore.list(req.params.id);
    const skills = await Promise.all(
      skillList.map(async (s) => {
        try {
          return await skillsStore.load(req.params.id, s.id);
        } catch {
          return s; // Fall back to list data if full load fails
        }
      })
    );

    // Build skill lookup maps
    const skillsById = new Map(skills.map(s => [s.id, s]));
    const skillsByName = new Map(skills.map(s => [normalizeSkillName(s.name), s]));
    const topologySkillIds = new Set((solution.skills || []).map(s => s.id));

    const report = {
      solution_id: solution.id,
      solution_name: solution.name,
      generated_at: new Date().toISOString(),
      summary: { errors: 0, warnings: 0, info: 0 },

      // Skill ID mapping (topology → implementation)
      skill_mapping: buildSkillMapping(solution.skills || [], skills),

      // Level 1: Technical Issues
      level_1_technical: {
        title: 'Technical Issues',
        description: 'ID mismatches, missing references, structural problems',
        issues: []
      },

      // Level 2: Completeness Issues
      level_2_completeness: {
        title: 'Completeness Issues',
        description: 'Missing descriptions, tools, prompts, examples',
        issues: []
      },

      // Level 3: Intelligent Analysis (placeholder)
      level_3_intelligent: {
        title: 'Intelligent Analysis',
        description: 'Tool coverage, security alignment, design coherence',
        issues: [],
        _note: 'Requires LLM analysis - not yet implemented'
      }
    };

    // ═══════════════════════════════════════════════════════════
    // LEVEL 1: Technical Validation
    // ═══════════════════════════════════════════════════════════

    // Check topology skill → implementation skill mapping
    (solution.skills || []).forEach(topologySkill => {
      const implSkill = findMatchingSkill(topologySkill.id, skills);
      if (!implSkill) {
        report.level_1_technical.issues.push({
          severity: 'error',
          code: 'UNMAPPED_TOPOLOGY_SKILL',
          message: `Topology skill "${topologySkill.id}" has no matching implementation`,
          context: { topology_id: topologySkill.id, role: topologySkill.role },
          suggestion: `Create a skill named "${topologySkill.id}" or map existing skill to this topology entry`
        });
      }
    });

    // Check grants reference valid topology skills
    (solution.grants || []).forEach(grant => {
      (grant.issued_by || []).forEach(id => {
        if (!topologySkillIds.has(id)) {
          report.level_1_technical.issues.push({
            severity: 'error',
            code: 'INVALID_GRANT_ISSUER',
            message: `Grant "${grant.key}" references unknown issuer "${id}"`,
            context: { grant_key: grant.key, invalid_id: id },
            suggestion: `Add "${id}" to solution.skills or update grant to use valid skill ID`
          });
        }
      });

      (grant.consumed_by || []).forEach(id => {
        if (!topologySkillIds.has(id)) {
          report.level_1_technical.issues.push({
            severity: 'error',
            code: 'INVALID_GRANT_CONSUMER',
            message: `Grant "${grant.key}" references unknown consumer "${id}"`,
            context: { grant_key: grant.key, invalid_id: id },
            suggestion: `Add "${id}" to solution.skills or update grant to use valid skill ID`
          });
        }
      });
    });

    // Check handoffs reference valid topology skills
    (solution.handoffs || []).forEach(handoff => {
      if (handoff.from && !topologySkillIds.has(handoff.from)) {
        report.level_1_technical.issues.push({
          severity: 'error',
          code: 'INVALID_HANDOFF_SOURCE',
          message: `Handoff references unknown source "${handoff.from}"`,
          context: { handoff_id: handoff.id, invalid_id: handoff.from },
          suggestion: `Add "${handoff.from}" to solution.skills or update handoff`
        });
      }
      if (handoff.to && !topologySkillIds.has(handoff.to)) {
        report.level_1_technical.issues.push({
          severity: 'error',
          code: 'INVALID_HANDOFF_TARGET',
          message: `Handoff references unknown target "${handoff.to}"`,
          context: { handoff_id: handoff.id, invalid_id: handoff.to },
          suggestion: `Add "${handoff.to}" to solution.skills or update handoff`
        });
      }
    });

    // Check routing references valid topology skills
    Object.entries(solution.routing || {}).forEach(([channel, config]) => {
      if (config.default_skill && !topologySkillIds.has(config.default_skill)) {
        report.level_1_technical.issues.push({
          severity: 'error',
          code: 'INVALID_ROUTING_SKILL',
          message: `Channel "${channel}" routes to unknown skill "${config.default_skill}"`,
          context: { channel, invalid_id: config.default_skill },
          suggestion: `Add "${config.default_skill}" to solution.skills or update routing`
        });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // LEVEL 2: Completeness Validation
    // ═══════════════════════════════════════════════════════════

    // Check each implementation skill for completeness
    skills.forEach(skill => {
      const toolCount = (skill.tools || []).length;

      if (toolCount === 0) {
        report.level_2_completeness.issues.push({
          severity: 'warning',
          code: 'NO_TOOLS',
          message: `Skill "${skill.name}" has no tools defined`,
          context: { skill_id: skill.id, skill_name: skill.name },
          suggestion: 'Define at least one tool for the skill to function'
        });
      }

      if (!skill.prompt) {
        report.level_2_completeness.issues.push({
          severity: 'warning',
          code: 'NO_PROMPT',
          message: `Skill "${skill.name}" has no system prompt`,
          context: { skill_id: skill.id, skill_name: skill.name },
          suggestion: 'Add a system prompt to guide skill behavior'
        });
      }

      if (!skill.problem?.statement) {
        report.level_2_completeness.issues.push({
          severity: 'info',
          code: 'NO_PROBLEM_STATEMENT',
          message: `Skill "${skill.name}" has no problem statement`,
          context: { skill_id: skill.id, skill_name: skill.name },
          suggestion: 'Document the problem this skill solves'
        });
      }

      if (!(skill.example_conversations || []).length) {
        report.level_2_completeness.issues.push({
          severity: 'info',
          code: 'NO_EXAMPLES',
          message: `Skill "${skill.name}" has no example conversations`,
          context: { skill_id: skill.id, skill_name: skill.name },
          suggestion: 'Add examples for documentation and testing'
        });
      }
    });

    // Check topology skills for completeness
    (solution.skills || []).forEach(topologySkill => {
      if (!topologySkill.description) {
        report.level_2_completeness.issues.push({
          severity: 'warning',
          code: 'NO_TOPOLOGY_DESCRIPTION',
          message: `Topology skill "${topologySkill.id}" has no description`,
          context: { topology_id: topologySkill.id },
          suggestion: 'Add a description to document the skill\'s purpose'
        });
      }

      if (!topologySkill.role) {
        report.level_2_completeness.issues.push({
          severity: 'warning',
          code: 'NO_TOPOLOGY_ROLE',
          message: `Topology skill "${topologySkill.id}" has no role`,
          context: { topology_id: topologySkill.id },
          suggestion: 'Assign a role (gateway, worker, orchestrator, approval)'
        });
      }
    });

    // Check grants for completeness
    (solution.grants || []).forEach(grant => {
      if (!grant.description) {
        report.level_2_completeness.issues.push({
          severity: 'info',
          code: 'NO_GRANT_DESCRIPTION',
          message: `Grant "${grant.key}" has no description`,
          context: { grant_key: grant.key },
          suggestion: 'Document what this grant authorizes'
        });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // LEVEL 3: Intelligent Analysis (placeholder)
    // ═══════════════════════════════════════════════════════════

    report.level_3_intelligent.issues.push({
      severity: 'info',
      code: 'LLM_ANALYSIS_PENDING',
      message: 'Intelligent analysis requires LLM processing',
      context: {
        available_checks: [
          'Tool coverage vs skill purpose',
          'Security policy vs grant configuration',
          'Handoff flow coherence',
          'Missing skill capabilities'
        ]
      },
      suggestion: 'Feed this report to PB for intelligent analysis'
    });

    // ═══════════════════════════════════════════════════════════
    // Calculate summary
    // ═══════════════════════════════════════════════════════════

    const allIssues = [
      ...report.level_1_technical.issues,
      ...report.level_2_completeness.issues,
      ...report.level_3_intelligent.issues
    ];

    report.summary.errors = allIssues.filter(i => i.severity === 'error').length;
    report.summary.warnings = allIssues.filter(i => i.severity === 'warning').length;
    report.summary.info = allIssues.filter(i => i.severity === 'info').length;
    report.summary.total = allIssues.length;
    report.summary.status = report.summary.errors > 0 ? 'error' :
                           report.summary.warnings > 0 ? 'warning' : 'valid';

    res.json({ report });

  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Solution not found' });
    }
    next(err);
  }
});

/**
 * Normalize skill name for matching (lowercase, remove spaces/dashes)
 */
function normalizeSkillName(name) {
  return (name || '').toLowerCase().replace(/[\s\-_]+/g, '');
}

/**
 * Find matching implementation skill for a topology skill ID
 */
function findMatchingSkill(topologyId, skills) {
  const normalizedId = normalizeSkillName(topologyId);
  return skills.find(s =>
    normalizeSkillName(s.name) === normalizedId ||
    normalizeSkillName(s.id) === normalizedId ||
    s.original_skill_id === topologyId
  );
}

/**
 * Build mapping between topology skills and implementation skills
 */
function buildSkillMapping(topologySkills, implSkills) {
  const mapping = [];

  topologySkills.forEach(topoSkill => {
    const matched = findMatchingSkill(topoSkill.id, implSkills);
    mapping.push({
      topology_id: topoSkill.id,
      topology_role: topoSkill.role,
      implementation_id: matched?.id || null,
      implementation_name: matched?.name || null,
      status: matched ? 'mapped' : 'unmapped'
    });
  });

  // Check for orphan implementations (skills not in topology)
  implSkills.forEach(implSkill => {
    const inTopology = topologySkills.some(t =>
      findMatchingSkill(t.id, [implSkill])
    );
    if (!inTopology) {
      mapping.push({
        topology_id: null,
        topology_role: null,
        implementation_id: implSkill.id,
        implementation_name: implSkill.name,
        status: 'orphan'
      });
    }
  });

  return mapping;
}

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
