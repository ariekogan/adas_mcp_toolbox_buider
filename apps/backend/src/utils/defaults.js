/**
 * Default values for DraftSkill
 *
 * Structural defaults (engine, policy, intents, role, etc.) come from
 * the SHARED ensureSkillDefaults() in @adas/skill-validator — SAME CODE
 * used by both Skill Builder (design-time) and ADAS Core (runtime).
 *
 * This file adds Builder-specific fields (validation state) on top.
 *
 * @module utils/defaults
 */

import { v4 as uuidv4 } from 'uuid';
import { ensureSkillDefaults } from '@adas/skill-validator';

/**
 * Create an empty DraftSkill with default values.
 * Uses shared ensureSkillDefaults() for structural defaults,
 * then adds Builder-specific fields (validation).
 *
 * @param {string} id - Domain ID
 * @param {string} name - Domain name
 * @returns {import('../types/DraftSkill.js').DraftSkill}
 */
export function createEmptyDraftSkill(id, name) {
  // Shared defaults (same code as Core runtime)
  const skill = ensureSkillDefaults({ id, name });

  // Builder-specific: validation state (not needed at runtime)
  skill.validation = createEmptyValidation();

  return skill;
}

/**
 * Create empty validation result
 * @returns {import('../types/DraftSkill.js').ValidationResult}
 */
export function createEmptyValidation() {
  return {
    valid: true,
    ready_to_export: false,
    errors: [],
    warnings: [],
    unresolved: {
      tools: [],
      workflows: [],
      intents: [],
    },
    completeness: {
      problem: false,
      scenarios: false,
      role: false,
      intents: false,
      tools: false,
      policy: false,
      engine: true, // Has defaults
      mocks_tested: false,
    },
  };
}

/**
 * Create a new empty scenario
 * @param {Partial<import('../types/DraftSkill.js').Scenario>} [overrides]
 * @returns {import('../types/DraftSkill.js').Scenario}
 */
export function createEmptyScenario(overrides = {}) {
  return {
    id: uuidv4(),
    title: '',
    description: '',
    steps: [],
    expected_outcome: '',
    ...overrides,
  };
}

/**
 * Create a new empty intent
 * @param {Partial<import('../types/DraftSkill.js').Intent>} [overrides]
 * @returns {import('../types/DraftSkill.js').Intent}
 */
export function createEmptyIntent(overrides = {}) {
  return {
    id: uuidv4(),
    description: '',
    examples: [],
    maps_to_workflow: undefined,
    maps_to_workflow_resolved: true, // No reference = resolved
    entities: [],
    ...overrides,
  };
}

/**
 * Create a new empty tool
 * @param {Partial<import('../types/DraftSkill.js').Tool>} [overrides]
 * @returns {import('../types/DraftSkill.js').Tool}
 */
export function createEmptyTool(overrides = {}) {
  return {
    id: uuidv4(),
    id_status: 'temporary',
    name: '',
    description: '',
    inputs: [],
    output: {
      type: 'object',
      description: '',
    },
    policy: {
      allowed: 'always',
      requires_approval: 'never',
    },
    mock: {
      enabled: true,
      mode: 'examples',
      examples: [],
    },
    mock_status: 'untested',
    ...overrides,
  };
}

/**
 * Create a new tool input
 * @param {Partial<import('../types/DraftSkill.js').ToolInput>} [overrides]
 * @returns {import('../types/DraftSkill.js').ToolInput}
 */
export function createEmptyToolInput(overrides = {}) {
  return {
    name: '',
    type: 'string',
    required: true,
    description: '',
    ...overrides,
  };
}

/**
 * Create a new mock example
 * @param {Partial<import('../types/DraftSkill.js').MockExample>} [overrides]
 * @returns {import('../types/DraftSkill.js').MockExample}
 */
export function createEmptyMockExample(overrides = {}) {
  return {
    id: uuidv4(),
    input: {},
    output: null,
    description: '',
    ...overrides,
  };
}

/**
 * Create a new meta tool (DAL-generated composition)
 * @param {Partial<import('../types/DraftSkill.js').MetaTool>} [overrides]
 * @returns {import('../types/DraftSkill.js').MetaTool}
 */
export function createEmptyMetaTool(overrides = {}) {
  return {
    id: uuidv4(),
    name: '',
    description: '',
    composes: [],
    logic: '',
    status: 'pending',
    suggested_by: 'dal',
    suggested_reason: '',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a new workflow
 * @param {Partial<import('../types/DraftSkill.js').Workflow>} [overrides]
 * @returns {import('../types/DraftSkill.js').Workflow}
 */
export function createEmptyWorkflow(overrides = {}) {
  return {
    id: uuidv4(),
    name: '',
    description: '',
    trigger: '',
    steps: [],
    steps_resolved: [],
    required: false,
    ...overrides,
  };
}

/**
 * Create a new approval rule
 * @param {Partial<import('../types/DraftSkill.js').ApprovalRule>} [overrides]
 * @returns {import('../types/DraftSkill.js').ApprovalRule}
 */
export function createEmptyApprovalRule(overrides = {}) {
  return {
    id: uuidv4(),
    tool_id: '',
    tool_id_resolved: false,
    conditions: [],
    ...overrides,
  };
}

/**
 * Create a new policy condition
 * @param {Partial<import('../types/DraftSkill.js').PolicyCondition>} [overrides]
 * @returns {import('../types/DraftSkill.js').PolicyCondition}
 */
export function createEmptyPolicyCondition(overrides = {}) {
  return {
    when: '',
    action: 'allow',
    message: '',
    ...overrides,
  };
}

/**
 * Generate a unique ID
 * @returns {string}
 */
export function generateId() {
  return uuidv4();
}

// ═══════════════════════════════════════════════════════════════
// TRIGGER HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new schedule trigger
 * @param {Partial<import('../types/DraftSkill.js').ScheduleTrigger>} [overrides]
 * @returns {import('../types/DraftSkill.js').ScheduleTrigger}
 */
export function createEmptyScheduleTrigger(overrides = {}) {
  return {
    id: uuidv4(),
    type: 'schedule',
    enabled: true,
    concurrency: 1,
    every: 'PT5M', // 5 minutes default
    prompt: '',
    input: {},
    ...overrides,
  };
}

/**
 * Create a new event trigger
 * @param {Partial<import('../types/DraftSkill.js').EventTrigger>} [overrides]
 * @returns {import('../types/DraftSkill.js').EventTrigger}
 */
export function createEmptyEventTrigger(overrides = {}) {
  return {
    id: uuidv4(),
    type: 'event',
    enabled: false, // Disabled by default - requires explicit setup
    concurrency: 1,
    event: '',
    filter: {},
    prompt: '',
    input: {},
    ...overrides,
  };
}

/**
 * Create an empty trigger (defaults to schedule type)
 * @param {'schedule' | 'event'} [type='schedule']
 * @param {Object} [overrides]
 * @returns {import('../types/DraftSkill.js').Trigger}
 */
export function createEmptyTrigger(type = 'schedule', overrides = {}) {
  if (type === 'event') {
    return createEmptyEventTrigger(overrides);
  }
  return createEmptyScheduleTrigger(overrides);
}
