/**
 * Validation Coverage Metadata
 *
 * Centralized coverage data for auto-generating documentation.
 * This file has NO external dependencies so it can be imported by the generator script.
 *
 * Run `npm run generate:coverage` to regenerate docs/VALIDATION_COVERAGE.md
 */

/**
 * Schema validation coverage (from schemaValidator.js)
 */
export const SCHEMA_COVERAGE = [
  // Problem section
  { section: 'problem', field: 'problem', check: 'Section exists', type: 'schema' },
  { section: 'problem', field: 'problem.statement', check: 'Is string', type: 'schema' },
  { section: 'problem', field: 'problem.context', check: 'Is string (optional)', type: 'schema' },
  { section: 'problem', field: 'problem.successCriteria', check: 'Is array of strings (optional)', type: 'schema' },

  // Scenarios section
  { section: 'scenarios', field: 'scenarios', check: 'Section exists', type: 'schema' },
  { section: 'scenarios', field: 'scenarios', check: 'Is array', type: 'schema' },
  { section: 'scenarios', field: 'scenarios[].id', check: 'Has ID', type: 'schema' },
  { section: 'scenarios', field: 'scenarios[].name', check: 'Has name', type: 'schema' },
  { section: 'scenarios', field: 'scenarios[].description', check: 'Has description', type: 'schema' },
  { section: 'scenarios', field: 'scenarios[].steps', check: 'Is array (optional)', type: 'schema' },
  { section: 'scenarios', field: 'scenarios[].expectedOutcome', check: 'Is string (optional)', type: 'schema' },

  // Role section
  { section: 'role', field: 'role', check: 'Section exists', type: 'schema' },
  { section: 'role', field: 'role.persona', check: 'Has persona', type: 'schema' },
  { section: 'role', field: 'role.guidelines', check: 'Is array (optional)', type: 'schema' },
  { section: 'role', field: 'role.boundaries', check: 'Is array (optional)', type: 'schema' },

  // Intents section
  { section: 'intents', field: 'intents', check: 'Section exists', type: 'schema' },
  { section: 'intents', field: 'intents', check: 'Is array', type: 'schema' },
  { section: 'intents', field: 'intents[].id', check: 'Has ID', type: 'schema' },
  { section: 'intents', field: 'intents[].name', check: 'Has name', type: 'schema' },
  { section: 'intents', field: 'intents[].description', check: 'Has description', type: 'schema' },
  { section: 'intents', field: 'intents[].examples', check: 'Is array (optional)', type: 'schema' },

  // Tools section
  { section: 'tools', field: 'tools', check: 'Section exists', type: 'schema' },
  { section: 'tools', field: 'tools', check: 'Is array', type: 'schema' },
  { section: 'tools', field: 'tools[].id', check: 'Has ID', type: 'schema' },
  { section: 'tools', field: 'tools[].name', check: 'Has name', type: 'schema' },
  { section: 'tools', field: 'tools[].description', check: 'Has description', type: 'schema' },
  { section: 'tools', field: 'tools[].parameters', check: 'Is array (optional)', type: 'schema' },
  { section: 'tools', field: 'tools[].parameters[].name', check: 'Has name', type: 'schema' },
  { section: 'tools', field: 'tools[].parameters[].type', check: 'Has type', type: 'schema' },
  { section: 'tools', field: 'tools[].output', check: 'Is string (optional)', type: 'schema' },

  // Policy section
  { section: 'policy', field: 'policy', check: 'Section exists', type: 'schema' },
  { section: 'policy', field: 'policy.guardrails', check: 'Is array (optional)', type: 'schema' },
  { section: 'policy', field: 'policy.guardrails[].id', check: 'Has ID', type: 'schema' },
  { section: 'policy', field: 'policy.guardrails[].rule', check: 'Has rule', type: 'schema' },
  { section: 'policy', field: 'policy.guardrails[].type', check: 'Is valid type', type: 'schema' },
  { section: 'policy', field: 'policy.workflows', check: 'Is array (optional)', type: 'schema' },
  { section: 'policy', field: 'policy.workflows[].id', check: 'Has ID', type: 'schema' },
  { section: 'policy', field: 'policy.workflows[].name', check: 'Has name', type: 'schema' },
  { section: 'policy', field: 'policy.workflows[].steps', check: 'Is array', type: 'schema' },

  // Engine section
  { section: 'engine', field: 'engine', check: 'Section exists (optional)', type: 'schema' },
  { section: 'engine', field: 'engine.provider', check: 'Is string', type: 'schema' },
  { section: 'engine', field: 'engine.model', check: 'Is string', type: 'schema' },
  { section: 'engine', field: 'engine.settings', check: 'Is object (optional)', type: 'schema' },

  // Mocks section
  { section: 'mocks', field: 'mocks', check: 'Section exists (optional)', type: 'schema' },
  { section: 'mocks', field: 'mocks[].toolId', check: 'Has toolId', type: 'schema' },
  { section: 'mocks', field: 'mocks[].responses', check: 'Is array', type: 'schema' },

  // Metadata section
  { section: 'metadata', field: 'metadata', check: 'Section exists (optional)', type: 'schema' },
  { section: 'metadata', field: 'metadata.name', check: 'Is string', type: 'schema' },
  { section: 'metadata', field: 'metadata.version', check: 'Is string', type: 'schema' },
];

/**
 * Reference validation coverage (from referenceResolver.js)
 */
export const REFERENCE_COVERAGE = [
  { section: 'policy', field: 'policy.workflows[].steps', check: 'Steps reference existing tools', type: 'reference' },
  { section: 'tools', field: 'tools[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'intents', field: 'intents[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'scenarios', field: 'scenarios[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'policy', field: 'policy.guardrails[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'policy', field: 'policy.workflows[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'mocks', field: 'mocks[].toolId', check: 'References existing tool', type: 'reference' },
  { section: 'cross-section', field: 'all IDs', check: 'Global ID uniqueness across sections', type: 'reference' },
];

/**
 * Completeness validation coverage (from completenessChecker.js)
 */
export const COMPLETENESS_COVERAGE = [
  { section: 'problem', field: 'problem.statement', check: 'Has statement (≥10 chars)', type: 'completeness' },
  { section: 'scenarios', field: 'scenarios', check: 'At least 1 scenario with name, description', type: 'completeness' },
  { section: 'role', field: 'role.persona', check: 'Has persona (≥10 chars)', type: 'completeness' },
  { section: 'intents', field: 'intents', check: 'At least 1 intent with name, description', type: 'completeness' },
  { section: 'tools', field: 'tools', check: 'At least 1 tool with name, description, output', type: 'completeness' },
  { section: 'policy', field: 'policy', check: 'Has policy section', type: 'completeness' },
  { section: 'engine', field: 'engine', check: 'Has engine with provider and model', type: 'completeness' },
];

/**
 * Consistency validation coverage (from routes/validate.js)
 * These are on-demand checks triggered by user
 */
export const CONSISTENCY_COVERAGE = [
  // Tools consistency (on-demand)
  { section: 'tools', field: 'tools[].name', check: 'Naming convention consistency', type: 'consistency', method: 'deterministic' },
  { section: 'tools', field: 'tools[].name', check: 'Similar/duplicate names', type: 'consistency', method: 'llm' },
  { section: 'tools', field: 'tools[].description', check: 'Ambiguous descriptions', type: 'consistency', method: 'llm' },
  { section: 'tools', field: 'tools', check: 'Overlapping functionality', type: 'consistency', method: 'llm' },

  // Policy consistency (on-demand)
  { section: 'policy', field: 'policy.guardrails', check: 'Conflicting never/always rules', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.guardrails', check: 'Duplicate rules', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.guardrails', check: 'Vague guardrails', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.workflows', check: 'Incomplete workflows', type: 'consistency', method: 'llm' },
  { section: 'policy', field: 'policy.workflows[].steps', check: 'Steps reference non-existent tools', type: 'consistency', method: 'llm' },
];

/**
 * Known gaps - checks that should be implemented
 */
export const COVERAGE_GAPS = [
  { section: 'intents', check: 'Overlapping intent examples', priority: 'high', suggestedMethod: 'llm' },
  { section: 'intents', check: 'Duplicate intent descriptions', priority: 'medium', suggestedMethod: 'llm' },
  { section: 'intents', check: 'Intent naming consistency', priority: 'medium', suggestedMethod: 'deterministic' },
  { section: 'cross-section', check: 'Intent → Tool mapping (can intent be fulfilled?)', priority: 'high', suggestedMethod: 'llm' },
  { section: 'cross-section', check: 'Scenario → Intent coverage', priority: 'medium', suggestedMethod: 'llm' },
  { section: 'cross-section', check: 'Guardrails vs Tool capabilities conflict', priority: 'high', suggestedMethod: 'llm' },
  { section: 'policy', check: 'Workflow circular references', priority: 'medium', suggestedMethod: 'deterministic' },
  { section: 'engine', check: 'Settings compatibility', priority: 'low', suggestedMethod: 'deterministic' },
];

/**
 * All coverage combined
 */
export const ALL_COVERAGE = [
  ...SCHEMA_COVERAGE,
  ...REFERENCE_COVERAGE,
  ...COMPLETENESS_COVERAGE,
  ...CONSISTENCY_COVERAGE,
];
