/**
 * Reference Resolver - validates cross-references in DraftDomain
 * @module validators/referenceResolver
 */

/**
 * @typedef {import('../types/DraftDomain.js').ValidationIssue} ValidationIssue
 * @typedef {import('../types/DraftDomain.js').DraftDomain} DraftDomain
 * @typedef {import('../types/DraftDomain.js').ValidationUnresolved} ValidationUnresolved
 */

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
 * Resolve and validate all cross-references in the domain
 * @param {DraftDomain} domain
 * @param {ValidationUnresolved} unresolved - Object to populate with unresolved refs
 * @returns {ValidationIssue[]}
 */
export function resolveReferences(domain, unresolved) {
  const issues = [];

  // Build lookup sets (filter out tools without names)
  const toolIds = new Set(domain.tools.map(t => t.id).filter(Boolean));
  const toolNames = new Set(domain.tools.filter(t => t.name).map(t => t.name.toLowerCase()));
  const workflowIds = new Set(domain.policy.workflows.map(w => w.id));
  const intentIds = new Set(domain.intents.supported.map(i => i.id));

  // Check workflow steps reference valid tools
  domain.policy.workflows.forEach((workflow, wi) => {
    // Initialize steps_resolved array if needed
    if (!workflow.steps_resolved || workflow.steps_resolved.length !== workflow.steps.length) {
      workflow.steps_resolved = workflow.steps.map(() => false);
    }

    workflow.steps.forEach((stepId, si) => {
      // Check if step references a valid tool (by ID or name)
      const resolved = toolIds.has(stepId) || toolNames.has(stepId.toLowerCase());
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
  domain.intents.supported.forEach((intent, ii) => {
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
  domain.policy.approvals.forEach((rule, ri) => {
    const resolved = toolIds.has(rule.tool_id) || toolNames.has(rule.tool_id.toLowerCase());
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
  domain.tools.forEach((tool, ti) => {
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
  domain.tools.forEach((tool, ti) => {
    const lowerName = tool.name.toLowerCase();
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
  domain.policy.workflows.forEach((workflow, wi) => {
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
  domain.intents.supported.forEach((intent, ii) => {
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
  domain.scenarios.forEach((scenario, si) => {
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

  return issues;
}

/**
 * Check if all references in the domain are resolved
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function areAllReferencesResolved(domain) {
  // Check workflow steps
  for (const workflow of domain.policy.workflows) {
    if (workflow.steps_resolved?.some(r => !r)) {
      return false;
    }
  }

  // Check intent workflow mappings
  for (const intent of domain.intents.supported) {
    if (intent.maps_to_workflow && !intent.maps_to_workflow_resolved) {
      return false;
    }
  }

  // Check approval rules
  for (const approval of domain.policy.approvals) {
    if (approval.tool_id && !approval.tool_id_resolved) {
      return false;
    }
  }

  return true;
}

/**
 * Get list of all unresolved tool references
 * @param {DraftDomain} domain
 * @returns {string[]}
 */
export function getUnresolvedToolRefs(domain) {
  const toolIds = new Set(domain.tools.map(t => t.id));
  const toolNames = new Set(domain.tools.map(t => t.name.toLowerCase()));
  const unresolved = new Set();

  // From workflows
  for (const workflow of domain.policy.workflows) {
    for (const stepId of workflow.steps) {
      if (!toolIds.has(stepId) && !toolNames.has(stepId.toLowerCase())) {
        unresolved.add(stepId);
      }
    }
  }

  // From approval rules
  for (const approval of domain.policy.approvals) {
    if (approval.tool_id && !toolIds.has(approval.tool_id) && !toolNames.has(approval.tool_id.toLowerCase())) {
      unresolved.add(approval.tool_id);
    }
  }

  return Array.from(unresolved);
}

/**
 * Get list of all unresolved workflow references
 * @param {DraftDomain} domain
 * @returns {string[]}
 */
export function getUnresolvedWorkflowRefs(domain) {
  const workflowIds = new Set(domain.policy.workflows.map(w => w.id));
  const unresolved = new Set();

  // From intents
  for (const intent of domain.intents.supported) {
    if (intent.maps_to_workflow && !workflowIds.has(intent.maps_to_workflow)) {
      unresolved.add(intent.maps_to_workflow);
    }
  }

  return Array.from(unresolved);
}
