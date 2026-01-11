import { v4 as uuidv4 } from "uuid";
import { validateDraftDomain } from "../validators/index.js";
import { PHASES } from "../types/DraftDomain.js";

/**
 * @typedef {import('../types/DraftDomain.js').DraftDomain} DraftDomain
 * @typedef {import('../types/DraftDomain.js').Phase} Phase
 */

// ═══════════════════════════════════════════════════════════════
// STATE UPDATE (supports both legacy toolbox and new DraftDomain)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply state updates to toolbox or domain
 * Supports dot notation (e.g., "problem.statement") and array operations
 * @param {Object} state - Either toolbox (legacy) or DraftDomain (new)
 * @param {Object} updates - Updates to apply
 * @returns {Object} Updated state
 */
export function applyStateUpdate(state, updates) {
  const newState = JSON.parse(JSON.stringify(state)); // Deep clone

  for (const [key, value] of Object.entries(updates)) {
    // Handle array push operations
    if (key.endsWith("_push")) {
      const arrayPath = key.slice(0, -5); // Remove "_push"
      const array = getNestedValue(newState, arrayPath);
      if (Array.isArray(array)) {
        // Handle both single item and array of items
        const itemsToAdd = Array.isArray(value) ? value : [value];

        for (const item of itemsToAdd) {
          // Auto-generate ID if not provided
          if (typeof item === "object" && !item.id) {
            item.id = `${arrayPath.slice(0, -1)}_${uuidv4().slice(0, 8)}`;
          }

          // Check for duplicates by name (for tools, scenarios, etc.)
          const existingIndex = array.findIndex(existing =>
            existing.name && item.name && existing.name === item.name
          );

          if (existingIndex >= 0) {
            // Update existing item instead of adding duplicate
            array[existingIndex] = { ...array[existingIndex], ...item };
          } else {
            array.push(item);
          }
        }
      }
      continue;
    }

    // Handle array index notation (e.g., "scenarios[0].title")
    const indexMatch = key.match(/^(.+)\[(\d+)\]\.(.+)$/);
    if (indexMatch) {
      const [, arrayPath, index, prop] = indexMatch;
      const array = getNestedValue(newState, arrayPath);
      if (Array.isArray(array) && array[Number(index)]) {
        setNestedValue(array[Number(index)], prop, value);
      }
      continue;
    }

    // Handle simple dot notation
    setNestedValue(newState, key, value);
  }

  return newState;
}

/**
 * Apply state update with validation (for DraftDomain)
 * @param {DraftDomain} domain
 * @param {Object} updates
 * @returns {DraftDomain}
 */
export function applyStateUpdateWithValidation(domain, updates) {
  // Apply updates
  const updatedDomain = applyStateUpdate(domain, updates);

  // Update timestamp
  updatedDomain.updated_at = new Date().toISOString();

  // Run validation pipeline
  updatedDomain.validation = validateDraftDomain(updatedDomain);

  return updatedDomain;
}

// ═══════════════════════════════════════════════════════════════
// NESTED VALUE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get nested value using dot notation
 * @param {Object} obj
 * @param {string} path
 * @returns {*}
 */
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Set nested value using dot notation
 * @param {Object} obj
 * @param {string} path
 * @param {*} value
 */
function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

// ═══════════════════════════════════════════════════════════════
// PROGRESS CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate toolbox completion percentage (legacy format)
 * @param {Object} toolbox
 * @returns {number}
 */
export function calculateProgress(toolbox) {
  // If it's a DraftDomain, use the new calculation
  if (toolbox.validation?.completeness) {
    return calculateDomainProgress(toolbox);
  }

  // Legacy calculation
  const phases = {
    PROBLEM_DISCOVERY: 10,
    SCENARIO_EXPLORATION: 30,
    TOOLS_PROPOSAL: 45,
    TOOL_DEFINITION: 70,
    MOCK_TESTING: 90,
    READY_TO_EXPORT: 100,
    EXPORTED: 100
  };

  let progress = phases[toolbox.status] || 0;

  // Add granular progress within phases
  if (toolbox.status === "PROBLEM_DISCOVERY") {
    let items = 0;
    if (toolbox.problem?.statement) items++;
    if (toolbox.problem?.target_user) items++;
    if (toolbox.problem?.systems_involved?.length > 0) items++;
    if (toolbox.problem?.confirmed) items++;
    progress = Math.floor(items / 4 * 10);
  }

  if (toolbox.status === "SCENARIO_EXPLORATION") {
    const confirmed = toolbox.scenarios?.filter(s => s.status === "CONFIRMED").length || 0;
    progress = 10 + Math.floor(confirmed / 2 * 20);
  }

  if (toolbox.status === "TOOL_DEFINITION") {
    const total = toolbox.tools?.length || 1;
    const complete = toolbox.tools?.filter(t => t.status === "COMPLETE").length || 0;
    progress = 45 + Math.floor(complete / total * 25);
  }

  return Math.min(progress, 100);
}

/**
 * Calculate progress for DraftDomain based on completeness
 * @param {DraftDomain} domain
 * @returns {number}
 */
export function calculateDomainProgress(domain) {
  const completeness = domain.validation?.completeness;
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

// ═══════════════════════════════════════════════════════════════
// PHASE TRANSITIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate toolbox state for phase transitions (legacy format)
 * @param {Object} toolbox
 * @param {string} targetPhase
 * @returns {boolean}
 */
export function canTransitionTo(toolbox, targetPhase) {
  // If it's a DraftDomain, use the new logic
  if (toolbox.phase !== undefined && toolbox.validation) {
    return canTransitionToPhase(toolbox, targetPhase);
  }

  // Legacy logic
  switch (targetPhase) {
    case "SCENARIO_EXPLORATION":
      return toolbox.problem?.confirmed === true;

    case "TOOLS_PROPOSAL":
      const confirmedScenarios = toolbox.scenarios?.filter(s => s.status === "CONFIRMED").length || 0;
      return confirmedScenarios >= 2;

    case "TOOL_DEFINITION":
      return toolbox.proposed_tools?.some(t => t.accepted);

    case "MOCK_TESTING":
      return toolbox.tools?.every(t => t.status === "COMPLETE");

    case "READY_TO_EXPORT":
      return toolbox.tools?.every(t => t.mock?.tested);

    default:
      return true;
  }
}

/**
 * Check if domain can transition to target phase (new format)
 * @param {DraftDomain} domain
 * @param {Phase} targetPhase
 * @returns {boolean}
 */
export function canTransitionToPhase(domain, targetPhase) {
  const checks = {
    PROBLEM_DISCOVERY: () => true, // Always can go back

    SCENARIO_EXPLORATION: () =>
      domain.problem?.statement?.length >= 10,

    INTENT_DEFINITION: () =>
      domain.scenarios?.length >= 1,

    TOOLS_PROPOSAL: () =>
      domain.intents?.supported?.length >= 1 &&
      domain.intents?.supported?.every(i => i.examples?.length >= 1),

    TOOL_DEFINITION: () =>
      domain.tools?.length >= 1,

    POLICY_DEFINITION: () =>
      domain.tools?.every(t =>
        t.inputs?.length >= 0 && // At least defined (can be empty)
        t.output?.description
      ),

    MOCK_TESTING: () =>
      (domain.policy?.guardrails?.never?.length > 0 ||
       domain.policy?.guardrails?.always?.length > 0),

    READY_TO_EXPORT: () =>
      domain.tools?.every(t => t.mock_status !== 'untested'),

    EXPORTED: () =>
      domain.validation?.ready_to_export === true,
  };

  return checks[targetPhase]?.() ?? true;
}

/**
 * Get blocking issues for phase transition
 * @param {DraftDomain} domain
 * @param {Phase} targetPhase
 * @returns {string[]}
 */
export function getBlockingIssues(domain, targetPhase) {
  const issues = [];

  switch (targetPhase) {
    case 'SCENARIO_EXPLORATION':
      if (!domain.problem?.statement || domain.problem.statement.length < 10) {
        issues.push('Problem statement must be at least 10 characters');
      }
      break;

    case 'INTENT_DEFINITION':
      if (!domain.scenarios || domain.scenarios.length < 1) {
        issues.push('Define at least 1 scenario before proceeding');
      }
      break;

    case 'TOOLS_PROPOSAL':
      if (!domain.intents?.supported || domain.intents.supported.length < 1) {
        issues.push('Define at least 1 intent');
      }
      const missingExamples = domain.intents?.supported?.filter(i => !i.examples || i.examples.length < 1) || [];
      if (missingExamples.length > 0) {
        issues.push(`Add examples to intents: ${missingExamples.map(i => i.id).join(', ')}`);
      }
      break;

    case 'TOOL_DEFINITION':
      if (!domain.tools || domain.tools.length < 1) {
        issues.push('Define at least 1 tool');
      }
      break;

    case 'POLICY_DEFINITION':
      const incompleteTools = domain.tools?.filter(t => !t.output?.description) || [];
      if (incompleteTools.length > 0) {
        issues.push(`Complete output definition for tools: ${incompleteTools.map(t => t.name).join(', ')}`);
      }
      break;

    case 'MOCK_TESTING':
      const hasGuardrails =
        (domain.policy?.guardrails?.never?.length > 0) ||
        (domain.policy?.guardrails?.always?.length > 0);
      if (!hasGuardrails) {
        issues.push('Define at least one guardrail (never or always)');
      }
      break;

    case 'READY_TO_EXPORT':
      const untestedTools = domain.tools?.filter(t => t.mock_status === 'untested') || [];
      if (untestedTools.length > 0) {
        issues.push(`Test or skip mocks for tools: ${untestedTools.map(t => t.name).join(', ')}`);
      }
      break;

    case 'EXPORTED':
      if (!domain.validation?.ready_to_export) {
        issues.push(...(domain.validation?.errors?.map(e => e.message) || []));
        if (domain.validation?.unresolved?.tools?.length > 0) {
          issues.push(`Unresolved tool references: ${domain.validation.unresolved.tools.join(', ')}`);
        }
        if (domain.validation?.unresolved?.workflows?.length > 0) {
          issues.push(`Unresolved workflow references: ${domain.validation.unresolved.workflows.join(', ')}`);
        }
      }
      break;
  }

  return issues;
}

/**
 * Get the next logical phase
 * @param {Phase} currentPhase
 * @returns {Phase|null}
 */
export function getNextPhase(currentPhase) {
  const currentIndex = PHASES.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex >= PHASES.length - 1) {
    return null;
  }
  return PHASES[currentIndex + 1];
}

/**
 * Get the previous phase
 * @param {Phase} currentPhase
 * @returns {Phase|null}
 */
export function getPreviousPhase(currentPhase) {
  const currentIndex = PHASES.indexOf(currentPhase);
  if (currentIndex <= 0) {
    return null;
  }
  return PHASES[currentIndex - 1];
}

/**
 * Check if we should suggest advancing to next phase
 * @param {DraftDomain} domain
 * @returns {{suggest: boolean, nextPhase: Phase|null, reason: string}}
 */
export function shouldSuggestPhaseAdvance(domain) {
  const nextPhase = getNextPhase(domain.phase);
  if (!nextPhase) {
    return { suggest: false, nextPhase: null, reason: 'Already at final phase' };
  }

  if (canTransitionToPhase(domain, nextPhase)) {
    const reasons = {
      'SCENARIO_EXPLORATION': 'Problem statement is defined',
      'INTENT_DEFINITION': 'Scenarios are defined',
      'TOOLS_PROPOSAL': 'Intents with examples are defined',
      'TOOL_DEFINITION': 'Tools are proposed',
      'POLICY_DEFINITION': 'Tools are fully defined',
      'MOCK_TESTING': 'Policies are defined',
      'READY_TO_EXPORT': 'All mocks are tested',
      'EXPORTED': 'Domain is ready to export',
    };
    return {
      suggest: true,
      nextPhase,
      reason: reasons[nextPhase] || 'Ready to proceed'
    };
  }

  return { suggest: false, nextPhase, reason: 'Requirements not yet met' };
}

export default {
  applyStateUpdate,
  applyStateUpdateWithValidation,
  calculateProgress,
  calculateDomainProgress,
  canTransitionTo,
  canTransitionToPhase,
  getBlockingIssues,
  getNextPhase,
  getPreviousPhase,
  shouldSuggestPhaseAdvance
};
