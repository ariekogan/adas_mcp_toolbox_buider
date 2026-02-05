/**
 * DraftSkill Types for Frontend
 *
 * These match the backend types in apps/backend/src/types/DraftSkill.js
 * @module types/DraftSkill
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
  READY_TO_EXPORT: 'Review and export skill',
  EXPORTED: 'Skill exported successfully'
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
 * Check if skill is in new format (DraftSkill) vs legacy
 * @param {Object} data
 * @returns {boolean}
 */
export function isDraftSkill(data) {
  // DraftSkill has 'phase' and 'validation', legacy has 'status'
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

// ═══════════════════════════════════════════════════════════════
// TRIGGER TYPES (Scheduler & Automation)
// ═══════════════════════════════════════════════════════════════

/**
 * Valid trigger types
 * @type {string[]}
 */
export const TRIGGER_TYPES = ['schedule', 'event'];

/**
 * Trigger type labels for UI
 * @type {Object<string, string>}
 */
export const TRIGGER_TYPE_LABELS = {
  schedule: 'Schedule (Periodic)',
  event: 'Event (Webhook)'
};

/**
 * Common ISO8601 duration presets for schedule triggers
 * @type {Array<{value: string, label: string}>}
 */
export const SCHEDULE_PRESETS = [
  { value: 'PT1M', label: 'Every 1 minute' },
  { value: 'PT2M', label: 'Every 2 minutes' },
  { value: 'PT5M', label: 'Every 5 minutes' },
  { value: 'PT15M', label: 'Every 15 minutes' },
  { value: 'PT30M', label: 'Every 30 minutes' },
  { value: 'PT1H', label: 'Every 1 hour' },
  { value: 'PT6H', label: 'Every 6 hours' },
  { value: 'PT12H', label: 'Every 12 hours' },
  { value: 'P1D', label: 'Every day' },
  { value: 'P1W', label: 'Every week' }
];

/**
 * Create empty schedule trigger for UI
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createEmptyScheduleTrigger(overrides = {}) {
  return {
    id: `trigger_${Date.now()}`,
    type: 'schedule',
    enabled: true,
    concurrency: 1,
    every: 'PT5M',
    prompt: '',
    input: {},
    ...overrides
  };
}

/**
 * Create empty event trigger for UI
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createEmptyEventTrigger(overrides = {}) {
  return {
    id: `trigger_${Date.now()}`,
    type: 'event',
    enabled: false,
    concurrency: 1,
    event: '',
    filter: {},
    prompt: '',
    input: {},
    ...overrides
  };
}

/**
 * Create empty trigger (defaults to schedule)
 * @param {'schedule' | 'event'} [type='schedule']
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createEmptyTrigger(type = 'schedule', overrides = {}) {
  if (type === 'event') {
    return createEmptyEventTrigger(overrides);
  }
  return createEmptyScheduleTrigger(overrides);
}

/**
 * Parse ISO8601 duration to human-readable string
 * @param {string} duration - e.g., "PT2M", "PT1H", "P1D"
 * @returns {string}
 */
export function formatDuration(duration) {
  if (!duration) return 'Unknown';
  const preset = SCHEDULE_PRESETS.find(p => p.value === duration);
  if (preset) return preset.label;

  // Basic parsing for common patterns
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return duration;

  const [, days, hours, minutes, seconds] = match;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);

  return parts.length ? `Every ${parts.join(' ')}` : duration;
}

export default {
  PHASES,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  getPhaseIndex,
  isPhaseBefore,
  getPhaseProgress,
  isDraftSkill,
  getValidationColor,
  getCompletenessPercent,
  FOCUS_PANELS,
  createEmptyTool,
  createEmptyIntent,
  createEmptyScenario,
  createEmptyWorkflow,
  // Trigger exports
  TRIGGER_TYPES,
  TRIGGER_TYPE_LABELS,
  SCHEDULE_PRESETS,
  createEmptyScheduleTrigger,
  createEmptyEventTrigger,
  createEmptyTrigger,
  formatDuration
};
