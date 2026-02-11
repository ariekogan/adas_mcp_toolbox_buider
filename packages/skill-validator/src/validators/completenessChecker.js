/**
 * Completeness Checker - checks if all required sections are filled
 * @module validators/completenessChecker
 */

/**
 * @typedef {import('../types/DraftSkill.js').DraftSkill} DraftSkill
 * @typedef {import('../types/DraftSkill.js').ValidationCompleteness} ValidationCompleteness
 */

/**
 * Coverage metadata for auto-generating documentation
 * @type {Array<{section: string, field: string, check: string, type: string}>}
 */
export const COVERAGE = [
  { section: 'problem', field: 'problem.statement', check: 'Has statement (≥10 chars)', type: 'completeness' },
  { section: 'scenarios', field: 'scenarios', check: 'At least 1 scenario with title', type: 'completeness' },
  { section: 'role', field: 'role', check: 'Has name and persona', type: 'completeness' },
  { section: 'intents', field: 'intents.supported', check: 'At least 1 intent with description + examples', type: 'completeness' },
  { section: 'tools', field: 'tools', check: 'At least 1 tool with name, description, output', type: 'completeness' },
  { section: 'policy', field: 'policy.guardrails', check: 'At least 1 guardrail (never or always)', type: 'completeness' },
  { section: 'mocks', field: 'tools[].mock_status', check: 'All tools tested or skipped', type: 'completeness' },
  { section: 'identity', field: 'skill_identity', check: 'Has display_name and outbound email configured', type: 'completeness' },
  { section: 'security', field: 'access_policy + grant_mappings', check: 'All high-risk tools have access policies', type: 'completeness' },
];

/**
 * Check completeness of all skill sections
 * @param {DraftSkill} skill
 * @returns {ValidationCompleteness}
 */
export function checkCompleteness(skill) {
  return {
    problem: isProblemComplete(skill),
    scenarios: areScenariosComplete(skill),
    role: isRoleComplete(skill),
    intents: areIntentsComplete(skill),
    tools: areToolsComplete(skill),
    policy: isPolicyComplete(skill),
    engine: true, // Engine always has defaults
    mocks_tested: areMocksTested(skill),
    identity: isIdentityComplete(skill),
    // Identity & Access Control: security completeness
    security: isSecuritySectionComplete(skill),
  };
}

/**
 * Check if problem section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function isProblemComplete(skill) {
  const { problem } = skill;
  if (!problem) return false;

  // Statement must be meaningful (at least 10 chars)
  return Boolean(problem.statement && problem.statement.length >= 10);
}

/**
 * Check if scenarios section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function areScenariosComplete(skill) {
  // Need at least 1 scenario (relaxed from 2 for MVP)
  if (!skill.scenarios || skill.scenarios.length < 1) {
    return false;
  }

  // Each scenario needs at least a title
  return skill.scenarios.every(s => s.title && s.title.length > 0);
}

/**
 * Check if role section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function isRoleComplete(skill) {
  const { role } = skill;
  if (!role) return false;

  // Role needs name and persona at minimum
  return Boolean(role.name && role.name.length > 0 && role.persona && role.persona.length > 0);
}

/**
 * Check if intents section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function areIntentsComplete(skill) {
  const { intents } = skill;
  if (!intents) return false;

  // Need at least 1 intent
  if (!intents.supported || intents.supported.length < 1) {
    return false;
  }

  // Each intent needs description and at least 1 example
  return intents.supported.every(
    i => i.description && i.description.length > 0 && i.examples && i.examples.length >= 1
  );
}

/**
 * Check if tools section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function areToolsComplete(skill) {
  // Need at least 1 tool
  if (!skill.tools || skill.tools.length < 1) {
    return false;
  }

  // Each tool needs name, description, inputs, and output
  return skill.tools.every(tool => {
    const hasName = tool.name && tool.name.length > 0;
    const hasDescription = tool.description && tool.description.length > 0;
    const hasOutput = tool.output && tool.output.description;

    return hasName && hasDescription && hasOutput;
  });
}

/**
 * Check if policy section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function isPolicyComplete(skill) {
  const { policy } = skill;
  if (!policy) return false;

  // Need at least one guardrail (never or always)
  const hasGuardrails =
    (policy.guardrails?.never && policy.guardrails.never.length > 0) ||
    (policy.guardrails?.always && policy.guardrails.always.length > 0);

  return hasGuardrails;
}

/**
 * Check if all mocks are tested
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function areMocksTested(skill) {
  // No tools = vacuously true
  if (!skill.tools || skill.tools.length === 0) {
    return false; // But we need tools, so this is incomplete
  }

  // Every tool must be tested or explicitly skipped
  return skill.tools.every(tool => tool.mock_status !== 'untested');
}

/**
 * Check if identity section is complete
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function isIdentityComplete(skill) {
  const identity = skill.skill_identity;
  if (!identity) return false;

  // Must have display name
  if (!identity.display_name || identity.display_name.length === 0) {
    return false;
  }

  // Must have outbound email configured (from_email) for email channel
  const emailIdentity = identity.channel_identities?.email;
  if (!emailIdentity?.from_email || emailIdentity.from_email.length === 0) {
    return false;
  }

  return true;
}

/**
 * Get detailed completeness report
 * @param {DraftSkill} skill
 * @returns {Object}
 */
export function getCompletenessReport(skill) {
  const report = {
    problem: {
      complete: isProblemComplete(skill),
      details: {
        has_statement: Boolean(skill.problem?.statement?.length >= 10),
        has_context: Boolean(skill.problem?.context?.length > 0),
        has_goals: Boolean(skill.problem?.goals?.length > 0),
      },
    },
    scenarios: {
      complete: areScenariosComplete(skill),
      details: {
        count: skill.scenarios?.length || 0,
        min_required: 1,
        with_steps: skill.scenarios?.filter(s => s.steps?.length > 0).length || 0,
      },
    },
    role: {
      complete: isRoleComplete(skill),
      details: {
        has_name: Boolean(skill.role?.name?.length > 0),
        has_persona: Boolean(skill.role?.persona?.length > 0),
        has_goals: Boolean(skill.role?.goals?.length > 0),
        has_limitations: Boolean(skill.role?.limitations?.length > 0),
      },
    },
    intents: {
      complete: areIntentsComplete(skill),
      details: {
        count: skill.intents?.supported?.length || 0,
        min_required: 1,
        with_examples:
          skill.intents?.supported?.filter(i => i.examples?.length > 0).length || 0,
      },
    },
    tools: {
      complete: areToolsComplete(skill),
      details: {
        count: skill.tools?.length || 0,
        min_required: 1,
        fully_defined:
          skill.tools?.filter(t => t.name && t.description && t.output?.description).length || 0,
      },
    },
    policy: {
      complete: isPolicyComplete(skill),
      details: {
        never_count: skill.policy?.guardrails?.never?.length || 0,
        always_count: skill.policy?.guardrails?.always?.length || 0,
        workflows_count: skill.policy?.workflows?.length || 0,
        approvals_count: skill.policy?.approvals?.length || 0,
      },
    },
    mocks: {
      complete: areMocksTested(skill),
      details: {
        total: skill.tools?.length || 0,
        tested: skill.tools?.filter(t => t.mock_status === 'tested').length || 0,
        skipped: skill.tools?.filter(t => t.mock_status === 'skipped').length || 0,
        untested: skill.tools?.filter(t => t.mock_status === 'untested').length || 0,
      },
    },
    identity: {
      complete: isIdentityComplete(skill),
      details: {
        has_display_name: Boolean(skill.skill_identity?.display_name?.length > 0),
        has_email_from: Boolean(skill.skill_identity?.channel_identities?.email?.from_email?.length > 0),
        has_email_from_name: Boolean(skill.skill_identity?.channel_identities?.email?.from_name?.length > 0),
        is_activated: Boolean(skill.skill_identity?.actor_id),
      },
    },
    // Identity & Access Control: Security section
    security: {
      complete: isSecuritySectionComplete(skill),
      details: {
        has_tool_classifications: Boolean(skill.tools?.some(t => t.security?.classification)),
        has_access_policy: Boolean(skill.access_policy?.rules?.length > 0),
        has_grant_mappings: Boolean(skill.grant_mappings?.length > 0),
        has_response_filters: Boolean(skill.response_filters?.length > 0),
        high_risk_count: skill.tools?.filter(t => ['pii_write', 'financial', 'destructive'].includes(t.security?.classification)).length || 0,
        classified_count: skill.tools?.filter(t => t.security?.classification).length || 0,
        total_tools: skill.tools?.length || 0,
      },
    },
  };

  // Calculate overall progress percentage
  const sections = ['problem', 'scenarios', 'role', 'intents', 'tools', 'policy', 'mocks', 'identity', 'security'];
  const completedCount = sections.filter(s => report[s].complete).length;
  report.overall_progress = Math.round((completedCount / sections.length) * 100);

  return report;
}

/**
 * Check if security section is complete.
 *
 * Security is complete when:
 * - All high-risk tools (pii_write, financial, destructive) have access policies, OR
 * - There are no high-risk tools (vacuously complete)
 *
 * Note: Security is NOT required for export — it's a recommendation.
 * But high-risk tools without policies will generate validation errors.
 *
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function isSecuritySectionComplete(skill) {
  const tools = skill.tools || [];

  // If no tools, security is vacuously complete
  if (tools.length === 0) return true;

  // Find high-risk tools
  const HIGH_RISK = ['pii_write', 'financial', 'destructive'];
  const highRiskTools = tools.filter(t => HIGH_RISK.includes(t.security?.classification));

  // If no high-risk tools, security is complete
  if (highRiskTools.length === 0) return true;

  // Check that each high-risk tool has an access policy
  const policyRules = skill.access_policy?.rules || [];
  const coveredTools = new Set();

  for (const rule of policyRules) {
    for (const toolRef of (rule.tools || [])) {
      if (toolRef === '*') {
        // Wildcard covers all tools
        return true;
      }
      coveredTools.add(toolRef);
    }
  }

  return highRiskTools.every(t => coveredTools.has(t.name));
}

/**
 * Get list of incomplete sections
 * @param {DraftSkill} skill
 * @returns {string[]}
 */
export function getIncompleteSections(skill) {
  const completeness = checkCompleteness(skill);
  const incomplete = [];

  if (!completeness.problem) incomplete.push('problem');
  if (!completeness.scenarios) incomplete.push('scenarios');
  if (!completeness.role) incomplete.push('role');
  if (!completeness.intents) incomplete.push('intents');
  if (!completeness.tools) incomplete.push('tools');
  if (!completeness.policy) incomplete.push('policy');
  if (!completeness.mocks_tested) incomplete.push('mocks');
  if (!completeness.identity) incomplete.push('identity');
  if (!completeness.security) incomplete.push('security');

  return incomplete;
}
