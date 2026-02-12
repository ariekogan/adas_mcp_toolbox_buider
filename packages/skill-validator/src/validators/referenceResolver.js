/**
 * Reference Resolver - validates cross-references in DraftSkill
 * @module validators/referenceResolver
 */

/**
 * @typedef {import('../types/DraftSkill.js').ValidationIssue} ValidationIssue
 * @typedef {import('../types/DraftSkill.js').DraftSkill} DraftSkill
 * @typedef {import('../types/DraftSkill.js').ValidationUnresolved} ValidationUnresolved
 */

/**
 * ADAS platform system tool prefixes.
 * Tools with these prefixes are provided by the ADAS runtime and
 * do not need to be defined in the skill's tools array.
 */
export const SYSTEM_TOOL_PREFIXES = ['sys.', 'ui.', 'cp.'];

/**
 * Check if a tool name is a known ADAS system/platform tool.
 * @param {string} name
 * @returns {boolean}
 */
function isSystemTool(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return SYSTEM_TOOL_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Coverage metadata for auto-generating documentation
 * @type {Array<{section: string, field: string, check: string, type: string}>}
 */
export const COVERAGE = [
  // Cross-references
  { section: 'policy', field: 'policy.workflows[].steps', check: 'Steps reference existing tools', type: 'reference' },
  { section: 'intents', field: 'intents.supported[].maps_to_workflow', check: 'Workflow exists', type: 'reference' },
  { section: 'policy', field: 'policy.approvals[].tool_id', check: 'Tool exists', type: 'reference' },

  // Duplicate detection
  { section: 'tools', field: 'tools[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'tools', field: 'tools[].name', check: 'No duplicate names', type: 'reference' },
  { section: 'policy', field: 'policy.workflows[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'intents', field: 'intents.supported[].id', check: 'No duplicate IDs', type: 'reference' },
  { section: 'scenarios', field: 'scenarios[].id', check: 'No duplicate IDs', type: 'reference' },
];

/**
 * Resolve and validate all cross-references in the skill
 * @param {DraftSkill} skill
 * @param {ValidationUnresolved} unresolved - Object to populate with unresolved refs
 * @returns {ValidationIssue[]}
 */
export function resolveReferences(skill, unresolved) {
  const issues = [];

  // Build lookup sets (filter out tools without names)
  // Include both regular tools AND meta_tools in the lookup
  const toolIds = new Set(skill.tools.map(t => t.id).filter(Boolean));
  const toolNames = new Set(skill.tools.filter(t => t.name).map(t => t.name.toLowerCase()));

  // Also include meta_tools in the lookup (they are valid tool references)
  if (Array.isArray(skill.meta_tools)) {
    for (const mt of skill.meta_tools) {
      if (mt.id) toolIds.add(mt.id);
      if (mt.name) toolNames.add(mt.name.toLowerCase());
    }
  }

  const workflows = skill.policy?.workflows || [];
  const approvals = skill.policy?.approvals || [];
  const workflowIds = new Set(workflows.map(w => w.id));
  const intentIds = new Set(skill.intents?.supported?.map(i => i.id) || []);

  // Check workflow steps reference valid tools
  workflows.forEach((workflow, wi) => {
    // Initialize steps_resolved array if needed
    if (!workflow.steps_resolved || workflow.steps_resolved.length !== workflow.steps.length) {
      workflow.steps_resolved = workflow.steps.map(() => false);
    }

    workflow.steps.forEach((stepId, si) => {
      // Check if step references a valid tool (by ID, name, or system tool)
      const resolved = toolIds.has(stepId) || toolNames.has(stepId.toLowerCase()) || isSystemTool(stepId);
      workflow.steps_resolved[si] = resolved;

      if (!resolved) {
        if (!unresolved.tools.includes(stepId)) {
          unresolved.tools.push(stepId);
        }
        issues.push({
          code: 'TOOL_NOT_FOUND',
          severity: 'warning', // Warning until export
          path: `policy.workflows[${wi}].steps[${si}]`,
          message: `Tool "${stepId}" not found`,
          suggestion: `Define tool "${stepId}" or remove from workflow`,
        });
      }
    });
  });

  // Check intent maps_to_workflow references valid workflow
  (skill.intents?.supported || []).forEach((intent, ii) => {
    if (intent.maps_to_workflow) {
      const resolved = workflowIds.has(intent.maps_to_workflow);
      intent.maps_to_workflow_resolved = resolved;

      if (!resolved) {
        if (!unresolved.workflows.includes(intent.maps_to_workflow)) {
          unresolved.workflows.push(intent.maps_to_workflow);
        }
        issues.push({
          code: 'WORKFLOW_NOT_FOUND',
          severity: 'warning',
          path: `intents.supported[${ii}].maps_to_workflow`,
          message: `Workflow "${intent.maps_to_workflow}" not found`,
          suggestion: `Define workflow "${intent.maps_to_workflow}" or remove mapping`,
        });
      }
    } else {
      // No reference = resolved
      intent.maps_to_workflow_resolved = true;
    }
  });

  // Check approval rules reference valid tools
  approvals.forEach((rule, ri) => {
    const resolved = toolIds.has(rule.tool_id) || toolNames.has(rule.tool_id.toLowerCase()) || isSystemTool(rule.tool_id);
    rule.tool_id_resolved = resolved;

    if (!resolved && rule.tool_id) {
      if (!unresolved.tools.includes(rule.tool_id)) {
        unresolved.tools.push(rule.tool_id);
      }
      issues.push({
        code: 'TOOL_NOT_FOUND',
        severity: 'warning',
        path: `policy.approvals[${ri}].tool_id`,
        message: `Tool "${rule.tool_id}" not found for approval rule`,
        suggestion: `Define tool "${rule.tool_id}" or update the approval rule`,
      });
    }
  });

  // Check for duplicate tool IDs
  const seenToolIds = new Set();
  (skill.tools || []).forEach((tool, ti) => {
    if (seenToolIds.has(tool.id)) {
      issues.push({
        code: 'DUPLICATE_TOOL_ID',
        severity: 'error',
        path: `tools[${ti}].id`,
        message: `Duplicate tool ID: "${tool.id}"`,
        suggestion: 'Each tool must have a unique ID',
      });
    }
    seenToolIds.add(tool.id);
  });

  // Check for duplicate tool names
  const seenToolNames = new Set();
  (skill.tools || []).forEach((tool, ti) => {
    const lowerName = (tool.name || '').toLowerCase();
    if (seenToolNames.has(lowerName)) {
      issues.push({
        code: 'DUPLICATE_TOOL_NAME',
        severity: 'warning',
        path: `tools[${ti}].name`,
        message: `Duplicate tool name: "${tool.name}"`,
        suggestion: 'Tool names should be unique for clarity',
      });
    }
    seenToolNames.add(lowerName);
  });

  // Check for duplicate workflow IDs
  const seenWorkflowIds = new Set();
  workflows.forEach((workflow, wi) => {
    if (seenWorkflowIds.has(workflow.id)) {
      issues.push({
        code: 'DUPLICATE_WORKFLOW_ID',
        severity: 'error',
        path: `policy.workflows[${wi}].id`,
        message: `Duplicate workflow ID: "${workflow.id}"`,
        suggestion: 'Each workflow must have a unique ID',
      });
    }
    seenWorkflowIds.add(workflow.id);
  });

  // Check for duplicate intent IDs
  const seenIntentIds = new Set();
  (skill.intents?.supported || []).forEach((intent, ii) => {
    if (seenIntentIds.has(intent.id)) {
      issues.push({
        code: 'DUPLICATE_INTENT_ID',
        severity: 'error',
        path: `intents.supported[${ii}].id`,
        message: `Duplicate intent ID: "${intent.id}"`,
        suggestion: 'Each intent must have a unique ID',
      });
    }
    seenIntentIds.add(intent.id);
  });

  // Check for duplicate scenario IDs
  const seenScenarioIds = new Set();
  (skill.scenarios || []).forEach((scenario, si) => {
    if (seenScenarioIds.has(scenario.id)) {
      issues.push({
        code: 'DUPLICATE_SCENARIO_ID',
        severity: 'error',
        path: `scenarios[${si}].id`,
        message: `Duplicate scenario ID: "${scenario.id}"`,
        suggestion: 'Each scenario must have a unique ID',
      });
    }
    seenScenarioIds.add(scenario.id);
  });

  // Check intent → tool mapping (can each intent be fulfilled?)
  issues.push(...validateIntentToolMapping(skill, toolNames, workflowIds, workflows));

  // Check for workflow circular references
  issues.push(...detectWorkflowCycles(workflows, workflowIds));

  return issues;
}

/**
 * Check if all references in the skill are resolved
 * @param {DraftSkill} skill
 * @returns {boolean}
 */
export function areAllReferencesResolved(skill) {
  // Check workflow steps
  for (const workflow of (skill.policy?.workflows || [])) {
    if (workflow.steps_resolved?.some(r => !r)) {
      return false;
    }
  }

  // Check intent workflow mappings
  for (const intent of (skill.intents?.supported || [])) {
    if (intent.maps_to_workflow && !intent.maps_to_workflow_resolved) {
      return false;
    }
  }

  // Check approval rules
  for (const approval of (skill.policy?.approvals || [])) {
    if (approval.tool_id && !approval.tool_id_resolved) {
      return false;
    }
  }

  return true;
}

/**
 * Get list of all unresolved tool references
 * @param {DraftSkill} skill
 * @returns {string[]}
 */
export function getUnresolvedToolRefs(skill) {
  const toolIds = new Set((skill.tools || []).map(t => t.id));
  const toolNames = new Set((skill.tools || []).map(t => (t.name || '').toLowerCase()));

  // Also include meta_tools in the lookup
  if (Array.isArray(skill.meta_tools)) {
    for (const mt of skill.meta_tools) {
      if (mt.id) toolIds.add(mt.id);
      if (mt.name) toolNames.add(mt.name.toLowerCase());
    }
  }

  const unresolved = new Set();

  // From workflows
  for (const workflow of (skill.policy?.workflows || [])) {
    for (const stepId of (workflow.steps || [])) {
      if (!toolIds.has(stepId) && !toolNames.has(stepId.toLowerCase()) && !isSystemTool(stepId)) {
        unresolved.add(stepId);
      }
    }
  }

  // From approval rules
  for (const approval of (skill.policy?.approvals || [])) {
    if (approval.tool_id && !toolIds.has(approval.tool_id) && !toolNames.has(approval.tool_id.toLowerCase()) && !isSystemTool(approval.tool_id)) {
      unresolved.add(approval.tool_id);
    }
  }

  return Array.from(unresolved);
}

/**
 * Validate that each intent has a structural connection to tools or workflows.
 *
 * An intent is considered "connected" if ANY of these are true:
 *  1. intent.maps_to_workflow references a valid workflow
 *  2. A workflow.trigger matches the intent.id
 *  3. A tool name contains a keyword from the intent.id (underscore-split)
 *
 * Intents with no connection at all get a warning — they exist but nothing fulfills them.
 *
 * @param {DraftSkill} skill
 * @param {Set<string>} toolNames - lowercase tool names
 * @param {Set<string>} workflowIds
 * @param {Array} workflows
 * @returns {ValidationIssue[]}
 */
function validateIntentToolMapping(skill, toolNames, workflowIds, workflows) {
  const issues = [];
  const intents = skill.intents?.supported || [];
  if (intents.length === 0) return issues;

  // Build a set of workflow triggers for reverse-lookup
  const workflowTriggers = new Set();
  for (const wf of workflows) {
    if (wf.trigger) workflowTriggers.add(wf.trigger);
  }

  // Build a flat string of all tool names for keyword matching
  const toolNameString = Array.from(toolNames).join(' ');

  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (!intent.id) continue;

    // 1. Has maps_to_workflow that resolved? Skip — already covered.
    if (intent.maps_to_workflow && workflowIds.has(intent.maps_to_workflow)) {
      continue;
    }

    // 2. A workflow.trigger matches this intent?
    if (workflowTriggers.has(intent.id)) {
      continue;
    }

    // 3. Keyword match: split intent.id by underscores/hyphens, check tool names
    const keywords = intent.id.toLowerCase().split(/[_\-.]/).filter(k => k.length > 2);
    const hasToolMatch = keywords.some(kw => toolNameString.includes(kw));
    if (hasToolMatch) {
      continue;
    }

    // No connection found
    issues.push({
      code: 'INTENT_NO_TOOLS',
      severity: 'warning',
      path: `intents.supported[${i}]`,
      message: `Intent "${intent.id}" has no mapped workflow and no obviously related tools`,
      suggestion: `Add maps_to_workflow, create a workflow with trigger "${intent.id}", or ensure tool names relate to this intent`,
    });
  }

  return issues;
}

/**
 * Detect circular references in workflows.
 *
 * A workflow step can reference another workflow's ID (sub-workflow call).
 * If workflow A → step calls workflow B → step calls workflow A, that's a cycle.
 *
 * Uses DFS with a "currently visiting" set to detect back-edges.
 *
 * @param {Array} workflows
 * @param {Set<string>} workflowIds
 * @returns {ValidationIssue[]}
 */
function detectWorkflowCycles(workflows, workflowIds) {
  const issues = [];
  if (workflows.length === 0) return issues;

  // Build adjacency: workflow.id → set of other workflow IDs it references
  const adj = new Map();
  for (const wf of workflows) {
    const refs = new Set();
    for (const step of wf.steps || []) {
      if (workflowIds.has(step) && step !== wf.id) {
        refs.add(step);
      }
    }
    adj.set(wf.id, refs);
  }

  // DFS cycle detection
  const visited = new Set();    // fully processed
  const visiting = new Set();   // currently in stack

  function dfs(nodeId, path) {
    if (visiting.has(nodeId)) {
      // Found a cycle — report the loop path
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).concat(nodeId);
      issues.push({
        code: 'WORKFLOW_CIRCULAR',
        severity: 'error',
        path: 'policy.workflows',
        message: `Circular workflow reference detected: ${cycle.join(' → ')}`,
        suggestion: 'Remove the circular dependency between workflows',
      });
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    path.push(nodeId);

    for (const neighbor of adj.get(nodeId) || []) {
      dfs(neighbor, path);
    }

    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const wf of workflows) {
    if (!visited.has(wf.id)) {
      dfs(wf.id, []);
    }
  }

  return issues;
}

/**
 * Get list of all unresolved workflow references
 * @param {DraftSkill} skill
 * @returns {string[]}
 */
export function getUnresolvedWorkflowRefs(skill) {
  const workflowIds = new Set((skill.policy?.workflows || []).map(w => w.id));
  const unresolved = new Set();

  // From intents
  for (const intent of (skill.intents?.supported || [])) {
    if (intent.maps_to_workflow && !workflowIds.has(intent.maps_to_workflow)) {
      unresolved.add(intent.maps_to_workflow);
    }
  }

  return Array.from(unresolved);
}
