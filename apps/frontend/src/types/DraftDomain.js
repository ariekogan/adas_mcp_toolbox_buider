/**
 * DraftDomain Types for Frontend
 *
 * These match the backend types in apps/backend/src/types/DraftDomain.js
 * @module types/DraftDomain
 */

/**
 * All valid phases in order
 * @type {string[]}
 */
export const PHASES = [
  'PROBLEM_DISCOVERY',
  'SCENARIO_EXPLORATION',
  'INTENT_DEFINITION',
  'TOOLS_PROPOSAL',
  'TOOL_DEFINITION',
  'POLICY_DEFINITION',
  'MOCK_TESTING',
  'READY_TO_EXPORT',
  'EXPORTED'
];

/**
 * Phase display names
 * @type {Object<string, string>}
 */
export const PHASE_LABELS = {
  PROBLEM_DISCOVERY: 'Problem Discovery',
  SCENARIO_EXPLORATION: 'Scenario Exploration',
  INTENT_DEFINITION: 'Intent Definition',
  TOOLS_PROPOSAL: 'Tools Proposal',
  TOOL_DEFINITION: 'Tool Definition',
  POLICY_DEFINITION: 'Policy Definition',
  MOCK_TESTING: 'Mock Testing',
  READY_TO_EXPORT: 'Ready to Export',
  EXPORTED: 'Exported'
};

/**
 * Phase descriptions for UI
 * @type {Object<string, string>}
 */
export const PHASE_DESCRIPTIONS = {
  PROBLEM_DISCOVERY: 'Define the problem you want to solve',
  SCENARIO_EXPLORATION: 'Explore real-world usage scenarios',
  INTENT_DEFINITION: 'Define what requests the agent handles',
  TOOLS_PROPOSAL: 'Propose tools based on intents',
  TOOL_DEFINITION: 'Define tool details and mock data',
  POLICY_DEFINITION: 'Set guardrails and workflows',
  MOCK_TESTING: 'Test tools with sample data',
  READY_TO_EXPORT: 'Review and export domain',
  EXPORTED: 'Domain exported successfully'
};

/**
 * Get phase index
 * @param {string} phase
 * @returns {number}
 */
export function getPhaseIndex(phase) {
  return PHASES.indexOf(phase);
}

/**
 * Check if phase1 comes before phase2
 * @param {string} phase1
 * @param {string} phase2
 * @returns {boolean}
 */
export function isPhaseBefore(phase1, phase2) {
  return getPhaseIndex(phase1) < getPhaseIndex(phase2);
}

/**
 * Get phase progress percentage (0-100)
 * @param {string} phase
 * @returns {number}
 */
export function getPhaseProgress(phase) {
  const index = getPhaseIndex(phase);
  if (index === -1) return 0;
  return Math.round((index / (PHASES.length - 1)) * 100);
}

/**
 * Check if domain is in new format (DraftDomain) vs legacy
 * @param {Object} data
 * @returns {boolean}
 */
export function isDraftDomain(data) {
  // DraftDomain has 'phase' and 'validation', legacy has 'status'
  return data.phase !== undefined && data.validation !== undefined;
}

/**
 * Get validation status color
 * @param {Object} validation
 * @returns {'green' | 'yellow' | 'red'}
 */
export function getValidationColor(validation) {
  if (!validation) return 'red';
  if (validation.ready_to_export) return 'green';
  if (validation.valid) return 'yellow';
  return 'red';
}

/**
 * Get completeness percentage
 * @param {Object} completeness
 * @returns {number}
 */
export function getCompletenessPercent(completeness) {
  if (!completeness) return 0;
  const sections = [
    'problem',
    'scenarios',
    'role',
    'intents',
    'tools',
    'policy',
    'engine',
    'mocks_tested'
  ];
  const completed = sections.filter(s => completeness[s]).length;
  return Math.round((completed / sections.length) * 100);
}

/**
 * Panel mapping for suggested_focus
 * @type {Object<string, string>}
 */
export const FOCUS_PANELS = {
  problem: 'Problem',
  scenarios: 'Scenarios',
  intents: 'Intents',
  tools: 'Tools',
  policy: 'Policy',
  engine: 'Engine',
  export: 'Export'
};

/**
 * Create empty tool for UI
 * @returns {Object}
 */
export function createEmptyTool() {
  return {
    id: `tool_${Date.now()}`,
    id_status: 'temporary',
    name: '',
    description: '',
    inputs: [],
    output: {
      type: 'object',
      description: ''
    },
    policy: {
      allowed: 'always',
      requires_approval: 'never'
    },
    mock: {
      enabled: true,
      mode: 'examples',
      examples: []
    },
    mock_status: 'untested'
  };
}

/**
 * Create empty intent for UI
 * @returns {Object}
 */
export function createEmptyIntent() {
  return {
    id: `intent_${Date.now()}`,
    description: '',
    examples: [],
    maps_to_workflow_resolved: true,
    entities: []
  };
}

/**
 * Create empty scenario for UI
 * @returns {Object}
 */
export function createEmptyScenario() {
  return {
    id: `scenario_${Date.now()}`,
    title: '',
    description: '',
    steps: [],
    expected_outcome: ''
  };
}

/**
 * Create empty workflow for UI
 * @returns {Object}
 */
export function createEmptyWorkflow() {
  return {
    id: `workflow_${Date.now()}`,
    name: '',
    description: '',
    trigger: '',
    steps: [],
    steps_resolved: [],
    required: false
  };
}

export default {
  PHASES,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  getPhaseIndex,
  isPhaseBefore,
  getPhaseProgress,
  isDraftDomain,
  getValidationColor,
  getCompletenessPercent,
  FOCUS_PANELS,
  createEmptyTool,
  createEmptyIntent,
  createEmptyScenario,
  createEmptyWorkflow
};
