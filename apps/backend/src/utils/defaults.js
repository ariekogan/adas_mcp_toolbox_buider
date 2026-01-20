/**
 * Default values for DraftDomain
 * @module utils/defaults
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Create an empty DraftDomain with default values
 * @param {string} id - Domain ID
 * @param {string} name - Domain name
 * @returns {import('../types/DraftDomain.js').DraftDomain}
 */
export function createEmptyDraftDomain(id, name) {
  const now = new Date().toISOString();

  return {
    id,
    name,
    description: '',
    version: '0.1.0',
    phase: 'PROBLEM_DISCOVERY',
    created_at: now,
    updated_at: now,

    problem: {
      statement: '',
      context: '',
      goals: [],
    },
    scenarios: [],

    role: {
      name: '',
      persona: '',
      goals: [],
      limitations: [],
    },
    glossary: {},

    intents: {
      supported: [],
      thresholds: {
        accept: 0.8,
        clarify: 0.5,
        reject: 0.5,
      },
      out_of_domain: {
        action: 'redirect',
        message: '',
      },
    },

    engine: {
      rv2: {
        max_iterations: 10,
        iteration_timeout_ms: 30000,
        allow_parallel_tools: false,
        on_max_iterations: 'ask_user',
      },
      hlr: {
        enabled: true,
        critic: {
          enabled: true,
          check_interval: 3,
          strictness: 'medium',
        },
        reflection: {
          enabled: true,
          depth: 'shallow',
        },
        replanning: {
          enabled: true,
          max_replans: 2,
        },
      },
      autonomy: {
        level: 'supervised',
      },
      finalization_gate: {
        enabled: true,
        max_retries: 2,
      },
      internal_error: {
        enabled: true,
        tool_not_found: {
          enter_resolution_after: 1,
          retryable: false,
        },
        resolution: {
          max_iterations: 1,
          allowed_capabilities: ['read', 'search', 'document_output'],
        },
        loop_detection: {
          enabled: true,
          identical_call_threshold: 2,
        },
      },
    },

    toolbox_imports: [],
    tools: [],
    meta_tools: [], // DAL-generated tool compositions
    triggers: [], // Automation triggers (schedule, event)

    policy: {
      guardrails: {
        never: [],
        always: [],
      },
      approvals: [],
      workflows: [],
      escalation: {
        enabled: false,
        conditions: [],
        target: '',
      },
    },

    channels: [],

    validation: createEmptyValidation(),

    conversation: [],
  };
}

/**
 * Create empty validation result
 * @returns {import('../types/DraftDomain.js').ValidationResult}
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
 * @param {Partial<import('../types/DraftDomain.js').Scenario>} [overrides]
 * @returns {import('../types/DraftDomain.js').Scenario}
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
 * @param {Partial<import('../types/DraftDomain.js').Intent>} [overrides]
 * @returns {import('../types/DraftDomain.js').Intent}
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
 * @param {Partial<import('../types/DraftDomain.js').Tool>} [overrides]
 * @returns {import('../types/DraftDomain.js').Tool}
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
 * @param {Partial<import('../types/DraftDomain.js').ToolInput>} [overrides]
 * @returns {import('../types/DraftDomain.js').ToolInput}
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
 * @param {Partial<import('../types/DraftDomain.js').MockExample>} [overrides]
 * @returns {import('../types/DraftDomain.js').MockExample}
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
 * @param {Partial<import('../types/DraftDomain.js').MetaTool>} [overrides]
 * @returns {import('../types/DraftDomain.js').MetaTool}
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
 * @param {Partial<import('../types/DraftDomain.js').Workflow>} [overrides]
 * @returns {import('../types/DraftDomain.js').Workflow}
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
 * @param {Partial<import('../types/DraftDomain.js').ApprovalRule>} [overrides]
 * @returns {import('../types/DraftDomain.js').ApprovalRule}
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
 * @param {Partial<import('../types/DraftDomain.js').PolicyCondition>} [overrides]
 * @returns {import('../types/DraftDomain.js').PolicyCondition}
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
 * @param {Partial<import('../types/DraftDomain.js').ScheduleTrigger>} [overrides]
 * @returns {import('../types/DraftDomain.js').ScheduleTrigger}
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
 * @param {Partial<import('../types/DraftDomain.js').EventTrigger>} [overrides]
 * @returns {import('../types/DraftDomain.js').EventTrigger}
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
 * @returns {import('../types/DraftDomain.js').Trigger}
 */
export function createEmptyTrigger(type = 'schedule', overrides = {}) {
  if (type === 'event') {
    return createEmptyEventTrigger(overrides);
  }
  return createEmptyScheduleTrigger(overrides);
}
