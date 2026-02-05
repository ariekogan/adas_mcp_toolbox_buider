/**
 * Templates Store - loads and manages skill templates
 *
 * Templates are YAML files stored in /docs/templates/
 * They provide pre-configured skill definitions that users can start from.
 *
 * @module store/templates
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';

// Templates directory - relative to project root
const TEMPLATES_PATH = process.env.TEMPLATES_PATH ||
  path.join(process.cwd(), '..', '..', 'docs', 'templates');

/**
 * @typedef {Object} TemplateMetadata
 * @property {string} id - Template identifier (filename without extension)
 * @property {string} name - Display name from template
 * @property {string} description - Template description
 * @property {string} version - Template version
 * @property {number} tools_count - Number of tools defined
 * @property {number} scenarios_count - Number of scenarios defined
 * @property {string[]} categories - Template categories/tags
 */

/**
 * @typedef {Object} Template
 * @property {string} id - Template identifier
 * @property {Object} content - Full template content (parsed YAML)
 */

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract metadata from a template without loading full content
 * @param {string} filePath
 * @param {string} id
 * @returns {Promise<TemplateMetadata|null>}
 */
async function extractMetadata(filePath, id) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const template = yaml.load(content);

    if (!template || typeof template !== 'object') {
      return null;
    }

    // Extract categories from role name, problem goals, etc.
    const categories = [];
    if (template.role?.name) {
      categories.push(template.role.name.toLowerCase());
    }

    return {
      id,
      name: template.name || id,
      description: template.description || template.problem?.statement?.slice(0, 200) || '',
      version: template.version || '1.0.0',
      tools_count: template.tools?.length || 0,
      scenarios_count: template.scenarios?.length || 0,
      intents_count: template.intents?.supported?.length || 0,
      categories,
    };
  } catch (err) {
    console.error(`[Templates] Failed to parse ${filePath}:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * List all available templates
 * @returns {Promise<TemplateMetadata[]>}
 */
async function list() {
  const templates = [];

  // Check if templates directory exists
  if (!await fileExists(TEMPLATES_PATH)) {
    console.log(`[Templates] Templates directory not found: ${TEMPLATES_PATH}`);
    return templates;
  }

  try {
    const files = await fs.readdir(TEMPLATES_PATH);

    for (const file of files) {
      // Only process YAML files
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
        continue;
      }

      const id = file.replace(/\.(yaml|yml)$/, '');
      const filePath = path.join(TEMPLATES_PATH, file);

      const metadata = await extractMetadata(filePath, id);
      if (metadata) {
        templates.push(metadata);
      }
    }
  } catch (err) {
    console.error('[Templates] Failed to list templates:', err.message);
  }

  // Sort by name
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load a template by ID
 * @param {string} id - Template identifier (filename without extension)
 * @returns {Promise<Template>}
 */
async function load(id) {
  // Try both .yaml and .yml extensions
  let filePath = path.join(TEMPLATES_PATH, `${id}.yaml`);
  if (!await fileExists(filePath)) {
    filePath = path.join(TEMPLATES_PATH, `${id}.yml`);
  }

  if (!await fileExists(filePath)) {
    throw new Error(`Template "${id}" not found`);
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const template = yaml.load(content);

  if (!template || typeof template !== 'object') {
    throw new Error(`Template "${id}" is invalid`);
  }

  return {
    id,
    content: template,
  };
}

/**
 * Apply a template to a new skill
 * Merges template content with the empty skill structure
 *
 * @param {Object} emptySkill - Empty skill from createEmptyDraftSkill()
 * @param {Object} templateContent - Loaded template content
 * @returns {Object} - Skill with template applied
 */
function applyTemplate(emptySkill, templateContent) {
  const skill = { ...emptySkill };

  // Fields to copy from template (preserving skill's id, name, timestamps)
  const copyFields = [
    'description',
    'problem',
    'scenarios',
    'role',
    'glossary',
    'intents',
    'tools',
    'meta_tools',
    'policy',
    'engine',
    'channels',
  ];

  for (const field of copyFields) {
    if (templateContent[field] !== undefined) {
      // Deep clone to avoid reference issues
      skill[field] = JSON.parse(JSON.stringify(templateContent[field]));
    }
  }

  // Set phase based on template completeness
  // If template has tools, start at TOOL_DEFINITION
  if (templateContent.tools?.length > 0) {
    skill.phase = 'TOOL_DEFINITION';
  } else if (templateContent.intents?.supported?.length > 0) {
    skill.phase = 'INTENT_DEFINITION';
  } else if (templateContent.scenarios?.length > 0) {
    skill.phase = 'SCENARIO_EXPLORATION';
  }

  // Regenerate IDs for all entities to ensure uniqueness
  regenerateIds(skill);

  return skill;
}

/**
 * Regenerate all IDs in the skill to ensure uniqueness
 * Templates may have static IDs that would conflict with other skills
 */
function regenerateIds(skill) {
  // Import uuidv4 from top-level import

  // Regenerate scenario IDs
  if (skill.scenarios) {
    for (const scenario of skill.scenarios) {
      scenario.id = `scenario_${uuidv4().slice(0, 8)}`;
    }
  }

  // Build tool ID mapping (old -> new) for reference updates
  const toolIdMap = new Map();

  // Regenerate tool IDs
  if (skill.tools) {
    for (const tool of skill.tools) {
      const oldId = tool.id;
      tool.id = `tool_${uuidv4().slice(0, 8)}`;
      tool.id_status = 'temporary'; // Mark as temporary since user hasn't confirmed
      toolIdMap.set(oldId, tool.id);

      // Regenerate mock example IDs
      if (tool.mock?.examples) {
        for (const example of tool.mock.examples) {
          example.id = uuidv4();
        }
      }
    }
  }

  // Build workflow ID mapping (old -> new) for reference updates
  const workflowIdMap = new Map();

  // Regenerate workflow IDs and update tool references
  if (skill.policy?.workflows) {
    for (const workflow of skill.policy.workflows) {
      const oldId = workflow.id;
      workflow.id = `workflow_${uuidv4().slice(0, 8)}`;
      workflowIdMap.set(oldId, workflow.id);

      // Update tool references in steps (if they use IDs)
      // Note: steps typically use tool names, not IDs, so this is a safeguard
      if (workflow.steps) {
        workflow.steps = workflow.steps.map(step => {
          if (toolIdMap.has(step)) {
            return toolIdMap.get(step);
          }
          return step;
        });
      }
    }
  }

  // Regenerate intent IDs and update workflow references
  if (skill.intents?.supported) {
    for (const intent of skill.intents.supported) {
      intent.id = `intent_${uuidv4().slice(0, 8)}`;

      // Update maps_to_workflow reference if it was an old ID
      if (intent.maps_to_workflow && workflowIdMap.has(intent.maps_to_workflow)) {
        intent.maps_to_workflow = workflowIdMap.get(intent.maps_to_workflow);
      }
    }
  }

  // Regenerate approval rule IDs and update tool references
  if (skill.policy?.approvals) {
    for (const approval of skill.policy.approvals) {
      approval.id = `approval_${uuidv4().slice(0, 8)}`;

      // Update tool_id reference if it was an old ID
      if (approval.tool_id && toolIdMap.has(approval.tool_id)) {
        approval.tool_id = toolIdMap.get(approval.tool_id);
      }
    }
  }

  // Regenerate meta_tool IDs
  if (skill.meta_tools) {
    for (const metaTool of skill.meta_tools) {
      metaTool.id = `meta_${uuidv4().slice(0, 8)}`;
      metaTool.created_at = new Date().toISOString();
    }
  }
}

export default {
  list,
  load,
  applyTemplate,
};
