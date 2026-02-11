/**
 * Migration Service - migrates legacy projects to DraftSkill format
 * @module services/migrate
 */

import { v4 as uuidv4 } from 'uuid';
import { createEmptyDraftSkill, createEmptyValidation } from '../utils/defaults.js';
import { validateDraftSkill } from '@adas/skill-validator';

/**
 * @typedef {import('../types/DraftSkill.js').DraftSkill} DraftSkill
 * @typedef {import('../types/DraftSkill.js').Phase} Phase
 * @typedef {import('../types/DraftSkill.js').Tool} Tool
 * @typedef {import('../types/DraftSkill.js').Scenario} Scenario
 * @typedef {import('../types/DraftSkill.js').Message} Message
 */

/**
 * Legacy project structure
 * @typedef {Object} LegacyProject
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} created_at
 * @property {string} updated_at
 * @property {Object} [settings]
 */

/**
 * Legacy toolbox structure
 * @typedef {Object} LegacyToolbox
 * @property {string} id
 * @property {string} status - Phase name
 * @property {number} version
 * @property {Object} problem
 * @property {string|null} problem.statement
 * @property {string|null} problem.target_user
 * @property {string[]} problem.systems_involved
 * @property {boolean} problem.confirmed
 * @property {Array} scenarios
 * @property {Array} proposed_tools
 * @property {Array} tools
 * @property {Array} workflows
 */

/**
 * Legacy conversation structure
 * @typedef {Object} LegacyConversation
 * @property {string} project_id
 * @property {Array<{id: string, role: string, content: string, timestamp: string}>} messages
 */

/**
 * Map old phase names to new phase names
 * @type {Record<string, Phase>}
 */
const PHASE_MAP = {
  'PROBLEM_DISCOVERY': 'PROBLEM_DISCOVERY',
  'SCENARIO_EXPLORATION': 'SCENARIO_EXPLORATION',
  'TOOLS_PROPOSAL': 'TOOLS_PROPOSAL',
  'TOOL_DEFINITION': 'TOOL_DEFINITION',
  'MOCK_TESTING': 'MOCK_TESTING',
  'READY_TO_EXPORT': 'READY_TO_EXPORT',
  'EXPORTED': 'EXPORTED',
};

/**
 * Migrate legacy project/toolbox/conversation to DraftSkill format
 * @param {LegacyProject} project
 * @param {LegacyToolbox} toolbox
 * @param {LegacyConversation} conversation
 * @returns {DraftSkill}
 */
export function migrateToV2(project, toolbox, conversation) {
  // Start with empty skill
  const skill = createEmptyDraftSkill(project.id, project.name);

  // ─────────────────────────────────────────────────────────────────
  // MIGRATE METADATA
  // ─────────────────────────────────────────────────────────────────
  skill.description = project.description || '';
  skill.phase = mapPhase(toolbox.status);
  skill.version = `0.${toolbox.version || 1}.0`;
  skill.created_at = project.created_at;
  skill.updated_at = new Date().toISOString();

  // ─────────────────────────────────────────────────────────────────
  // MIGRATE PROBLEM
  // ─────────────────────────────────────────────────────────────────
  if (toolbox.problem) {
    skill.problem.statement = toolbox.problem.statement || '';

    // Build context from target_user and systems_involved
    const contextParts = [];
    if (toolbox.problem.target_user) {
      contextParts.push(`Target user: ${toolbox.problem.target_user}`);
    }
    if (toolbox.problem.systems_involved?.length > 0) {
      contextParts.push(`Systems involved: ${toolbox.problem.systems_involved.join(', ')}`);
    }
    skill.problem.context = contextParts.join('\n');

    // If confirmed, the problem is considered complete
    if (toolbox.problem.confirmed) {
      skill.problem.goals.push('Problem confirmed by user');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // MIGRATE SCENARIOS
  // ─────────────────────────────────────────────────────────────────
  skill.scenarios = (toolbox.scenarios || []).map(migrateScenario);

  // ─────────────────────────────────────────────────────────────────
  // MIGRATE TOOLS
  // ─────────────────────────────────────────────────────────────────
  skill.tools = (toolbox.tools || []).map(migrateTool);

  // Also migrate proposed tools that were accepted
  const proposedTools = (toolbox.proposed_tools || [])
    .filter(pt => pt.accepted)
    .filter(pt => !skill.tools.some(t => t.name === pt.name)); // Avoid duplicates

  for (const proposed of proposedTools) {
    skill.tools.push({
      id: uuidv4(),
      id_status: 'temporary',
      name: proposed.name,
      description: proposed.purpose || '',
      inputs: [],
      output: { type: 'object', description: '' },
      policy: { allowed: 'always', requires_approval: 'never' },
      mock: { enabled: true, mode: 'examples', examples: [] },
      mock_status: 'untested',
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // MIGRATE WORKFLOWS (if any)
  // ─────────────────────────────────────────────────────────────────
  if (toolbox.workflows?.length > 0) {
    skill.policy.workflows = toolbox.workflows.map((wf, i) => ({
      id: wf.id || uuidv4(),
      name: wf.name || `Workflow ${i + 1}`,
      description: '',
      trigger: '',
      steps: wf.steps || [],
      steps_resolved: (wf.steps || []).map(() => false), // Will be resolved by validator
      required: false,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // MIGRATE CONVERSATION
  // ─────────────────────────────────────────────────────────────────
  skill.conversation = (conversation.messages || []).map(migrateMessage);

  // ─────────────────────────────────────────────────────────────────
  // INFER ADDITIONAL FIELDS
  // ─────────────────────────────────────────────────────────────────

  // Infer role from conversation context (simple heuristic)
  if (skill.tools.length > 0) {
    const toolNames = skill.tools.map(t => t.name).join(', ');
    skill.role.persona = `Assistant with access to: ${toolNames}`;
  }

  // Create default intents based on tools
  if (skill.tools.length > 0 && skill.intents.supported.length === 0) {
    // Each tool gets a basic intent
    skill.intents.supported = skill.tools.slice(0, 5).map(tool => ({
      id: `intent_${tool.id}`,
      description: `User wants to ${tool.description || tool.name}`,
      examples: [`I need to ${tool.name}`, `Can you ${tool.name}?`],
      maps_to_workflow: undefined,
      maps_to_workflow_resolved: true,
      entities: [],
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // RUN VALIDATION
  // ─────────────────────────────────────────────────────────────────
  skill.validation = validateDraftSkill(skill);

  return skill;
}

/**
 * Map old phase to new phase
 * @param {string} oldPhase
 * @returns {Phase}
 */
function mapPhase(oldPhase) {
  return PHASE_MAP[oldPhase] || 'PROBLEM_DISCOVERY';
}

/**
 * Migrate a scenario
 * @param {Object} oldScenario
 * @returns {Scenario}
 */
function migrateScenario(oldScenario) {
  return {
    id: oldScenario.id || uuidv4(),
    title: oldScenario.title || '',
    description: oldScenario.description || (oldScenario.pain_points?.join('. ') || ''),
    steps: oldScenario.steps || [],
    expected_outcome: oldScenario.expected_outcome || '',
  };
}

/**
 * Migrate a tool
 * @param {Object} oldTool
 * @returns {Tool}
 */
function migrateTool(oldTool) {
  // Determine mock status from old format
  let mockStatus = 'untested';
  if (oldTool.mock?.tested) {
    mockStatus = 'tested';
  }

  // Determine tool status (id_status)
  const idStatus = oldTool.status === 'COMPLETE' ? 'permanent' : 'temporary';

  return {
    id: oldTool.id || uuidv4(),
    id_status: idStatus,
    name: oldTool.name || '',
    description: oldTool.description || oldTool.purpose || '',
    inputs: (oldTool.inputs || []).map(input => ({
      name: input.name || '',
      type: input.type || 'string',
      required: input.required ?? true,
      description: input.description || '',
      default: input.default,
      enum: input.enum,
    })),
    output: {
      type: oldTool.output?.type || 'object',
      description: oldTool.output?.description || '',
      schema: oldTool.output?.schema,
    },
    policy: {
      allowed: 'always',
      requires_approval: 'never',
    },
    mock: {
      enabled: oldTool.mock?.enabled ?? true,
      mode: 'examples',
      examples: (oldTool.mock?.examples || []).map((ex, i) => ({
        id: uuidv4(),
        input: ex.input || {},
        output: ex.output,
        description: '',
      })),
    },
    mock_status: mockStatus,
  };
}

/**
 * Migrate a message
 * @param {Object} oldMessage
 * @returns {Message}
 */
function migrateMessage(oldMessage) {
  return {
    id: oldMessage.id || uuidv4(),
    role: oldMessage.role || 'user',
    content: oldMessage.content || '',
    timestamp: oldMessage.timestamp || new Date().toISOString(),
    state_update: oldMessage.state_update,
    suggested_focus: oldMessage.suggested_focus,
  };
}

/**
 * Check if data is in legacy format
 * @param {Object} data - Either a skill or project/toolbox combo
 * @returns {boolean}
 */
export function isLegacyFormat(data) {
  // Legacy format has separate project/toolbox structure
  // or toolbox has 'status' instead of 'phase'
  if (data.toolbox && data.project) {
    return true;
  }
  // New format has 'phase', legacy has 'status'
  if (data.status && !data.phase) {
    return true;
  }
  // New format has 'validation' object
  if (!data.validation) {
    return true;
  }
  return false;
}

/**
 * Get migration info for a legacy project
 * @param {LegacyProject} project
 * @param {LegacyToolbox} toolbox
 * @returns {Object}
 */
export function getMigrationInfo(project, toolbox) {
  return {
    id: project.id,
    name: project.name,
    legacy_phase: toolbox.status,
    new_phase: mapPhase(toolbox.status),
    tools_count: toolbox.tools?.length || 0,
    scenarios_count: toolbox.scenarios?.length || 0,
    has_workflows: (toolbox.workflows?.length || 0) > 0,
    changes: [
      'Problem structure updated (target_user → context)',
      'Tools enhanced with policy and mock_status',
      'Added intents, role, engine sections',
      'Added continuous validation',
      'Conversation merged into single skill.json',
    ],
  };
}

export default {
  migrateToV2,
  isLegacyFormat,
  getMigrationInfo,
};
