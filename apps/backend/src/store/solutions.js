/**
 * Solutions Store - file-based storage for Solution definitions
 *
 * Storage structure:
 *   /memory/<tenant>/solutions/<solutionId>/
 *     solution.json       - Solution definition (parsed from solution.yaml)
 *     conversation.json   - Solution Bot conversation history
 *
 * @module store/solutions
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getMemoryRoot } from '../utils/tenantContext.js';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getSolutionsDir() {
  return path.join(getMemoryRoot(), 'solutions');
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
// EMPTY SOLUTION SKELETON
// ═══════════════════════════════════════════════════════════════

function createEmptySolution(id, name) {
  return {
    id,
    name,
    version: '1.0.0',
    description: '',
    phase: 'SOLUTION_DISCOVERY',
    // Note: skills are stored in /solutions/{id}/skills/ folder, not in this array
    grants: [],
    handoffs: [],
    routing: {},
    platform_connectors: [],
    security_contracts: [],
    conversation: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// CORE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize storage directory
 */
async function init() {
  await ensureDir(getSolutionsDir());
}

/**
 * List all solutions
 * @returns {Promise<Array>}
 */
async function list() {
  await init();

  const solutions = [];

  try {
    const dirs = await fs.readdir(getSolutionsDir());

    for (const dir of dirs) {
      try {
        const solDir = path.join(getSolutionsDir(), dir);
        const stat = await fs.stat(solDir);
        if (!stat.isDirectory()) continue;

        const solutionPath = path.join(solDir, 'solution.json');
        if (await fileExists(solutionPath)) {
          const solution = await readJson(solutionPath);
          solutions.push({
            id: solution.id,
            name: solution.name,
            phase: solution.phase,
            created_at: solution.created_at,
            updated_at: solution.updated_at,
            skills_count: solution.skills?.length || 0,
            grants_count: solution.grants?.length || 0,
            handoffs_count: solution.handoffs?.length || 0,
          });
        }
      } catch (err) {
        // Skip invalid entries
      }
    }
  } catch (err) {
    // No solutions directory yet
  }

  return solutions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/**
 * Create a new solution
 * @param {string} name
 * @returns {Promise<Object>}
 */
async function create(name) {
  await init();

  const id = `sol_${uuidv4().slice(0, 8)}`;
  const solDir = path.join(getSolutionsDir(), id);
  await ensureDir(solDir);

  const solution = createEmptySolution(id, name);
  await writeJson(path.join(solDir, 'solution.json'), solution);

  return solution;
}

/**
 * Load a solution by ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
async function load(id) {
  const solutionPath = path.join(getSolutionsDir(), id, 'solution.json');

  if (!(await fileExists(solutionPath))) {
    throw new Error(`Solution ${id} not found`);
  }

  const solution = await readJson(solutionPath);

  // Ensure conversation array exists
  if (!Array.isArray(solution.conversation)) {
    solution.conversation = [];
  }

  return solution;
}

/**
 * Save a solution
 * @param {Object} solution
 * @returns {Promise<void>}
 */
async function save(solution) {
  const solDir = path.join(getSolutionsDir(), solution.id);
  await ensureDir(solDir);

  solution.updated_at = new Date().toISOString();
  await writeJson(path.join(solDir, 'solution.json'), solution);
}

/**
 * Delete a solution (cascade deletes all skills)
 * @param {string} id
 */
async function remove(id) {
  const solDir = path.join(getSolutionsDir(), id);
  // This deletes the entire solution folder including:
  // - solution.json
  // - skills/ folder with all skills
  await fs.rm(solDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Append a message to the solution conversation
 * @param {string} id
 * @param {Object} message
 * @returns {Promise<Object>}
 */
async function appendMessage(id, message) {
  const solution = await load(id);

  const newMessage = {
    ...message,
    id: `msg_${uuidv4().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };

  solution.conversation.push(newMessage);
  await save(solution);

  return solution;
}

/**
 * Update solution with state changes
 * @param {string} id
 * @param {Object} updates - State updates to apply
 * @returns {Promise<Object>}
 */
async function updateState(id, updates) {
  const solution = await load(id);
  applyUpdates(solution, updates);
  await save(solution);
  return solution;
}

/**
 * Apply state updates to solution
 * Supports the same _push/_delete/_update patterns as skill store
 */
function applyUpdates(solution, updates) {
  for (const [key, value] of Object.entries(updates)) {

    // Handle array DELETE
    if (key.endsWith('_delete')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(solution, arrayKey);
      if (Array.isArray(arr)) {
        const idsToDelete = Array.isArray(value) ? value : [value];
        for (const idOrName of idsToDelete) {
          const idx = arr.findIndex(item =>
            item.id === idOrName || item.key === idOrName || item.name === idOrName
          );
          if (idx !== -1) {
            arr.splice(idx, 1);
            console.log(`[SolutionStore] Deleted "${idOrName}" from ${arrayKey}`);
          }
        }
      }
      continue;
    }

    // Handle array UPDATE
    if (key.endsWith('_update')) {
      const arrayKey = key.slice(0, -7);
      const arr = getNestedValue(solution, arrayKey);
      if (Array.isArray(arr)) {
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) {
          const matchKey = item.id || item.key || item.name;
          if (matchKey) {
            const idx = arr.findIndex(existing =>
              existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
            );
            if (idx !== -1) {
              arr[idx] = { ...arr[idx], ...item };
              console.log(`[SolutionStore] Updated "${matchKey}" in ${arrayKey}`);
            }
          }
        }
      }
      continue;
    }

    // Handle array PUSH
    if (key.endsWith('_push')) {
      const arrayKey = key.slice(0, -5);
      let arr = getNestedValue(solution, arrayKey);
      if (!Array.isArray(arr)) {
        setNestedValue(solution, arrayKey, []);
        arr = getNestedValue(solution, arrayKey);
      }
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        const matchKey = item.id || item.key || item.name;
        if (matchKey && arr.some(existing =>
          existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
        )) {
          // Update existing
          const idx = arr.findIndex(existing =>
            existing.id === matchKey || existing.key === matchKey || existing.name === matchKey
          );
          arr[idx] = { ...arr[idx], ...item };
          console.log(`[SolutionStore] Updated existing "${matchKey}" in ${arrayKey}`);
        } else {
          arr.push(item);
          console.log(`[SolutionStore] Added "${matchKey || 'item'}" to ${arrayKey}`);
        }
      }
      continue;
    }

    // Direct property set (dot notation)
    setNestedValue(solution, key, value);
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
 * Find existing solution by ID or name
 * @param {string} id - Solution ID from yaml
 * @param {string} name - Solution name from yaml
 * @returns {Promise<Object|null>}
 */
async function findExisting(id, name) {
  await init();

  try {
    const allSolutions = await list();

    // 1. Match by exact ID
    if (id) {
      const byId = allSolutions.find(s => s.id === id);
      if (byId) {
        console.log(`[SolutionStore] Found existing solution by ID: ${id}`);
        return await load(byId.id);
      }
    }

    // 2. Match by exact name (normalized comparison)
    if (name) {
      const normalizedName = name.toLowerCase().trim();
      const byName = allSolutions.find(s =>
        s.name?.toLowerCase().trim() === normalizedName
      );
      if (byName) {
        console.log(`[SolutionStore] Found existing solution by name: ${byName.id} (${name})`);
        return await load(byName.id);
      }
    }
  } catch (err) {
    console.log(`[SolutionStore] Error finding existing solution: ${err.message}`);
  }

  return null;
}

/**
 * Import a solution from solution.yaml data
 * Updates existing solution if ID or name matches, otherwise creates new
 * @param {Object} solutionData - Parsed solution.yaml content
 * @param {string[]} [linkedSkillIds] - Skill IDs to link
 * @returns {Promise<Object>}
 */
async function importFromYaml(solutionData, linkedSkillIds = []) {
  await init();

  // Check for existing solution by ID or name
  const existing = await findExisting(solutionData.id, solutionData.name);

  if (existing) {
    // Update existing solution instead of creating duplicate
    console.log(`[SolutionStore] Updating existing solution: ${existing.id}`);

    const updated = {
      ...existing,
      ...solutionData,
      id: existing.id, // Keep original ID
      phase: existing.phase === 'SOLUTION_DISCOVERY' ? 'VALIDATION' : existing.phase,
      conversation: existing.conversation || [], // Preserve conversation history
      linked_skills: [...new Set([...(existing.linked_skills || []), ...linkedSkillIds])],
      updated_at: new Date().toISOString(),
      // Preserve created_at from original
      created_at: existing.created_at,
    };

    await writeJson(path.join(getSolutionsDir(), existing.id, 'solution.json'), updated);
    return updated;
  }

  // Create new solution
  const id = solutionData.id || `sol_${uuidv4().slice(0, 8)}`;
  const solDir = path.join(getSolutionsDir(), id);
  await ensureDir(solDir);

  const solution = {
    ...createEmptySolution(id, solutionData.name || 'Imported Solution'),
    ...solutionData,
    id,
    phase: 'VALIDATION', // imported solutions skip to validation
    conversation: [],
    linked_skills: linkedSkillIds,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await writeJson(path.join(solDir, 'solution.json'), solution);
  console.log(`[SolutionStore] Created new solution: ${id}`);
  return solution;
}

export default {
  init,
  list,
  create,
  load,
  save,
  remove,
  appendMessage,
  updateState,
  findExisting,
  importFromYaml,
};
