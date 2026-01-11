/**
 * Schema Validator - validates DraftDomain structure
 * @module validators/schemaValidator
 */

/**
 * @typedef {import('../types/DraftDomain.js').ValidationIssue} ValidationIssue
 * @typedef {import('../types/DraftDomain.js').DraftDomain} DraftDomain
 * @typedef {import('../types/DraftDomain.js').Tool} Tool
 * @typedef {import('../types/DraftDomain.js').Intent} Intent
 * @typedef {import('../types/DraftDomain.js').Scenario} Scenario
 */

const VALID_DATA_TYPES = ['string', 'number', 'boolean', 'object', 'array'];
const VALID_PHASES = [
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
 * Validate schema of DraftDomain
 * @param {DraftDomain} domain
 * @returns {ValidationIssue[]}
 */
export function validateSchema(domain) {
  const issues = [];

  // Validate metadata
  issues.push(...validateMetadata(domain));

  // Validate problem
  issues.push(...validateProblem(domain.problem));

  // Validate scenarios
  domain.scenarios.forEach((scenario, i) => {
    issues.push(...validateScenario(scenario, `scenarios[${i}]`));
  });

  // Validate role
  issues.push(...validateRole(domain.role));

  // Validate intents
  issues.push(...validateIntentsConfig(domain.intents));

  // Validate engine
  issues.push(...validateEngine(domain.engine));

  // Validate tools
  domain.tools.forEach((tool, i) => {
    issues.push(...validateTool(tool, `tools[${i}]`));
  });

  // Validate policy
  issues.push(...validatePolicy(domain.policy));

  return issues;
}

/**
 * Validate domain metadata
 * @param {DraftDomain} domain
 * @returns {ValidationIssue[]}
 */
function validateMetadata(domain) {
  const issues = [];

  if (!domain.id || typeof domain.id !== 'string') {
    issues.push({
      code: 'INVALID_ID',
      severity: 'error',
      path: 'id',
      message: 'Domain ID is required and must be a string',
    });
  }

  if (!domain.name || typeof domain.name !== 'string') {
    issues.push({
      code: 'INVALID_NAME',
      severity: 'error',
      path: 'name',
      message: 'Domain name is required and must be a string',
    });
  }

  if (!VALID_PHASES.includes(domain.phase)) {
    issues.push({
      code: 'INVALID_PHASE',
      severity: 'error',
      path: 'phase',
      message: `Invalid phase: ${domain.phase}. Must be one of: ${VALID_PHASES.join(', ')}`,
    });
  }

  return issues;
}

/**
 * Validate problem section
 * @param {DraftDomain['problem']} problem
 * @returns {ValidationIssue[]}
 */
function validateProblem(problem) {
  const issues = [];

  if (!problem) {
    issues.push({
      code: 'MISSING_PROBLEM',
      severity: 'error',
      path: 'problem',
      message: 'Problem section is required',
    });
    return issues;
  }

  if (problem.statement && typeof problem.statement !== 'string') {
    issues.push({
      code: 'INVALID_PROBLEM_STATEMENT',
      severity: 'error',
      path: 'problem.statement',
      message: 'Problem statement must be a string',
    });
  }

  if (problem.goals && !Array.isArray(problem.goals)) {
    issues.push({
      code: 'INVALID_PROBLEM_GOALS',
      severity: 'error',
      path: 'problem.goals',
      message: 'Problem goals must be an array',
    });
  }

  return issues;
}

/**
 * Validate scenario
 * @param {Scenario} scenario
 * @param {string} path
 * @returns {ValidationIssue[]}
 */
function validateScenario(scenario, path) {
  const issues = [];

  if (!scenario.id) {
    issues.push({
      code: 'MISSING_SCENARIO_ID',
      severity: 'error',
      path: `${path}.id`,
      message: 'Scenario ID is required',
    });
  }

  if (!scenario.title || typeof scenario.title !== 'string') {
    issues.push({
      code: 'INVALID_SCENARIO_TITLE',
      severity: 'warning',
      path: `${path}.title`,
      message: 'Scenario title is required',
      suggestion: 'Add a descriptive title for the scenario',
    });
  }

  if (!Array.isArray(scenario.steps)) {
    issues.push({
      code: 'INVALID_SCENARIO_STEPS',
      severity: 'error',
      path: `${path}.steps`,
      message: 'Scenario steps must be an array',
    });
  }

  return issues;
}

/**
 * Validate role section
 * @param {DraftDomain['role']} role
 * @returns {ValidationIssue[]}
 */
function validateRole(role) {
  const issues = [];

  if (!role) {
    issues.push({
      code: 'MISSING_ROLE',
      severity: 'error',
      path: 'role',
      message: 'Role section is required',
    });
    return issues;
  }

  if (role.communication_style) {
    const validTones = ['formal', 'casual', 'technical'];
    const validVerbosities = ['concise', 'balanced', 'detailed'];

    if (role.communication_style.tone && !validTones.includes(role.communication_style.tone)) {
      issues.push({
        code: 'INVALID_TONE',
        severity: 'error',
        path: 'role.communication_style.tone',
        message: `Invalid tone: ${role.communication_style.tone}. Must be one of: ${validTones.join(', ')}`,
      });
    }

    if (role.communication_style.verbosity && !validVerbosities.includes(role.communication_style.verbosity)) {
      issues.push({
        code: 'INVALID_VERBOSITY',
        severity: 'error',
        path: 'role.communication_style.verbosity',
        message: `Invalid verbosity: ${role.communication_style.verbosity}. Must be one of: ${validVerbosities.join(', ')}`,
      });
    }
  }

  return issues;
}

/**
 * Validate intents configuration
 * @param {DraftDomain['intents']} intents
 * @returns {ValidationIssue[]}
 */
function validateIntentsConfig(intents) {
  const issues = [];

  if (!intents) {
    issues.push({
      code: 'MISSING_INTENTS',
      severity: 'error',
      path: 'intents',
      message: 'Intents section is required',
    });
    return issues;
  }

  // Validate thresholds
  if (intents.thresholds) {
    const { accept, clarify, reject } = intents.thresholds;

    if (typeof accept === 'number' && (accept < 0 || accept > 1)) {
      issues.push({
        code: 'INVALID_THRESHOLD',
        severity: 'error',
        path: 'intents.thresholds.accept',
        message: 'Accept threshold must be between 0 and 1',
      });
    }

    if (typeof clarify === 'number' && (clarify < 0 || clarify > 1)) {
      issues.push({
        code: 'INVALID_THRESHOLD',
        severity: 'error',
        path: 'intents.thresholds.clarify',
        message: 'Clarify threshold must be between 0 and 1',
      });
    }
  }

  // Validate each intent
  intents.supported?.forEach((intent, i) => {
    issues.push(...validateIntent(intent, `intents.supported[${i}]`));
  });

  // Validate out_of_domain
  if (intents.out_of_domain) {
    const validActions = ['redirect', 'reject', 'escalate'];
    if (intents.out_of_domain.action && !validActions.includes(intents.out_of_domain.action)) {
      issues.push({
        code: 'INVALID_OOD_ACTION',
        severity: 'error',
        path: 'intents.out_of_domain.action',
        message: `Invalid out-of-domain action: ${intents.out_of_domain.action}. Must be one of: ${validActions.join(', ')}`,
      });
    }
  }

  return issues;
}

/**
 * Validate intent
 * @param {Intent} intent
 * @param {string} path
 * @returns {ValidationIssue[]}
 */
function validateIntent(intent, path) {
  const issues = [];

  if (!intent.id) {
    issues.push({
      code: 'MISSING_INTENT_ID',
      severity: 'error',
      path: `${path}.id`,
      message: 'Intent ID is required',
    });
  }

  if (!intent.description || typeof intent.description !== 'string') {
    issues.push({
      code: 'INVALID_INTENT_DESCRIPTION',
      severity: 'warning',
      path: `${path}.description`,
      message: 'Intent description is required',
      suggestion: 'Add a clear description of what this intent represents',
    });
  }

  if (!Array.isArray(intent.examples) || intent.examples.length === 0) {
    issues.push({
      code: 'MISSING_INTENT_EXAMPLES',
      severity: 'warning',
      path: `${path}.examples`,
      message: 'Intent should have at least one example',
      suggestion: 'Add example phrases that would trigger this intent',
    });
  }

  // Validate entities
  intent.entities?.forEach((entity, i) => {
    if (!entity.name) {
      issues.push({
        code: 'MISSING_ENTITY_NAME',
        severity: 'error',
        path: `${path}.entities[${i}].name`,
        message: 'Entity name is required',
      });
    }
    if (entity.type && !VALID_DATA_TYPES.includes(entity.type)) {
      issues.push({
        code: 'INVALID_ENTITY_TYPE',
        severity: 'error',
        path: `${path}.entities[${i}].type`,
        message: `Invalid entity type: ${entity.type}`,
      });
    }
  });

  return issues;
}

/**
 * Validate engine configuration
 * @param {DraftDomain['engine']} engine
 * @returns {ValidationIssue[]}
 */
function validateEngine(engine) {
  const issues = [];

  if (!engine) {
    issues.push({
      code: 'MISSING_ENGINE',
      severity: 'error',
      path: 'engine',
      message: 'Engine section is required',
    });
    return issues;
  }

  // Validate RV2 config
  if (engine.rv2) {
    if (typeof engine.rv2.max_iterations === 'number' && engine.rv2.max_iterations < 1) {
      issues.push({
        code: 'INVALID_MAX_ITERATIONS',
        severity: 'error',
        path: 'engine.rv2.max_iterations',
        message: 'max_iterations must be at least 1',
      });
    }

    const validOnMax = ['escalate', 'fail', 'ask_user'];
    if (engine.rv2.on_max_iterations && !validOnMax.includes(engine.rv2.on_max_iterations)) {
      issues.push({
        code: 'INVALID_ON_MAX_ITERATIONS',
        severity: 'error',
        path: 'engine.rv2.on_max_iterations',
        message: `Invalid on_max_iterations: ${engine.rv2.on_max_iterations}. Must be one of: ${validOnMax.join(', ')}`,
      });
    }
  }

  // Validate HLR config
  if (engine.hlr?.critic) {
    const validStrictness = ['low', 'medium', 'high'];
    if (engine.hlr.critic.strictness && !validStrictness.includes(engine.hlr.critic.strictness)) {
      issues.push({
        code: 'INVALID_STRICTNESS',
        severity: 'error',
        path: 'engine.hlr.critic.strictness',
        message: `Invalid strictness: ${engine.hlr.critic.strictness}. Must be one of: ${validStrictness.join(', ')}`,
      });
    }
  }

  // Validate autonomy
  if (engine.autonomy) {
    const validLevels = ['autonomous', 'supervised', 'restricted'];
    if (engine.autonomy.level && !validLevels.includes(engine.autonomy.level)) {
      issues.push({
        code: 'INVALID_AUTONOMY_LEVEL',
        severity: 'error',
        path: 'engine.autonomy.level',
        message: `Invalid autonomy level: ${engine.autonomy.level}. Must be one of: ${validLevels.join(', ')}`,
      });
    }
  }

  return issues;
}

/**
 * Validate tool
 * @param {Tool} tool
 * @param {string} path
 * @returns {ValidationIssue[]}
 */
function validateTool(tool, path) {
  const issues = [];

  if (!tool.id) {
    issues.push({
      code: 'MISSING_TOOL_ID',
      severity: 'error',
      path: `${path}.id`,
      message: 'Tool ID is required',
    });
  }

  if (!tool.name || typeof tool.name !== 'string') {
    issues.push({
      code: 'INVALID_TOOL_NAME',
      severity: 'error',
      path: `${path}.name`,
      message: 'Tool name is required and must be a string',
    });
  }

  if (!tool.description || typeof tool.description !== 'string') {
    issues.push({
      code: 'INVALID_TOOL_DESCRIPTION',
      severity: 'warning',
      path: `${path}.description`,
      message: 'Tool description is required',
      suggestion: 'Add a clear description of what this tool does',
    });
  }

  // Validate inputs
  if (!Array.isArray(tool.inputs)) {
    issues.push({
      code: 'INVALID_TOOL_INPUTS',
      severity: 'error',
      path: `${path}.inputs`,
      message: 'Tool inputs must be an array',
    });
  } else {
    tool.inputs.forEach((input, i) => {
      if (!input.name) {
        issues.push({
          code: 'MISSING_INPUT_NAME',
          severity: 'error',
          path: `${path}.inputs[${i}].name`,
          message: 'Input name is required',
        });
      }
      if (input.type && !VALID_DATA_TYPES.includes(input.type)) {
        issues.push({
          code: 'INVALID_INPUT_TYPE',
          severity: 'error',
          path: `${path}.inputs[${i}].type`,
          message: `Invalid input type: ${input.type}. Must be one of: ${VALID_DATA_TYPES.join(', ')}`,
        });
      }
    });
  }

  // Validate output
  if (!tool.output) {
    issues.push({
      code: 'MISSING_TOOL_OUTPUT',
      severity: 'error',
      path: `${path}.output`,
      message: 'Tool output is required',
    });
  } else {
    if (tool.output.type && !VALID_DATA_TYPES.includes(tool.output.type)) {
      issues.push({
        code: 'INVALID_OUTPUT_TYPE',
        severity: 'error',
        path: `${path}.output.type`,
        message: `Invalid output type: ${tool.output.type}. Must be one of: ${VALID_DATA_TYPES.join(', ')}`,
      });
    }
  }

  // Validate tool policy
  if (tool.policy) {
    const validAllowed = ['always', 'conditional', 'never'];
    if (tool.policy.allowed && !validAllowed.includes(tool.policy.allowed)) {
      issues.push({
        code: 'INVALID_TOOL_POLICY_ALLOWED',
        severity: 'error',
        path: `${path}.policy.allowed`,
        message: `Invalid allowed value: ${tool.policy.allowed}. Must be one of: ${validAllowed.join(', ')}`,
      });
    }
  }

  // Validate mock
  if (tool.mock) {
    const validModes = ['examples', 'llm', 'hybrid'];
    if (tool.mock.mode && !validModes.includes(tool.mock.mode)) {
      issues.push({
        code: 'INVALID_MOCK_MODE',
        severity: 'error',
        path: `${path}.mock.mode`,
        message: `Invalid mock mode: ${tool.mock.mode}. Must be one of: ${validModes.join(', ')}`,
      });
    }
  }

  // Validate mock_status
  const validMockStatuses = ['untested', 'tested', 'skipped'];
  if (tool.mock_status && !validMockStatuses.includes(tool.mock_status)) {
    issues.push({
      code: 'INVALID_MOCK_STATUS',
      severity: 'error',
      path: `${path}.mock_status`,
      message: `Invalid mock_status: ${tool.mock_status}. Must be one of: ${validMockStatuses.join(', ')}`,
    });
  }

  return issues;
}

/**
 * Validate policy section
 * @param {DraftDomain['policy']} policy
 * @returns {ValidationIssue[]}
 */
function validatePolicy(policy) {
  const issues = [];

  if (!policy) {
    issues.push({
      code: 'MISSING_POLICY',
      severity: 'error',
      path: 'policy',
      message: 'Policy section is required',
    });
    return issues;
  }

  // Validate guardrails
  if (policy.guardrails) {
    if (policy.guardrails.never && !Array.isArray(policy.guardrails.never)) {
      issues.push({
        code: 'INVALID_GUARDRAILS_NEVER',
        severity: 'error',
        path: 'policy.guardrails.never',
        message: 'guardrails.never must be an array',
      });
    }
    if (policy.guardrails.always && !Array.isArray(policy.guardrails.always)) {
      issues.push({
        code: 'INVALID_GUARDRAILS_ALWAYS',
        severity: 'error',
        path: 'policy.guardrails.always',
        message: 'guardrails.always must be an array',
      });
    }
  }

  // Validate workflows
  policy.workflows?.forEach((workflow, i) => {
    if (!workflow.id) {
      issues.push({
        code: 'MISSING_WORKFLOW_ID',
        severity: 'error',
        path: `policy.workflows[${i}].id`,
        message: 'Workflow ID is required',
      });
    }
    if (!workflow.name) {
      issues.push({
        code: 'MISSING_WORKFLOW_NAME',
        severity: 'warning',
        path: `policy.workflows[${i}].name`,
        message: 'Workflow name is recommended',
      });
    }
    if (!Array.isArray(workflow.steps)) {
      issues.push({
        code: 'INVALID_WORKFLOW_STEPS',
        severity: 'error',
        path: `policy.workflows[${i}].steps`,
        message: 'Workflow steps must be an array',
      });
    }
  });

  // Validate approval rules
  policy.approvals?.forEach((approval, i) => {
    if (!approval.id) {
      issues.push({
        code: 'MISSING_APPROVAL_ID',
        severity: 'error',
        path: `policy.approvals[${i}].id`,
        message: 'Approval rule ID is required',
      });
    }
    if (!approval.tool_id) {
      issues.push({
        code: 'MISSING_APPROVAL_TOOL_ID',
        severity: 'error',
        path: `policy.approvals[${i}].tool_id`,
        message: 'Approval rule must specify a tool_id',
      });
    }
  });

  return issues;
}
