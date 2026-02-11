/**
 * @adas/skill-validator
 *
 * Standalone validation library for ADAS skill and solution definitions.
 * Pure functions — no database, no auth, no state.
 *
 * Usage:
 *   import { validateDraftSkill, validateSolution } from '@adas/skill-validator';
 *   const result = validateDraftSkill(skillJson);
 */

// Skill-level validation (5-stage pipeline)
export {
  validateDraftSkill,
  quickValidate,
  validateSection,
  getValidationSummary,
  validateSchema,
  resolveReferences,
  areAllReferencesResolved,
  checkCompleteness,
  getCompletenessReport,
  getIncompleteSections,
  validateSecurity,
  isSecurityComplete,
  getSecurityReport
} from './validators/index.js';

// Solution-level validation (cross-skill contracts)
export { validateSolution } from './validators/solutionValidator.js';

// Solution quality scoring (LLM-based)
export { validateSolutionQuality } from './validators/solutionQualityValidator.js';

// Coverage metadata
export {
  SCHEMA_COVERAGE,
  REFERENCE_COVERAGE,
  COMPLETENESS_COVERAGE,
  CONSISTENCY_COVERAGE,
  COVERAGE_GAPS,
  ALL_COVERAGE
} from './validators/coverage.js';
