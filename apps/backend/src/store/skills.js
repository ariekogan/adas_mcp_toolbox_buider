/**
 * Skills Store - file-based storage for DraftSkill
 *
 * Storage structure (skills belong to solutions):
 *   /memory/solutions/<solutionId>/skills/<skillId>/skill.json
 *   /memory/solutions/<solutionId>/skills/<skillId>/exports/
 *
 * @module store/skills
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createEmptyDraftSkill } from '../utils/defaults.js';
import { validateDraftSkill } from '../validators/index.js';
import { migrateToV2 } from '../services/migrate.js';
import templatesStore from './templates.js';

import { getMemoryRoot } from '../utils/tenantContext.js';

// ═══════════════════════════════════════════════════════════════
// PATH HELPERS (solution-scoped)
// ═══════════════════════════════════════════════════════════════

function getSolutionsDir() {
  return path.join(getMemoryRoot(), 'solutions');
}

function getSkillsDir(solutionId) {
  return path.join(getSolutionsDir(), solutionId, 'skills');
}

function getSkillDir(solutionId, skillId) {
  return path.join(getSkillsDir(solutionId), skillId);
}

/**
 * @typedef {import('../types/DraftSkill.js').DraftSkill} DraftSkill
 */

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize skill data - fix missing IDs, invalid types, etc.
 * Called on load to ensure data consistency.
 */
function normalizeSkill(skill) {
  let modified = false;

  // Fix missing intent IDs
  if (skill.intents?.supported) {
    for (const intent of skill.intents.supported) {
      if (!intent.id) {
        intent.id = `intent_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated intent ID: ${intent.id}`);
      }
    }
  }

  // Fix missing tool IDs, normalize policy values, and remove duplicates
  if (skill.tools) {
    const seenNames = new Map(); // name -> index
    const toRemove = [];

    for (let i = 0; i < skill.tools.length; i++) {
      const tool = skill.tools[i];

      if (!tool.id) {
        tool.id = `tool_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated tool ID: ${tool.id}`);
      }

      // Normalize invalid policy.allowed values
      if (tool.policy?.allowed === 'requires_approval') {
        tool.policy.allowed = 'conditional';
        tool.policy.requires_approval = 'always';
        modified = true;
        console.log(`[Store] Normalized policy for tool ${tool.name}: requires_approval -> conditional`);
      }

      // Check for duplicates by name (case-insensitive, ignore spaces/underscores)
      const normalizedName = (tool.name || '').toLowerCase().replace(/[\s_-]/g, '');
      if (seenNames.has(normalizedName)) {
        // Mark for removal (keep the first one)
        toRemove.push(i);
        console.log(`[Store] Marking duplicate tool for removal: ${tool.name}`);
      } else {
        seenNames.set(normalizedName, i);
      }
    }

    // Remove duplicates (in reverse order to preserve indices)
    if (toRemove.length > 0) {
      for (let i = toRemove.length - 1; i >= 0; i--) {
        skill.tools.splice(toRemove[i], 1);
      }
      modified = true;
      console.log(`[Store] Removed ${toRemove.length} duplicate tool(s)`);
    }
  }

  // Fix missing scenario IDs
  if (skill.scenarios) {
    for (const scenario of skill.scenarios) {
      if (!scenario.id) {
        scenario.id = `scenario_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated scenario ID: ${scenario.id}`);
      }
    }
  }

  // Fix missing workflow IDs
  if (skill.policy?.workflows) {
    for (const workflow of skill.policy.workflows) {
      if (!workflow.id) {
        // Generate ID from name if available, otherwise random
        const base = workflow.name
          ? workflow.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
          : 'workflow';
        workflow.id = `${base}_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated workflow ID: ${workflow.id}`);
      }
    }
  }

  // Ensure conversation array exists (skills created by import may lack it)
  if (!Array.isArray(skill.conversation)) {
    skill.conversation = [];
    modified = true;
    console.log(`[Store] Initialized missing conversation array for skill ${skill.id || '?'}`);
  }

  // Fix missing meta_tool IDs
  if (skill.meta_tools) {
    for (const metaTool of skill.meta_tools) {
      if (!metaTool.id) {
        const base = metaTool.name
          ? metaTool.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
          : 'meta_tool';
        metaTool.id = `${base}_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated meta_tool ID: ${metaTool.id}`);
      }
    }
  }

  return modified;
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize storage for a solution's skills
 * @param {string} solutionId
 */
async function init(solutionId) {
  await ensureDir(getSkillsDir(solutionId));
}

/**
 * List all skills for a solution
 * @param {string} solutionId
 * @returns {Promise<Array>}
 */
async function list(solutionId) {
  await init(solutionId);

  const skills = [];
  const skillsDir = getSkillsDir(solutionId);

  try {
    const skillIds = await fs.readdir(skillsDir);

    for (const skillId of skillIds) {
      try {
        const skillDir = path.join(skillsDir, skillId);
        const stat = await fs.stat(skillDir);
        if (!stat.isDirectory()) continue;

        const skillPath = path.join(skillDir, 'skill.json');
        if (await fileExists(skillPath)) {
          const skill = await readJson(skillPath);
          skills.push({
            id: skillId,
            solution_id: solutionId,
            name: skill.name,
            phase: skill.phase,
            created_at: skill.created_at,
            updated_at: skill.updated_at,
            tools_count: skill.tools?.length || 0,
            connectors: skill.connectors || [],
            progress: skill.validation?.completeness
              ? calculateOverallProgress(skill.validation.completeness)
              : 0,
            format: 'v2',
          });
        }
      } catch (err) {
        // Skip invalid entries
      }
    }
  } catch (err) {
    // No skills directory yet for this solution
  }

  return skills.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/**
 * Create a new skill within a solution
 * @param {string} solutionId
 * @param {string} name
 * @param {Object} [settings]
 * @param {Object} [template] - Optional template to apply ({ id, content })
 * @returns {Promise<DraftSkill>}
 */
async function create(solutionId, name, settings = {}, template = null) {
  await init(solutionId);

  const skillId = `skill_${uuidv4().slice(0, 8)}`;
  const skillDir = getSkillDir(solutionId, skillId);

  await ensureDir(skillDir);
  await ensureDir(path.join(skillDir, 'exports'));

  // Create base skill
  let skill = createEmptyDraftSkill(skillId, name);
  skill.solution_id = solutionId;

  // Apply template if provided
  if (template && template.content) {
    skill = templatesStore.applyTemplate(skill, template.content);
    skill.solution_id = solutionId; // Preserve after template apply
    console.log(`[Store] Applied template "${template.id}" to new skill "${name}"`);
  }

  // Store settings
  if (settings.llm_provider || settings.llm_model) {
    skill._settings = {
      llm_provider: settings.llm_provider || process.env.LLM_PROVIDER || 'anthropic',
      llm_model: settings.llm_model || null,
    };
  }

  // Track which template was used (for reference)
  if (template) {
    skill._fromTemplate = template.id;
  }

  // Initial validation
  skill.validation = validateDraftSkill(skill);

  await writeJson(path.join(skillDir, 'skill.json'), skill);

  return skill;
}

/**
 * Load a skill by ID within a solution
 * @param {string} solutionId
 * @param {string} skillId
 * @returns {Promise<DraftSkill>}
 */
async function load(solutionId, skillId) {
  const skillDir = getSkillDir(solutionId, skillId);
  const skillPath = path.join(skillDir, 'skill.json');

  if (!(await fileExists(skillPath))) {
    throw new Error(`Skill ${skillId} not found in solution ${solutionId}`);
  }

  const skill = await readJson(skillPath);

  // Ensure solution_id is set
  skill.solution_id = solutionId;

  // Normalize data (fix missing IDs, etc.)
  const wasModified = normalizeSkill(skill);
  if (wasModified) {
    await writeJson(skillPath, skill);
  }

  // Re-validate on load
  skill.validation = validateDraftSkill(skill);
  return skill;
}

/**
 * Save a skill
 * @param {DraftSkill} skill - Must have solution_id and id
 * @returns {Promise<void>}
 */
async function save(skill) {
  if (!skill.solution_id) {
    throw new Error('Skill must have solution_id to save');
  }

  const skillDir = getSkillDir(skill.solution_id, skill.id);
  await ensureDir(skillDir);
  await ensureDir(path.join(skillDir, 'exports'));

  // Update timestamp
  skill.updated_at = new Date().toISOString();

  await writeJson(path.join(skillDir, 'skill.json'), skill);
}

/**
 * Append a message to the skill conversation
 * @param {string} solutionId
 * @param {string} skillId
 * @param {Object} message
 * @returns {Promise<DraftSkill>}
 */
async function appendMessage(solutionId, skillId, message) {
  const skill = await load(solutionId, skillId);

  const newMessage = {
    ...message,
    id: `msg_${uuidv4().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };

  skill.conversation.push(newMessage);
  await save(skill);

  return skill;
}

/**
 * Update skill with state changes and re-validate
 * @param {string} solutionId
 * @param {string} skillId
 * @param {Object} updates - State updates to apply
 * @returns {Promise<DraftSkill>}
 */
async function updateState(solutionId, skillId, updates) {
  const skill = await load(solutionId, skillId);

  // Apply updates
  applyUpdates(skill, updates);

  // Re-validate
  skill.validation = validateDraftSkill(skill);

  await save(skill);
  return skill;
}

// Protected array fields - these can ONLY be modified via _push/_delete/_update operations
// Direct replacement is blocked to prevent accidental data loss
const PROTECTED_ARRAYS = ['tools', 'meta_tools', 'intents.supported', 'policy.guardrails.always', 'policy.guardrails.never'];

/**
 * Apply state updates to skill (supports dot notation)
 *
 * Supported operations for protected arrays:
 * - tools_push: { name: "X", ... }           - Add new or update existing by name
 * - tools_delete: "X" or ["X", "Y"]          - Delete by name
 * - tools_update: { name: "X", ... }         - Update existing (must exist)
 *
 * @param {DraftSkill} skill
 * @param {Object} updates
 */
function applyUpdates(skill, updates) {
  for (const [key, value] of Object.entries(updates)) {

    // Handle array DELETE: "tools_delete" -> remove items by name
    if (key.endsWith('_delete')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(skill, arrayKey);
      if (Array.isArray(arr)) {
        const namesToDelete = Array.isArray(value) ? value : [value];
        for (const name of namesToDelete) {
          const idx = arr.findIndex(item => item.name === name || item.description === name || item === name);
          if (idx !== -1) {
            arr.splice(idx, 1);
            console.log(`[Store] Deleted "${name}" from ${arrayKey}`);
          } else {
            console.log(`[Store] Delete: "${name}" not found in ${arrayKey}`);
          }
        }
      }
      continue;
    }

    // Handle array UPDATE: "tools_update" -> update existing items only (won't add new)
    if (key.endsWith('_update')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(skill, arrayKey);
      if (Array.isArray(arr)) {
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) {
          if (item.name) {
            const idx = arr.findIndex(existing => existing.name === item.name);
            if (idx !== -1) {
              arr[idx] = { ...arr[idx], ...item };
              console.log(`[Store] Updated "${item.name}" in ${arrayKey}`);
            } else {
              console.log(`[Store] Update: "${item.name}" not found in ${arrayKey}, skipping`);
            }
          }
        }
      }
      continue;
    }

    // Handle array RENAME: "tools_rename" -> rename item { from: "old", to: "new" }
    if (key.endsWith('_rename')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(skill, arrayKey);
      if (Array.isArray(arr) && value.from && value.to) {
        const idx = arr.findIndex(item => item.name === value.from);
        if (idx !== -1) {
          arr[idx].name = value.to;
          console.log(`[Store] Renamed "${value.from}" to "${value.to}" in ${arrayKey}`);
        } else {
          console.log(`[Store] Rename: "${value.from}" not found in ${arrayKey}`);
        }
      }
      continue;
    }

    // Handle array PUSH: "tools_push" -> add new or update existing by name
    if (key.endsWith('_push')) {
      const arrayKey = key.slice(0, -5);
      let arr = getNestedValue(skill, arrayKey);
      // Initialize array if it doesn't exist (for meta_tools, etc.)
      if (!Array.isArray(arr)) {
        setNestedValue(skill, arrayKey, []);
        arr = getNestedValue(skill, arrayKey);
        console.log(`[Store] Initialized empty array for ${arrayKey}`);
      }
      if (Array.isArray(arr)) {
        // Support pushing multiple items at once
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) {
          if (item.name && arr.some(existing => existing.name === item.name)) {
            // Update existing item by name - MERGE fields, don't replace
            const idx = arr.findIndex(existing => existing.name === item.name);
            arr[idx] = { ...arr[idx], ...item };
            console.log(`[Store] Updated existing "${item.name}" in ${arrayKey}`);
          } else {
            // New item - must have minimum required fields for tools
            if (arrayKey === 'tools' && !item.description) {
              console.log(`[Store] WARNING: Adding tool "${item.name}" without description`);
            }
            arr.push(item);
            console.log(`[Store] Added "${item.name || 'item'}" to ${arrayKey}`);
          }
        }
      }
      continue;
    }

    // Handle array index notation: "tools[0].status"
    const indexMatch = key.match(/^(.+)\[(\d+)\]\.(.+)$/);
    if (indexMatch) {
      const [, arrayPath, index, property] = indexMatch;
      const arr = getNestedValue(skill, arrayPath);
      if (Array.isArray(arr) && arr[parseInt(index)]) {
        setNestedValue(arr[parseInt(index)], property, value);
      }
      continue;
    }

    // PROTECTION: Block direct replacement of protected arrays
    if (PROTECTED_ARRAYS.includes(key)) {
      console.log(`[Store] BLOCKED: Direct replacement of "${key}" array. Use "${key}_push", "${key}_update", or "${key}_delete" instead.`);
      continue;
    }

    // Handle dot notation: "problem.statement"
    setNestedValue(skill, key, value);
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined) {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Update skill settings
 * @param {string} solutionId
 * @param {string} skillId
 * @param {Object} settings
 * @returns {Promise<DraftSkill>}
 */
async function updateSettings(solutionId, skillId, settings) {
  const skill = await load(solutionId, skillId);
  skill._settings = { ...skill._settings, ...settings };
  await save(skill);
  return skill;
}

/**
 * Delete a skill
 * @param {string} solutionId
 * @param {string} skillId
 */
async function remove(solutionId, skillId) {
  const skillDir = getSkillDir(solutionId, skillId);
  await fs.rm(skillDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Save export files
 * @param {string} solutionId
 * @param {string} skillId
 * @param {string} version
 * @param {Array<{name: string, content: string}>} files
 * @returns {Promise<string>} Export directory path
 */
async function saveExport(solutionId, skillId, version, files) {
  const exportDir = path.join(getSkillDir(solutionId, skillId), 'exports', `v${version}`);
  await ensureDir(exportDir);

  for (const file of files) {
    await fs.writeFile(path.join(exportDir, file.name), file.content);
  }

  return exportDir;
}

/**
 * Get export files
 * @param {string} solutionId
 * @param {string} skillId
 * @param {string} version
 * @returns {Promise<Array<{name: string, content: string}>>}
 */
async function getExport(solutionId, skillId, version) {
  const exportDir = path.join(getSkillDir(solutionId, skillId), 'exports', `v${version}`);
  const files = await fs.readdir(exportDir);

  const result = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(exportDir, file), 'utf-8');
    result.push({ name: file, content });
  }

  return result;
}

/**
 * Get the export path for a given version (creates directory if needed)
 * @param {string} solutionId
 * @param {string} skillId
 * @param {string|number} version
 * @returns {Promise<string>} Export directory path
 */
async function getExportPath(solutionId, skillId, version) {
  const exportDir = path.join(getSkillDir(solutionId, skillId), 'exports', `v${version}`);
  await ensureDir(exportDir);
  return exportDir;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function calculateOverallProgress(completeness) {
  const sections = ['problem', 'scenarios', 'role', 'intents', 'tools', 'policy', 'engine', 'mocks_tested'];
  const completed = sections.filter(s => completeness[s]).length;
  return Math.round((completed / sections.length) * 100);
}

function calculateLegacyProgress(toolbox) {
  if (!toolbox) return 0;
  const phaseProgress = {
    PROBLEM_DISCOVERY: 10,
    SCENARIO_EXPLORATION: 25,
    TOOLS_PROPOSAL: 40,
    TOOL_DEFINITION: 60,
    MOCK_TESTING: 80,
    READY_TO_EXPORT: 95,
    EXPORTED: 100,
  };
  return phaseProgress[toolbox.status] || 0;
}

export default {
  init,
  list,
  create,
  load,
  save,
  appendMessage,
  updateState,
  updateSettings,
  remove,
  saveExport,
  getExport,
  getExportPath,
};
