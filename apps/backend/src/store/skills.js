/**
 * Skills Store - file-based storage for DraftSkill
 *
 * Storage structure:
 *   /memory/<slug>/skill.json     - new DAL format
 *   /memory/<slug>/project.json    - legacy format (auto-migrated)
 *   /memory/<slug>/exports/        - exported files
 *
 * @module store/skills
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createEmptyDraftSkill } from '../utils/defaults.js';
import { validateDraftSkill } from '@adas/skill-validator';
import { migrateToV2 } from '../services/migrate.js';
import templatesStore from './templates.js';
import solutionsStore from './solutions.js';

import { getMemoryRoot } from '../utils/tenantContext.js';

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
 * Initialize storage
 */
async function init() {
  await ensureDir(getMemoryRoot());
}

/**
 * List all skills (new format with skill.json)
 * Also shows legacy projects that can be migrated
 */
async function list() {
  await init();

  const skills = [];

  try {
    const slugs = await fs.readdir(getMemoryRoot());

    for (const slug of slugs) {
      try {
        const slugDir = path.join(getMemoryRoot(), slug);
        const stat = await fs.stat(slugDir);
        if (!stat.isDirectory()) continue;

        // Check for new format (skill.json)
        const skillPath = path.join(slugDir, 'skill.json');
        if (await fileExists(skillPath)) {
          const skill = await readJson(skillPath);
          skills.push({
            id: slug,
            name: skill.name,
            phase: skill.phase,
            created_at: skill.created_at,
            updated_at: skill.updated_at,
            tools_count: skill.tools?.length || 0,
            connectors: skill.connectors || [],
            solution_id: skill.solution_id || null,
            progress: skill.validation?.completeness
              ? calculateOverallProgress(skill.validation.completeness)
              : 0,
            format: 'v2',
          });
          continue;
        }

        // Check for legacy format (project.json) - mark for migration
        const projectPath = path.join(slugDir, 'project.json');
        if (await fileExists(projectPath)) {
          const project = await readJson(projectPath);
          let toolbox = null;
          try {
            toolbox = await readJson(path.join(slugDir, 'toolbox.json'));
          } catch {}

          skills.push({
            id: slug,
            name: project.name,
            phase: toolbox?.status || 'PROBLEM_DISCOVERY',
            created_at: project.created_at,
            updated_at: project.updated_at,
            tools_count: toolbox?.tools?.length || 0,
            progress: calculateLegacyProgress(toolbox),
            format: 'legacy',
            needs_migration: true,
          });
        }
      } catch (err) {
        // Skip invalid slugs
      }
    }
  } catch (err) {
    // No memory directory yet
  }

  return skills.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/**
 * Create a new skill within a solution
 * @param {string} solutionId - Solution to create the skill in
 * @param {string} name - Skill name
 * @param {Object} [settings] - LLM settings
 * @param {Object} [template] - Optional template to apply ({ id, content })
 * @returns {Promise<DraftSkill>}
 */
async function create(solutionId, name, settings = {}, template = null) {
  await init();

  // Deterministic slug from skill name — the developer's ID, no prefix
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!base) throw new Error(`Cannot create slug from skill name: "${name}"`);
  let slug = base;
  let suffix = 2;
  while (await fileExists(path.join(getMemoryRoot(), slug, 'skill.json'))) {
    slug = `${base}-${suffix++}`;
  }
  const slugDir = path.join(getMemoryRoot(), slug);

  await ensureDir(slugDir);
  await ensureDir(path.join(slugDir, 'exports'));

  // Create base skill
  let skill = createEmptyDraftSkill(slug, name);

  // Store solution_id on the skill
  skill.solution_id = solutionId;

  // Apply template if provided
  if (template && template.content) {
    skill = templatesStore.applyTemplate(skill, template.content);
    // Preserve solution_id after template application
    skill.solution_id = solutionId;
    console.log(`[Store] Applied template "${template.id}" to new skill "${name}"`);
  }

  // Store settings
  if (settings && (settings.llm_provider || settings.llm_model)) {
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

  await writeJson(path.join(slugDir, 'skill.json'), skill);

  // Add skill to solution's linked_skills array
  try {
    const solution = await solutionsStore.load(solutionId);
    if (solution) {
      solution.linked_skills = solution.linked_skills || [];
      if (!solution.linked_skills.includes(slug)) {
        solution.linked_skills.push(slug);
        await solutionsStore.save(solution);
        console.log(`[Store] Added skill ${slug} to solution ${solutionId} linked_skills`);
      }
    }
  } catch (err) {
    console.log(`[Store] Warning: Could not add skill to solution's linked_skills: ${err.message}`);
  }

  return skill;
}

/**
 * Load a skill by slug (with auto-migration from legacy format)
 * @param {string} solutionId - Solution ID (for verification, optional)
 * @param {string} slug - Skill ID
 * @returns {Promise<DraftSkill>}
 */
async function load(solutionId, slug) {
  // Support both (solutionId, slug) and (slug) for backwards compatibility
  if (!slug) {
    slug = solutionId;
    solutionId = null;
  }
  const slugDir = path.join(getMemoryRoot(), slug);

  // Try new format first (skill.json)
  const skillPath = path.join(slugDir, 'skill.json');
  if (await fileExists(skillPath)) {
    const skill = await readJson(skillPath);
    // Normalize data (fix missing IDs, etc.)
    const wasModified = normalizeSkill(skill);
    if (wasModified) {
      // Save normalized data back
      await writeJson(skillPath, skill);
    }
    // Re-validate on load
    skill.validation = validateDraftSkill(skill);
    // Add solution_id if provided (for API response consistency)
    if (solutionId && !skill.solution_id) {
      skill.solution_id = solutionId;
    }
    return skill;
  }

  // Try legacy format and migrate
  const projectPath = path.join(slugDir, 'project.json');
  if (await fileExists(projectPath)) {
    console.log(`Migrating legacy project ${slug} to skill format...`);

    const project = await readJson(projectPath);
    const toolbox = await readJson(path.join(slugDir, 'toolbox.json')).catch(() => ({
      id: slug,
      status: 'PROBLEM_DISCOVERY',
      version: 1,
      problem: { statement: null, target_user: null, systems_involved: [], confirmed: false },
      scenarios: [],
      proposed_tools: [],
      tools: [],
      workflows: [],
    }));
    const conversation = await readJson(path.join(slugDir, 'conversation.json')).catch(
      () => ({ project_id: slug, messages: [] })
    );

    // Migrate to new format
    const skill = migrateToV2(project, toolbox, conversation);
    skill.id = slug; // Ensure slug is used as ID

    // Preserve settings
    if (project.settings) {
      skill._settings = project.settings;
    }

    // Save in new format (skill.json in same slug dir)
    await save(skill);

    // Archive legacy files
    try {
      const archiveDir = path.join(slugDir, '.migrated');
      await ensureDir(archiveDir);
      await fs.rename(projectPath, path.join(archiveDir, 'project.json'));
      await fs.rename(path.join(slugDir, 'toolbox.json'), path.join(archiveDir, 'toolbox.json')).catch(() => {});
      await fs.rename(path.join(slugDir, 'conversation.json'), path.join(archiveDir, 'conversation.json')).catch(() => {});
    } catch (err) {
      console.log(`Could not archive legacy files for ${slug}:`, err.message);
    }

    return skill;
  }

  throw new Error(`Skill ${slug} not found`);
}

/**
 * Save a skill
 * @param {DraftSkill} skill
 * @returns {Promise<void>}
 */
async function save(skill) {
  const slugDir = path.join(getMemoryRoot(), skill.id);
  await ensureDir(slugDir);
  await ensureDir(path.join(slugDir, 'exports'));

  // Update timestamp
  skill.updated_at = new Date().toISOString();

  await writeJson(path.join(slugDir, 'skill.json'), skill);
}

/**
 * Append a message to the skill conversation
 * @param {string} slug
 * @param {Object} message
 * @returns {Promise<DraftSkill>}
 */
async function appendMessage(slug, message) {
  const skill = await load(slug);

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
 * @param {string} slug
 * @param {Object} updates - State updates to apply
 * @returns {Promise<DraftSkill>}
 */
async function updateState(solutionId, slug, updates) {
  // Support both (solutionId, slug, updates) and (slug, updates) for backwards compatibility
  if (typeof slug === 'object' && !updates) {
    updates = slug;
    slug = solutionId;
    solutionId = null;
  }
  const skill = await load(solutionId, slug);

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
          // Match by name or id to prevent duplicates
          const matchKey = item.name || item.id;
          const existingIdx = matchKey ? arr.findIndex(existing =>
            (item.name && existing.name === item.name) || (item.id && existing.id === item.id)
          ) : -1;
          if (existingIdx !== -1) {
            // Update existing item - MERGE fields, don't replace
            arr[existingIdx] = { ...arr[existingIdx], ...item };
            console.log(`[Store] Updated existing "${matchKey}" in ${arrayKey}`);
          } else {
            // New item - must have minimum required fields for tools
            if (arrayKey === 'tools' && !item.description) {
              console.log(`[Store] WARNING: Adding tool "${item.name}" without description`);
            }
            arr.push(item);
            console.log(`[Store] Added "${matchKey || 'item'}" to ${arrayKey}`);
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
 * @param {string} slug
 * @param {Object} settings
 * @returns {Promise<DraftSkill>}
 */
async function updateSettings(solutionId, slug, settings) {
  // Support both (solutionId, slug, settings) and (slug, settings) for backwards compatibility
  if (typeof slug === 'object' && !settings) {
    settings = slug;
    slug = solutionId;
    solutionId = null;
  }
  const skill = await load(solutionId, slug);
  skill._settings = { ...skill._settings, ...settings };
  await save(skill);
  return skill;
}

/**
 * Delete a skill
 * @param {string} slug
 */
async function remove(solutionId, slug) {
  // Support both (solutionId, slug) and (slug) for backwards compatibility
  if (!slug) {
    slug = solutionId;
    solutionId = null;
  }

  const slugDir = path.join(getMemoryRoot(), slug);
  await fs.rm(slugDir, { recursive: true, force: true }).catch(() => {});

  // Remove from solution's linked_skills if solutionId provided
  if (solutionId) {
    try {
      const solution = await solutionsStore.load(solutionId);
      if (solution && solution.linked_skills) {
        const idx = solution.linked_skills.indexOf(slug);
        if (idx !== -1) {
          solution.linked_skills.splice(idx, 1);
          await solutionsStore.save(solution);
          console.log(`[Store] Removed skill ${slug} from solution ${solutionId} linked_skills`);
        }
      }
    } catch (err) {
      console.log(`[Store] Warning: Could not remove skill from solution's linked_skills: ${err.message}`);
    }
  }
}

/**
 * Save export files
 * @param {string} solutionId - Solution ID (unused, for API consistency)
 * @param {string} slug - Skill ID
 * @param {string} version
 * @param {Array<{name: string, content: string}>} files
 * @returns {Promise<string>} Export directory path
 */
async function saveExport(solutionId, slug, version, files) {
  // Support both (solutionId, slug, version, files) and (slug, version, files) for backwards compatibility
  if (Array.isArray(version)) {
    files = version;
    version = slug;
    slug = solutionId;
  }
  const exportDir = path.join(getMemoryRoot(), slug, 'exports', `v${version}`);
  await ensureDir(exportDir);

  for (const file of files) {
    const filePath = path.join(exportDir, file.name);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, file.content);
  }

  return exportDir;
}

/**
 * Get export files
 * @param {string} solutionId - Solution ID (unused, for API consistency)
 * @param {string} slug - Skill ID
 * @param {string} version
 * @returns {Promise<Array<{name: string, content: string}>>}
 */
async function getExport(solutionId, slug, version) {
  // Support both (solutionId, slug, version) and (slug, version) for backwards compatibility
  if (version === undefined) {
    version = slug;
    slug = solutionId;
  }
  const exportDir = path.join(getMemoryRoot(), slug, 'exports', `v${version}`);

  // Recursively collect files (supports nested paths like src/store.js)
  async function collectFiles(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push(...await collectFiles(path.join(dir, entry.name), relativeName));
      } else {
        const content = await fs.readFile(path.join(dir, entry.name), 'utf-8');
        result.push({ name: relativeName, content });
      }
    }
    return result;
  }

  return collectFiles(exportDir);
}

/**
 * Get the export path for a given version (creates directory if needed)
 * @param {string} solutionId - Solution ID (unused, for API consistency)
 * @param {string} slug - Skill ID
 * @param {string|number} version
 * @returns {Promise<string>} Export directory path
 */
async function getExportPath(solutionId, slug, version) {
  // Support both (solutionId, slug, version) and (slug, version) for backwards compatibility
  if (version === undefined) {
    version = slug;
    slug = solutionId;
  }
  const exportDir = path.join(getMemoryRoot(), slug, 'exports', `v${version}`);
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
