/**
 * Domains Store - file-based storage for DraftDomain
 *
 * Storage structure:
 *   /memory/<slug>/domain.json     - new DAL format
 *   /memory/<slug>/project.json    - legacy format (auto-migrated)
 *   /memory/<slug>/exports/        - exported files
 *
 * @module store/domains
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createEmptyDraftDomain } from '../utils/defaults.js';
import { validateDraftDomain } from '../validators/index.js';
import { migrateToV2 } from '../services/migrate.js';

// /memory is mounted per-tenant, slugs are direct children
const MEMORY_PATH = process.env.MEMORY_PATH || '/memory';

/**
 * @typedef {import('../types/DraftDomain.js').DraftDomain} DraftDomain
 */

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize domain data - fix missing IDs, invalid types, etc.
 * Called on load to ensure data consistency.
 */
function normalizeDomain(domain) {
  let modified = false;

  // Fix missing intent IDs
  if (domain.intents?.supported) {
    for (const intent of domain.intents.supported) {
      if (!intent.id) {
        intent.id = `intent_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated intent ID: ${intent.id}`);
      }
    }
  }

  // Fix missing tool IDs, normalize policy values, and remove duplicates
  if (domain.tools) {
    const seenNames = new Map(); // name -> index
    const toRemove = [];

    for (let i = 0; i < domain.tools.length; i++) {
      const tool = domain.tools[i];

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
        domain.tools.splice(toRemove[i], 1);
      }
      modified = true;
      console.log(`[Store] Removed ${toRemove.length} duplicate tool(s)`);
    }
  }

  // Fix missing scenario IDs
  if (domain.scenarios) {
    for (const scenario of domain.scenarios) {
      if (!scenario.id) {
        scenario.id = `scenario_${uuidv4().slice(0, 8)}`;
        modified = true;
        console.log(`[Store] Auto-generated scenario ID: ${scenario.id}`);
      }
    }
  }

  // Fix missing workflow IDs
  if (domain.policy?.workflows) {
    for (const workflow of domain.policy.workflows) {
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

  // Fix missing meta_tool IDs
  if (domain.meta_tools) {
    for (const metaTool of domain.meta_tools) {
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
  await ensureDir(MEMORY_PATH);
}

/**
 * List all domains (new format with domain.json)
 * Also shows legacy projects that can be migrated
 */
async function list() {
  await init();

  const domains = [];

  try {
    const slugs = await fs.readdir(MEMORY_PATH);

    for (const slug of slugs) {
      try {
        const slugDir = path.join(MEMORY_PATH, slug);
        const stat = await fs.stat(slugDir);
        if (!stat.isDirectory()) continue;

        // Check for new format (domain.json)
        const domainPath = path.join(slugDir, 'domain.json');
        if (await fileExists(domainPath)) {
          const domain = await readJson(domainPath);
          domains.push({
            id: slug,
            name: domain.name,
            phase: domain.phase,
            created_at: domain.created_at,
            updated_at: domain.updated_at,
            tools_count: domain.tools?.length || 0,
            progress: domain.validation?.completeness
              ? calculateOverallProgress(domain.validation.completeness)
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

          domains.push({
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

  return domains.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/**
 * Create a new domain
 * @param {string} name
 * @param {Object} [settings]
 * @returns {Promise<DraftDomain>}
 */
async function create(name, settings = {}) {
  await init();

  const slug = `dom_${uuidv4().slice(0, 8)}`;
  const slugDir = path.join(MEMORY_PATH, slug);

  await ensureDir(slugDir);
  await ensureDir(path.join(slugDir, 'exports'));

  const domain = createEmptyDraftDomain(slug, name);

  // Store settings
  if (settings.llm_provider || settings.llm_model) {
    domain._settings = {
      llm_provider: settings.llm_provider || process.env.LLM_PROVIDER || 'anthropic',
      llm_model: settings.llm_model || null,
    };
  }

  // Initial validation
  domain.validation = validateDraftDomain(domain);

  await writeJson(path.join(slugDir, 'domain.json'), domain);

  return domain;
}

/**
 * Load a domain by slug (with auto-migration from legacy format)
 * @param {string} slug
 * @returns {Promise<DraftDomain>}
 */
async function load(slug) {
  const slugDir = path.join(MEMORY_PATH, slug);

  // Try new format first (domain.json)
  const domainPath = path.join(slugDir, 'domain.json');
  if (await fileExists(domainPath)) {
    const domain = await readJson(domainPath);
    // Normalize data (fix missing IDs, etc.)
    const wasModified = normalizeDomain(domain);
    if (wasModified) {
      // Save normalized data back
      await writeJson(domainPath, domain);
    }
    // Re-validate on load
    domain.validation = validateDraftDomain(domain);
    return domain;
  }

  // Try legacy format and migrate
  const projectPath = path.join(slugDir, 'project.json');
  if (await fileExists(projectPath)) {
    console.log(`Migrating legacy project ${slug} to domain format...`);

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
    const domain = migrateToV2(project, toolbox, conversation);
    domain.id = slug; // Ensure slug is used as ID

    // Preserve settings
    if (project.settings) {
      domain._settings = project.settings;
    }

    // Save in new format (domain.json in same slug dir)
    await save(domain);

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

    return domain;
  }

  throw new Error(`Domain ${slug} not found`);
}

/**
 * Save a domain
 * @param {DraftDomain} domain
 * @returns {Promise<void>}
 */
async function save(domain) {
  const slugDir = path.join(MEMORY_PATH, domain.id);
  await ensureDir(slugDir);
  await ensureDir(path.join(slugDir, 'exports'));

  // Update timestamp
  domain.updated_at = new Date().toISOString();

  await writeJson(path.join(slugDir, 'domain.json'), domain);
}

/**
 * Append a message to the domain conversation
 * @param {string} slug
 * @param {Object} message
 * @returns {Promise<DraftDomain>}
 */
async function appendMessage(slug, message) {
  const domain = await load(slug);

  const newMessage = {
    ...message,
    id: `msg_${uuidv4().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };

  domain.conversation.push(newMessage);
  await save(domain);

  return domain;
}

/**
 * Update domain with state changes and re-validate
 * @param {string} slug
 * @param {Object} updates - State updates to apply
 * @returns {Promise<DraftDomain>}
 */
async function updateState(slug, updates) {
  const domain = await load(slug);

  // Apply updates
  applyUpdates(domain, updates);

  // Re-validate
  domain.validation = validateDraftDomain(domain);

  await save(domain);
  return domain;
}

// Protected array fields - these can ONLY be modified via _push/_delete/_update operations
// Direct replacement is blocked to prevent accidental data loss
const PROTECTED_ARRAYS = ['tools', 'meta_tools', 'intents.supported', 'policy.guardrails.always', 'policy.guardrails.never'];

/**
 * Apply state updates to domain (supports dot notation)
 *
 * Supported operations for protected arrays:
 * - tools_push: { name: "X", ... }           - Add new or update existing by name
 * - tools_delete: "X" or ["X", "Y"]          - Delete by name
 * - tools_update: { name: "X", ... }         - Update existing (must exist)
 *
 * @param {DraftDomain} domain
 * @param {Object} updates
 */
function applyUpdates(domain, updates) {
  for (const [key, value] of Object.entries(updates)) {

    // Handle array DELETE: "tools_delete" -> remove items by name
    if (key.endsWith('_delete')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(domain, arrayKey);
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
      const arr = getNestedValue(domain, arrayKey);
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
      const arr = getNestedValue(domain, arrayKey);
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
      let arr = getNestedValue(domain, arrayKey);
      // Initialize array if it doesn't exist (for meta_tools, etc.)
      if (!Array.isArray(arr)) {
        setNestedValue(domain, arrayKey, []);
        arr = getNestedValue(domain, arrayKey);
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
      const arr = getNestedValue(domain, arrayPath);
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
    setNestedValue(domain, key, value);
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
 * Update domain settings
 * @param {string} slug
 * @param {Object} settings
 * @returns {Promise<DraftDomain>}
 */
async function updateSettings(slug, settings) {
  const domain = await load(slug);
  domain._settings = { ...domain._settings, ...settings };
  await save(domain);
  return domain;
}

/**
 * Delete a domain
 * @param {string} slug
 */
async function remove(slug) {
  const slugDir = path.join(MEMORY_PATH, slug);
  await fs.rm(slugDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Save export files
 * @param {string} slug
 * @param {string} version
 * @param {Array<{name: string, content: string}>} files
 * @returns {Promise<string>} Export directory path
 */
async function saveExport(slug, version, files) {
  const exportDir = path.join(MEMORY_PATH, slug, 'exports', `v${version}`);
  await ensureDir(exportDir);

  for (const file of files) {
    await fs.writeFile(path.join(exportDir, file.name), file.content);
  }

  return exportDir;
}

/**
 * Get export files
 * @param {string} slug
 * @param {string} version
 * @returns {Promise<Array<{name: string, content: string}>>}
 */
async function getExport(slug, version) {
  const exportDir = path.join(MEMORY_PATH, slug, 'exports', `v${version}`);
  const files = await fs.readdir(exportDir);

  const result = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(exportDir, file), 'utf-8');
    result.push({ name: file, content });
  }

  return result;
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
};
