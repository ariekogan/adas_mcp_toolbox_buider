/**
 * ensureDefaults — Shared default-filling for skills and solutions.
 *
 * SAME CODE used by both:
 *   • Skill Builder (design-time) — on every load from filesystem
 *   • ADAS Core (runtime) — on every load from MongoDB
 *
 * Pure functions, ZERO dependencies.
 * Takes any sparse object → returns a fully-formed object with all defaults filled.
 * Idempotent: running on a complete object changes nothing.
 *
 * @module ensureDefaults
 */

// ═══════════════════════════════════════════════════════════════
// DEEP MERGE UTILITY
// ═══════════════════════════════════════════════════════════════

/**
 * Deep-merge `source` over `defaults`.
 * - Objects: recursively merged (source wins for leaf values)
 * - Arrays: source array wins entirely (no merging array elements)
 * - Primitives: source wins if not undefined/null
 * - undefined/null in source: keeps the default
 *
 * @param {object} defaults - Complete defaults template
 * @param {object} source - Sparse input (user-provided)
 * @returns {object} Merged result
 */
function deepMerge(defaults, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source !== undefined && source !== null ? source : defaults;
  }
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    return source;
  }

  const result = { ...defaults };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const defVal = defaults[key];

    if (srcVal === undefined || srcVal === null) {
      // Keep default
      continue;
    }

    if (Array.isArray(srcVal)) {
      // Arrays: source wins entirely (don't merge array elements)
      result[key] = srcVal;
    } else if (typeof srcVal === 'object' && typeof defVal === 'object' && !Array.isArray(defVal)) {
      // Both are plain objects: recurse
      result[key] = deepMerge(defVal, srcVal);
    } else {
      // Primitive or type mismatch: source wins
      result[key] = srcVal;
    }
  }
  return result;
}


// ═══════════════════════════════════════════════════════════════
// SKILL DEFAULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Complete skill defaults template.
 * Every field a skill can have, with sensible defaults.
 */
const SKILL_DEFAULTS = {
  // id and name have no defaults — must come from input
  description: '',
  version: '0.1.0',
  phase: 'PROBLEM_DISCOVERY',

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
        max_replans: 5,
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
  meta_tools: [],
  triggers: [],
  connectors: [],

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
  conversation: [],
};


// ═══════════════════════════════════════════════════════════════
// SOLUTION DEFAULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Complete solution defaults template.
 * Every field a solution can have, with sensible defaults.
 */
const SOLUTION_DEFAULTS = {
  // id and name have no defaults — must come from input
  version: '1.0.0',
  description: '',
  phase: 'SOLUTION_DISCOVERY',

  identity: {
    actor_types: [],
    admin_roles: [],
    default_actor_type: '',
    default_roles: [],
  },

  skills: [],
  grants: [],
  handoffs: [],
  routing: {},
  platform_connectors: [],
  security_contracts: [],
  linked_skills: [],
  conversation: [],
};


// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Ensure a skill definition has all required fields with sensible defaults.
 *
 * Takes any sparse skill object (even just `{ id, name }`) and returns
 * a fully-formed skill with engine config, policy, intents, role, etc.
 *
 * Idempotent — running on a complete skill changes nothing.
 * Does NOT generate IDs or timestamps — that's the caller's job.
 *
 * @param {object} sparse - Partial skill definition (must have at least `id`)
 * @returns {object} Complete skill with all defaults filled
 */
export function ensureSkillDefaults(sparse) {
  if (!sparse || typeof sparse !== 'object') {
    throw new Error('ensureSkillDefaults: input must be an object');
  }
  if (!sparse.id) {
    throw new Error('ensureSkillDefaults: input must have an id');
  }

  const result = deepMerge(SKILL_DEFAULTS, sparse);

  // Ensure timestamps exist (don't overwrite)
  if (!result.created_at) result.created_at = new Date().toISOString();
  if (!result.updated_at) result.updated_at = new Date().toISOString();

  // Ensure name falls back to id
  if (!result.name) result.name = result.id;

  // Ensure role.name defaults to skill name
  if (!result.role.name && result.name) {
    result.role.name = result.name;
  }

  // Ensure conversation is an array (imported skills may lack it)
  if (!Array.isArray(result.conversation)) {
    result.conversation = [];
  }

  // Ensure tools is always an array
  if (!Array.isArray(result.tools)) result.tools = [];
  if (!Array.isArray(result.scenarios)) result.scenarios = [];
  if (!Array.isArray(result.meta_tools)) result.meta_tools = [];
  if (!Array.isArray(result.triggers)) result.triggers = [];
  if (!Array.isArray(result.channels)) result.channels = [];
  if (!Array.isArray(result.connectors)) result.connectors = [];
  if (!Array.isArray(result.toolbox_imports)) result.toolbox_imports = [];

  return result;
}


/**
 * Ensure a solution definition has all required fields with sensible defaults.
 *
 * Takes any sparse solution object (even just `{ id, name }`) and returns
 * a fully-formed solution with identity, skills topology, grants, etc.
 *
 * Idempotent — running on a complete solution changes nothing.
 *
 * @param {object} sparse - Partial solution definition (must have at least `id`)
 * @returns {object} Complete solution with all defaults filled
 */
export function ensureSolutionDefaults(sparse) {
  if (!sparse || typeof sparse !== 'object') {
    throw new Error('ensureSolutionDefaults: input must be an object');
  }
  if (!sparse.id) {
    throw new Error('ensureSolutionDefaults: input must have an id');
  }

  const result = deepMerge(SOLUTION_DEFAULTS, sparse);

  // Ensure timestamps exist (don't overwrite)
  if (!result.created_at) result.created_at = new Date().toISOString();
  if (!result.updated_at) result.updated_at = new Date().toISOString();

  // Ensure name falls back to id
  if (!result.name) result.name = result.id;

  // Ensure all arrays exist
  if (!Array.isArray(result.skills)) result.skills = [];
  if (!Array.isArray(result.grants)) result.grants = [];
  if (!Array.isArray(result.handoffs)) result.handoffs = [];
  if (!Array.isArray(result.platform_connectors)) result.platform_connectors = [];
  if (!Array.isArray(result.security_contracts)) result.security_contracts = [];
  if (!Array.isArray(result.linked_skills)) result.linked_skills = [];
  if (!Array.isArray(result.conversation)) result.conversation = [];

  return result;
}


/**
 * Utility: get the raw defaults templates (for inspection/testing).
 */
export const DEFAULTS = {
  skill: SKILL_DEFAULTS,
  solution: SOLUTION_DEFAULTS,
};
