/**
 * Skill Expander
 *
 * Takes a minimal skill definition (just tools, problem, guardrails)
 * and auto-generates all the boilerplate that the ADAS spec requires:
 *   - intents (from tool names/descriptions)
 *   - workflows (from tool groupings)
 *   - scenarios (from workflows)
 *   - role (from problem + tools + guardrails)
 *   - engine config (defaults)
 *   - entities (from tool inputs)
 *   - access_policy, response_filters, triggers (defaults)
 *
 * Rule: only define what's SMART. If default behavior works, don't force definition.
 */

// ─── Defaults ──────────────────────────────────────────────────────

const DEFAULT_ENGINE = {
  model: 'claude-sonnet-4-20250514',
  temperature: 0.3,
  rv2: {
    max_iterations: 10,
    iteration_timeout_ms: 30000,
    allow_parallel_tools: false,
    on_max_iterations: 'fail',
  },
  hlr: {
    enabled: true,
    critic: { enabled: false, strictness: 'medium' },
    reflection: { enabled: false, depth: 'shallow' },
  },
  autonomy: { level: 'autonomous' },
};

const DEFAULT_THRESHOLDS = { accept: 0.85, clarify: 0.6, reject: 0.4 };

// ─── Helpers ───────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Derive a short action name from a tool name.
 * e.g., "clinic.appointments.create" → "create_appointment"
 *       "clinic.doctors.list" → "list_doctors"
 *       "clinic.doctors.availability" → "check_availability"
 */
function deriveIntentId(toolName) {
  const parts = toolName.split('.');
  // Take last two segments: resource + action
  if (parts.length >= 3) {
    const resource = parts[parts.length - 2]; // e.g., "appointments"
    const action = parts[parts.length - 1];   // e.g., "create"
    // Singularize simple plurals for readability
    const singular = resource.endsWith('s') && !resource.endsWith('ss')
      ? resource.slice(0, -1)
      : resource;

    if (action === 'list') return `list_${resource}`;
    if (action === 'availability') return `check_${singular}_availability`;
    return `${action}_${singular}`;
  }
  // Fallback: last segment
  return parts[parts.length - 1];
}

/**
 * Generate example user phrases from tool description.
 */
function generateExamples(intentId, toolDesc) {
  const id = intentId.replace(/_/g, ' ');
  return [
    `I want to ${id}`,
    `Can you help me ${id}?`,
    `I need to ${id}`,
  ];
}

/**
 * Extract entities from tool inputs (required ones become intent entities).
 */
function extractEntities(inputs) {
  if (!inputs || !inputs.length) return [];
  return inputs
    .filter(inp => inp.required)
    .map(inp => ({
      name: inp.name,
      type: inp.type || 'string',
      required: false, // from message extraction, always optional
      extract_from: 'message',
    }));
}

/**
 * Derive MCP tool name: strip first segment if 3+ segments.
 * e.g., "clinic.doctors.list" → "doctors.list"
 *       "fleet.vehicle.get" → "vehicle.get"
 */
function deriveMcpTool(toolName) {
  const parts = toolName.split('.');
  return parts.length >= 3 ? parts.slice(1).join('.') : toolName;
}

/**
 * Generate a tool ID from tool name.
 * e.g., "clinic.appointments.create" → "tool-appointments-create"
 */
function deriveToolId(toolName) {
  const parts = toolName.split('.');
  const relevant = parts.length >= 3 ? parts.slice(1) : parts;
  return 'tool-' + relevant.join('-');
}

// ─── Main Expander ─────────────────────────────────────────────────

/**
 * Expand a minimal skill definition into a full ADAS-compliant skill.
 *
 * Minimal input requires:
 *   - id, name
 *   - problem (string or object)
 *   - tools[] (with name, description, inputs, output)
 *   - guardrails (optional but recommended)
 *
 * Everything else is auto-generated.
 *
 * @param {object} minimal - The minimal skill definition
 * @returns {{ skill: object, expanded_fields: string[] }} - Full skill + list of what was auto-generated
 */
export function expandSkill(minimal) {
  const expanded = [];

  // ── Copy through fields that are already defined ──
  const skill = {
    id: minimal.id,
    name: minimal.name,
    description: minimal.description || minimal.problem?.statement || minimal.problem || '',
    version: minimal.version || '1.0.0',
    phase: minimal.phase || 'TOOL_DEFINITION',
    ui_capable: minimal.ui_capable || false,
    connectors: minimal.connectors || [],
  };

  // ── Problem ──
  if (typeof minimal.problem === 'string') {
    skill.problem = {
      statement: minimal.problem,
      context: minimal.problem,
      goals: deriveGoals(minimal),
    };
    expanded.push('problem.context', 'problem.goals');
  } else if (minimal.problem) {
    skill.problem = {
      statement: minimal.problem.statement || '',
      context: minimal.problem.context || minimal.problem.statement || '',
      goals: minimal.problem.goals || deriveGoals(minimal),
    };
    if (!minimal.problem.context) expanded.push('problem.context');
    if (!minimal.problem.goals) expanded.push('problem.goals');
  }

  // ── Expand tools to full spec ──
  const connector = minimal.connectors?.[0] || 'default-mcp';
  skill.tools = (minimal.tools || []).map(t => expandTool(t, connector));
  expanded.push('tools[].id', 'tools[].source', 'tools[].policy', 'tools[].mock.id', 'tools[].security');

  // ── Intents (auto-generate if not provided) ──
  if (minimal.intents) {
    skill.intents = minimal.intents;
  } else {
    skill.intents = {
      supported: generateIntents(minimal.tools || [], skill.tools),
      thresholds: DEFAULT_THRESHOLDS,
      out_of_domain: expandOutOfDomain(minimal.out_of_domain),
    };
    expanded.push('intents');
  }

  // ── Workflows (auto-generate if not provided) ──
  if (minimal.policy?.workflows) {
    skill.policy = minimal.policy;
  } else {
    const workflows = generateWorkflows(minimal.tools || [], skill.intents.supported);
    skill.policy = {
      guardrails: expandGuardrails(minimal.guardrails),
      workflows,
      approvals: minimal.policy?.approvals || [],
      escalation: minimal.policy?.escalation || { enabled: false, conditions: [] },
    };
    expanded.push('policy.workflows');
  }

  // ── Scenarios (auto-generate if not provided) ──
  if (minimal.scenarios) {
    skill.scenarios = minimal.scenarios;
  } else {
    skill.scenarios = generateScenarios(skill.intents.supported, skill.policy.workflows, skill.tools);
    expanded.push('scenarios');
  }

  // ── Role (auto-generate if not provided) ──
  if (minimal.role) {
    skill.role = minimal.role;
  } else {
    skill.role = generateRole(skill);
    expanded.push('role');
  }

  // ── Engine (use defaults if not provided) ──
  skill.engine = minimal.engine || DEFAULT_ENGINE;
  if (!minimal.engine) expanded.push('engine');

  // ── Remaining defaults ──
  skill.grant_mappings = minimal.grant_mappings || [];
  skill.access_policy = minimal.access_policy || { rules: [{ tools: ['*'], effect: 'allow' }] };
  skill.response_filters = minimal.response_filters || [];
  skill.triggers = minimal.triggers || [];

  if (!minimal.access_policy) expanded.push('access_policy');

  return { skill, expanded_fields: expanded };
}

// ─── Tool expansion ────────────────────────────────────────────────

function expandTool(t, connector) {
  const full = {
    id: t.id || deriveToolId(t.name),
    id_status: t.id_status || 'permanent',
    name: t.name,
    description: t.description || '',
    inputs: (t.inputs || []).map(inp => ({
      name: inp.name,
      type: inp.type || 'string',
      required: inp.required || false,
      description: inp.description || '',
    })),
    output: typeof t.output === 'string'
      ? { type: 'object', description: t.output }
      : t.output || { type: 'object', description: 'Result' },
    source: t.source || {
      type: 'mcp_bridge',
      connection_id: connector,
      mcp_tool: deriveMcpTool(t.name),
    },
    policy: t.policy || { allowed: 'always' },
    mock: expandMock(t),
    security: expandSecurity(t),
  };
  return full;
}

function expandMock(t) {
  if (t.mock && t.mock.enabled !== undefined) return t.mock; // already full
  // If mock is a raw object (shorthand), wrap it
  if (t.mock && typeof t.mock === 'object') {
    return {
      enabled: true,
      mode: 'examples',
      examples: [{
        id: `${deriveToolId(t.name)}-example`,
        input: deriveExampleInput(t.inputs),
        output: t.mock,
        description: `Example output for ${t.name}`,
      }],
    };
  }
  // No mock provided — auto-generate from tool schema
  return {
    enabled: true,
    mode: 'examples',
    examples: [{
      id: `${deriveToolId(t.name)}-auto`,
      input: deriveExampleInput(t.inputs),
      output: deriveExampleOutput(t),
      description: `Auto-generated example for ${t.name}`,
    }],
  };
}

function deriveExampleOutput(t) {
  const desc = (t.description || '').toLowerCase();
  const name = t.name || '';
  // If output has a description, use it as a hint
  const outDesc = (typeof t.output === 'string' ? t.output : t.output?.description || '').toLowerCase();

  if (outDesc.includes('array') || desc.includes('list') || desc.includes('search')) {
    return { results: [{ id: 1, name: 'Example item' }], total_count: 1 };
  }
  if (desc.includes('cancel') || desc.includes('delete') || desc.includes('remove')) {
    return { success: true, message: 'Operation completed successfully.' };
  }
  if (desc.includes('create') || desc.includes('book') || desc.includes('add')) {
    return { id: 1, status: 'created', message: 'Created successfully.' };
  }
  if (desc.includes('update') || desc.includes('reschedule') || desc.includes('modify')) {
    return { id: 1, status: 'updated', message: 'Updated successfully.' };
  }
  return { success: true, data: {} };
}

/**
 * Generate realistic example input from tool input schemas.
 * Smarter than just "example" — uses field name heuristics.
 */
function deriveExampleInput(inputs) {
  if (!inputs) return {};
  const example = {};
  for (const inp of inputs) {
    if (inp.required) {
      example[inp.name] = generateSampleValue(inp);
    }
  }
  return example;
}

function generateSampleValue(inp) {
  const name = (inp.name || '').toLowerCase();
  const type = (inp.type || 'string').toLowerCase();
  const desc = (inp.description || '').toLowerCase();

  // Number types — use contextual values
  if (type === 'number') {
    if (name.includes('id')) return 1;
    if (name.includes('amount') || name.includes('price')) return 99.99;
    if (name.includes('count') || name.includes('limit') || name.includes('max')) return 10;
    if (name.includes('page')) return 1;
    if (name.includes('year')) return 2026;
    if (name.includes('duration') || name.includes('minutes')) return 30;
    if (name.includes('age')) return 35;
    return 1;
  }

  // Boolean
  if (type === 'boolean') return true;

  // String types — use name/description heuristics
  if (name.includes('date') || desc.includes('yyyy-mm-dd')) return '2026-03-15';
  if (name.includes('time') || desc.includes('hh:mm')) return '09:00';
  if (name.includes('email')) return 'user@example.com';
  if (name.includes('phone')) return '050-1234567';
  if (name.includes('name') && name.includes('patient')) return 'John Smith';
  if (name.includes('name') && name.includes('doctor')) return 'Dr. Sarah Cohen';
  if (name.includes('name')) return 'Example Name';
  if (name.includes('status')) return 'active';
  if (name.includes('type') || name.includes('category')) return 'standard';
  if (name.includes('id') && type === 'string') return 'id-001';
  if (name.includes('description') || name.includes('notes') || name.includes('comment')) return 'Example notes';
  if (name.includes('address')) return '123 Main St';
  if (name.includes('url')) return 'https://example.com';
  if (name.includes('query') || name.includes('search') || name.includes('filter')) return 'search term';

  return 'example';
}

function expandSecurity(t) {
  if (t.security && typeof t.security === 'object') return t.security;
  if (typeof t.security === 'string') return { classification: t.security };
  return { classification: 'public' };
}

// ─── Intent generation ─────────────────────────────────────────────

function generateIntents(minimalTools, fullTools) {
  return minimalTools.map((t, i) => {
    const intentId = deriveIntentId(t.name);
    const entities = extractEntities(t.inputs);

    const intent = {
      id: intentId,
      description: t.description || `Handle ${intentId.replace(/_/g, ' ')} request`,
      examples: generateExamples(intentId, t.description),
      maps_to_workflow: `${intentId}_flow`,
    };
    if (entities.length) intent.entities = entities;
    return intent;
  });
}

// ─── Workflow generation ───────────────────────────────────────────

/**
 * Generate workflows. For single-tool intents, workflow has 1 step.
 * Does NOT try to be smart about multi-tool composition — that's for
 * the user to define explicitly when the default isn't enough.
 */
function generateWorkflows(minimalTools, intents) {
  return intents.map(intent => ({
    id: intent.maps_to_workflow,
    name: intent.description,
    description: `Auto-generated workflow for ${intent.id}`,
    trigger: intent.id,
    steps: [minimalTools.find(t => deriveIntentId(t.name) === intent.id)?.name].filter(Boolean),
    required: false,
    on_deviation: 'warn',
  }));
}

// ─── Scenario generation ───────────────────────────────────────────

function generateScenarios(intents, workflows, tools) {
  return intents.map(intent => {
    const wf = workflows.find(w => w.trigger === intent.id);
    const steps = [];
    if (intent.examples?.[0]) {
      steps.push(`User says: "${intent.examples[0]}"`);
    }
    if (wf?.steps) {
      for (const toolName of wf.steps) {
        const tool = tools.find(t => t.name === toolName);
        steps.push(`Agent calls ${toolName}${tool ? ` — ${tool.description.toLowerCase()}` : ''}`);
      }
    }
    steps.push('Agent presents results to the user');

    return {
      id: intent.id,
      title: intent.description,
      description: `Test scenario for ${intent.id.replace(/_/g, ' ')}`,
      steps,
      expected_outcome: `User request for ${intent.id.replace(/_/g, ' ')} is handled successfully.`,
    };
  });
}

// ─── Role generation ───────────────────────────────────────────────

function generateRole(skill) {
  const problemText = skill.problem?.statement || skill.description || '';
  const toolNames = (skill.tools || []).map(t => t.description).join(', ');
  const neverRules = skill.policy?.guardrails?.never || [];

  return {
    name: skill.name,
    persona: `You are a helpful assistant that ${problemText.toLowerCase().replace(/\.$/, '')}. You have access to tools for: ${toolNames}.`,
    goals: skill.problem?.goals || [`Help users with ${skill.name.toLowerCase()} tasks`],
    limitations: neverRules.length
      ? neverRules.map(r => `Cannot ${r.toLowerCase().replace(/\.$/, '')}`)
      : ['Operates only within defined tool capabilities'],
    communication_style: { tone: 'casual', verbosity: 'concise' },
  };
}

// ─── Guardrails expansion ──────────────────────────────────────────

function expandGuardrails(guardrails) {
  if (!guardrails) return { never: [], always: [] };
  return {
    never: guardrails.never || [],
    always: guardrails.always || [],
  };
}

// ─── Out-of-domain expansion ───────────────────────────────────────

function expandOutOfDomain(ood) {
  if (typeof ood === 'string') {
    return { action: 'redirect', message: ood, suggest_domains: [] };
  }
  if (ood && typeof ood === 'object') return ood;
  return {
    action: 'redirect',
    message: 'This request is outside my capabilities.',
    suggest_domains: [],
  };
}

// ─── Goal derivation ──────────────────────────────────────────────

function deriveGoals(minimal) {
  const tools = minimal.tools || [];
  return tools.slice(0, 4).map(t =>
    `Enable ${t.description?.toLowerCase().replace(/\.$/, '') || t.name}`
  );
}
