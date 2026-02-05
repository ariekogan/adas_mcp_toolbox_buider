/**
 * Validation Pipeline - main entry point for skill validation
 * @module validators
 */

import { validateSchema } from './schemaValidator.js';
import { resolveReferences, areAllReferencesResolved } from './referenceResolver.js';
import { checkCompleteness, getCompletenessReport } from './completenessChecker.js';
// Identity & Access Control: Security validation
import { validateSecurity, getSecurityReport } from './securityValidator.js';

/**
 * @typedef {import('../types/DraftSkill.js').DraftSkill} DraftSkill
 * @typedef {import('../types/DraftSkill.js').ValidationResult} ValidationResult
 * @typedef {import('../types/DraftSkill.js').ValidationIssue} ValidationIssue
 */

/**
 * Run full validation pipeline on a DraftSkill
 *
 * Pipeline:
 * 1. Schema Validation - type checks, required fields, enum values
 * 2. Reference Resolution - tool_id ok? workflow ok? policy refs?
 * 3. Completeness Check - are all required sections filled?
 * 4. Ready-to-Export Calculation - can we export?
 *
 * @param {DraftSkill} skill
 * @returns {ValidationResult}
 */
export function validateDraftSkill(skill) {
  const errors = [];
  const warnings = [];
  const unresolved = {
    tools: [],
    workflows: [],
    intents: [],
  };

  // 1. Schema validation
  const schemaIssues = validateSchema(skill);
  errors.push(...schemaIssues.filter(i => i.severity === 'error'));
  warnings.push(...schemaIssues.filter(i => i.severity === 'warning'));

  // 2. Reference resolution (mutates skill to update *_resolved flags)
  const refIssues = resolveReferences(skill, unresolved);
  errors.push(...refIssues.filter(i => i.severity === 'error'));
  warnings.push(...refIssues.filter(i => i.severity === 'warning'));

  // 3. Completeness check
  const completeness = checkCompleteness(skill);

  // 4. Security validation (Identity & Access Control)
  const securityIssues = validateSecurity(skill);
  errors.push(...securityIssues.filter(i => i.severity === 'error'));
  warnings.push(...securityIssues.filter(i => i.severity === 'warning'));

  // 5. Ready-to-export calculation
  const ready_to_export = calculateReadiness(errors, unresolved, completeness);

  return {
    valid: errors.length === 0,
    ready_to_export,
    errors,
    warnings,
    unresolved,
    completeness,
  };
}

/**
 * Calculate if skill is ready to export
 * @param {ValidationIssue[]} errors
 * @param {import('../types/DraftSkill.js').ValidationUnresolved} unresolved
 * @param {import('../types/DraftSkill.js').ValidationCompleteness} completeness
 * @returns {boolean}
 */
function calculateReadiness(errors, unresolved, completeness) {
  // Must have no errors
  if (errors.length > 0) return false;

  // Must have all references resolved
  if (unresolved.tools.length > 0) return false;
  if (unresolved.workflows.length > 0) return false;

  // Must meet minimum completeness requirements
  // Note: role and mocks_tested are optional - users can export without them
  const required = ['problem', 'tools'];
  for (const field of required) {
    if (!completeness[field]) return false;
  }

  return true;
}

/**
 * Quick validation - only check for blocking errors
 * Useful for real-time validation during editing
 * @param {DraftSkill} skill
 * @returns {{ valid: boolean, errors: ValidationIssue[] }}
 */
export function quickValidate(skill) {
  const errors = [];

  // Only run schema validation for quick check
  const schemaIssues = validateSchema(skill);
  errors.push(...schemaIssues.filter(i => i.severity === 'error'));

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single section of the skill
 * @param {DraftSkill} skill
 * @param {'problem' | 'scenarios' | 'role' | 'intents' | 'tools' | 'policy' | 'engine'} section
 * @returns {ValidationIssue[]}
 */
export function validateSection(skill, section) {
  const issues = [];

  switch (section) {
    case 'problem':
      // Validate problem
      if (!skill.problem?.statement || skill.problem.statement.length < 10) {
        issues.push({
          code: 'INCOMPLETE_PROBLEM',
          severity: 'warning',
          path: 'problem.statement',
          message: 'Problem statement should be at least 10 characters',
          suggestion: 'Describe the problem you want to solve',
        });
      }
      break;

    case 'scenarios':
      if (!skill.scenarios || skill.scenarios.length < 1) {
        issues.push({
          code: 'NO_SCENARIOS',
          severity: 'warning',
          path: 'scenarios',
          message: 'At least one scenario is recommended',
          suggestion: 'Add a real-world scenario that describes how the skill will be used',
        });
      }
      skill.scenarios?.forEach((s, i) => {
        if (!s.title) {
          issues.push({
            code: 'MISSING_SCENARIO_TITLE',
            severity: 'warning',
            path: `scenarios[${i}].title`,
            message: 'Scenario needs a title',
          });
        }
      });
      break;

    case 'role':
      if (!skill.role?.name) {
        issues.push({
          code: 'MISSING_ROLE_NAME',
          severity: 'warning',
          path: 'role.name',
          message: 'Role name is recommended',
          suggestion: 'Give the agent a role name (e.g., "Customer Service Agent")',
        });
      }
      if (!skill.role?.persona) {
        issues.push({
          code: 'MISSING_PERSONA',
          severity: 'warning',
          path: 'role.persona',
          message: 'Role persona is recommended',
          suggestion: 'Describe how the agent should behave',
        });
      }
      break;

    case 'intents':
      if (!skill.intents?.supported || skill.intents.supported.length < 1) {
        issues.push({
          code: 'NO_INTENTS',
          severity: 'warning',
          path: 'intents.supported',
          message: 'At least one intent is recommended',
          suggestion: 'Define what user requests the agent can handle',
        });
      }
      skill.intents?.supported?.forEach((intent, i) => {
        if (!intent.examples || intent.examples.length < 1) {
          issues.push({
            code: 'NO_INTENT_EXAMPLES',
            severity: 'warning',
            path: `intents.supported[${i}].examples`,
            message: `Intent "${intent.id}" needs examples`,
            suggestion: 'Add example phrases that would trigger this intent',
          });
        }
      });
      break;

    case 'tools':
      if (!skill.tools || skill.tools.length < 1) {
        issues.push({
          code: 'NO_TOOLS',
          severity: 'warning',
          path: 'tools',
          message: 'At least one tool is required',
          suggestion: 'Define tools the agent can use to accomplish tasks',
        });
      }
      skill.tools?.forEach((tool, i) => {
        if (!tool.description) {
          issues.push({
            code: 'MISSING_TOOL_DESCRIPTION',
            severity: 'warning',
            path: `tools[${i}].description`,
            message: `Tool "${tool.name}" needs a description`,
          });
        }
        if (!tool.output?.description) {
          issues.push({
            code: 'MISSING_OUTPUT_DESCRIPTION',
            severity: 'warning',
            path: `tools[${i}].output.description`,
            message: `Tool "${tool.name}" output needs a description`,
          });
        }
      });
      break;

    case 'policy':
      const hasGuardrails =
        (skill.policy?.guardrails?.never?.length > 0) ||
        (skill.policy?.guardrails?.always?.length > 0);
      if (!hasGuardrails) {
        issues.push({
          code: 'NO_GUARDRAILS',
          severity: 'warning',
          path: 'policy.guardrails',
          message: 'At least one guardrail is recommended',
          suggestion: 'Define what the agent should never or always do',
        });
      }
      break;

    case 'engine':
      // Engine has defaults, so usually no issues
      break;

    case 'identity':
      // Check identity configuration
      if (!skill.skill_identity?.display_name) {
        issues.push({
          code: 'MISSING_DISPLAY_NAME',
          severity: 'warning',
          path: 'skill_identity.display_name',
          message: 'Skill display name is required',
          suggestion: 'Add a display name for the skill identity',
        });
      }
      if (!skill.skill_identity?.channel_identities?.email?.from_email) {
        issues.push({
          code: 'MISSING_EMAIL_FROM',
          severity: 'warning',
          path: 'skill_identity.channel_identities.email.from_email',
          message: 'Outbound email address is not configured',
          suggestion: 'Select a connected email address for outbound messages',
        });
      }
      if (!skill.skill_identity?.actor_id) {
        issues.push({
          code: 'IDENTITY_NOT_ACTIVATED',
          severity: 'warning',
          path: 'skill_identity.actor_id',
          message: 'Skill identity is not activated in CORE',
          suggestion: 'Activate the identity to enable sending messages',
        });
      }
      break;
  }

  return issues;
}

/**
 * Get a summary of validation status
 * @param {DraftSkill} skill
 * @returns {Object}
 */
export function getValidationSummary(skill) {
  const result = validateDraftSkill(skill);
  const report = getCompletenessReport(skill);
  // Identity & Access Control: Security coverage report
  const securityReport = getSecurityReport(skill);

  return {
    valid: result.valid,
    ready_to_export: result.ready_to_export,
    error_count: result.errors.length,
    warning_count: result.warnings.length,
    unresolved_refs: {
      tools: result.unresolved.tools.length,
      workflows: result.unresolved.workflows.length,
      intents: result.unresolved.intents.length,
    },
    progress: report.overall_progress,
    sections: {
      problem: { complete: result.completeness.problem, ...report.problem?.details },
      scenarios: { complete: result.completeness.scenarios, ...report.scenarios?.details },
      role: { complete: result.completeness.role, ...report.role?.details },
      intents: { complete: result.completeness.intents, ...report.intents?.details },
      tools: { complete: result.completeness.tools, ...report.tools?.details },
      policy: { complete: result.completeness.policy, ...report.policy?.details },
      mocks: { complete: result.completeness.mocks_tested, ...report.mocks?.details },
      identity: { complete: result.completeness.identity, ...report.identity?.details },
      security: { complete: result.completeness.security, ...securityReport },
    },
  };
}

// Re-export utilities
export { validateSchema } from './schemaValidator.js';
export { resolveReferences, areAllReferencesResolved } from './referenceResolver.js';
export { checkCompleteness, getCompletenessReport, getIncompleteSections } from './completenessChecker.js';
// Identity & Access Control
export { validateSecurity, isSecurityComplete, getSecurityReport } from './securityValidator.js';
