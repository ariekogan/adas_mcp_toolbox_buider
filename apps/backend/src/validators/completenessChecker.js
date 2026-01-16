/**
 * Completeness Checker - checks if all required sections are filled
 * @module validators/completenessChecker
 */

/**
 * @typedef {import('../types/DraftDomain.js').DraftDomain} DraftDomain
 * @typedef {import('../types/DraftDomain.js').ValidationCompleteness} ValidationCompleteness
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
];

/**
 * Check completeness of all domain sections
 * @param {DraftDomain} domain
 * @returns {ValidationCompleteness}
 */
export function checkCompleteness(domain) {
  return {
    problem: isProblemComplete(domain),
    scenarios: areScenariosComplete(domain),
    role: isRoleComplete(domain),
    intents: areIntentsComplete(domain),
    tools: areToolsComplete(domain),
    policy: isPolicyComplete(domain),
    engine: true, // Engine always has defaults
    mocks_tested: areMocksTested(domain),
  };
}

/**
 * Check if problem section is complete
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function isProblemComplete(domain) {
  const { problem } = domain;
  if (!problem) return false;

  // Statement must be meaningful (at least 10 chars)
  return Boolean(problem.statement && problem.statement.length >= 10);
}

/**
 * Check if scenarios section is complete
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function areScenariosComplete(domain) {
  // Need at least 1 scenario (relaxed from 2 for MVP)
  if (!domain.scenarios || domain.scenarios.length < 1) {
    return false;
  }

  // Each scenario needs at least a title
  return domain.scenarios.every(s => s.title && s.title.length > 0);
}

/**
 * Check if role section is complete
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function isRoleComplete(domain) {
  const { role } = domain;
  if (!role) return false;

  // Role needs name and persona at minimum
  return Boolean(role.name && role.name.length > 0 && role.persona && role.persona.length > 0);
}

/**
 * Check if intents section is complete
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function areIntentsComplete(domain) {
  const { intents } = domain;
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
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function areToolsComplete(domain) {
  // Need at least 1 tool
  if (!domain.tools || domain.tools.length < 1) {
    return false;
  }

  // Each tool needs name, description, inputs, and output
  return domain.tools.every(tool => {
    const hasName = tool.name && tool.name.length > 0;
    const hasDescription = tool.description && tool.description.length > 0;
    const hasOutput = tool.output && tool.output.description;

    return hasName && hasDescription && hasOutput;
  });
}

/**
 * Check if policy section is complete
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function isPolicyComplete(domain) {
  const { policy } = domain;
  if (!policy) return false;

  // Need at least one guardrail (never or always)
  const hasGuardrails =
    (policy.guardrails?.never && policy.guardrails.never.length > 0) ||
    (policy.guardrails?.always && policy.guardrails.always.length > 0);

  return hasGuardrails;
}

/**
 * Check if all mocks are tested
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function areMocksTested(domain) {
  // No tools = vacuously true
  if (!domain.tools || domain.tools.length === 0) {
    return false; // But we need tools, so this is incomplete
  }

  // Every tool must be tested or explicitly skipped
  return domain.tools.every(tool => tool.mock_status !== 'untested');
}

/**
 * Get detailed completeness report
 * @param {DraftDomain} domain
 * @returns {Object}
 */
export function getCompletenessReport(domain) {
  const report = {
    problem: {
      complete: isProblemComplete(domain),
      details: {
        has_statement: Boolean(domain.problem?.statement?.length >= 10),
        has_context: Boolean(domain.problem?.context?.length > 0),
        has_goals: Boolean(domain.problem?.goals?.length > 0),
      },
    },
    scenarios: {
      complete: areScenariosComplete(domain),
      details: {
        count: domain.scenarios?.length || 0,
        min_required: 1,
        with_steps: domain.scenarios?.filter(s => s.steps?.length > 0).length || 0,
      },
    },
    role: {
      complete: isRoleComplete(domain),
      details: {
        has_name: Boolean(domain.role?.name?.length > 0),
        has_persona: Boolean(domain.role?.persona?.length > 0),
        has_goals: Boolean(domain.role?.goals?.length > 0),
        has_limitations: Boolean(domain.role?.limitations?.length > 0),
      },
    },
    intents: {
      complete: areIntentsComplete(domain),
      details: {
        count: domain.intents?.supported?.length || 0,
        min_required: 1,
        with_examples:
          domain.intents?.supported?.filter(i => i.examples?.length > 0).length || 0,
      },
    },
    tools: {
      complete: areToolsComplete(domain),
      details: {
        count: domain.tools?.length || 0,
        min_required: 1,
        fully_defined:
          domain.tools?.filter(t => t.name && t.description && t.output?.description).length || 0,
      },
    },
    policy: {
      complete: isPolicyComplete(domain),
      details: {
        never_count: domain.policy?.guardrails?.never?.length || 0,
        always_count: domain.policy?.guardrails?.always?.length || 0,
        workflows_count: domain.policy?.workflows?.length || 0,
        approvals_count: domain.policy?.approvals?.length || 0,
      },
    },
    mocks: {
      complete: areMocksTested(domain),
      details: {
        total: domain.tools?.length || 0,
        tested: domain.tools?.filter(t => t.mock_status === 'tested').length || 0,
        skipped: domain.tools?.filter(t => t.mock_status === 'skipped').length || 0,
        untested: domain.tools?.filter(t => t.mock_status === 'untested').length || 0,
      },
    },
  };

  // Calculate overall progress percentage
  const sections = ['problem', 'scenarios', 'role', 'intents', 'tools', 'policy', 'mocks'];
  const completedCount = sections.filter(s => report[s].complete).length;
  report.overall_progress = Math.round((completedCount / sections.length) * 100);

  return report;
}

/**
 * Get list of incomplete sections
 * @param {DraftDomain} domain
 * @returns {string[]}
 */
export function getIncompleteSections(domain) {
  const completeness = checkCompleteness(domain);
  const incomplete = [];

  if (!completeness.problem) incomplete.push('problem');
  if (!completeness.scenarios) incomplete.push('scenarios');
  if (!completeness.role) incomplete.push('role');
  if (!completeness.intents) incomplete.push('intents');
  if (!completeness.tools) incomplete.push('tools');
  if (!completeness.policy) incomplete.push('policy');
  if (!completeness.mocks_tested) incomplete.push('mocks');

  return incomplete;
}
