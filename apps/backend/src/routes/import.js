/**
 * Import Routes
 *
 * Skill Builder is the APPLICATION BUILDER (design time).
 * ADAS Core is the RUNTIME.
 *
 * Import creates artifacts in Skill Builder:
 * - Adds connectors to the prebuilt catalog (same as other connectors)
 * - User can then use existing Skill Builder UI to review, adjust, and deploy
 *
 * The existing deploy mechanism in export.js handles deployment to ADAS Core.
 *
 * Workflow:
 *   1. Develop MCPs in external project (e.g., PB)
 *   2. Package with scripts/package.sh → manifest.json
 *   3. POST /api/import → Adds connectors to Skill Builder catalog
 *   4. User reviews/adjusts in Skill Builder UI
 *   5. User deploys via existing Skill Builder deploy (export.js)
 */

import { Router } from 'express';
import multer from 'multer';
import { registerImportedConnector, unregisterImportedConnector, getAllPrebuiltConnectors } from './connectors.js';
import skillsStore from '../store/skills.js';
import solutionsStore from '../store/solutions.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { execSync } from 'child_process';
import {
  syncConnectorToADAS,
  startConnectorInADAS,
  uploadMcpCodeToADAS
} from '../services/adasConnectorSync.js';
import { deploySkillToADAS, deployIdentityToADAS } from '../services/exportDeploy.js';
import { deriveEndpoint, buildConnectorPayload, buildCatalogEntry } from '../utils/connectorPayload.js';

// Multer config: store uploaded files in /tmp, accept .tar.gz up to 50MB
const upload = multer({ dest: '/tmp/solution-pack-uploads', limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

import { getMemoryRoot, getCurrentTenant, VALID_TENANTS } from '../utils/tenantContext.js';
// Persistence: resolved per-tenant
function getPersistenceDir(tenant) { return getMemoryRoot(tenant); }
function getPersistenceFile(tenant) { return path.join(getMemoryRoot(tenant), 'imported-packages.json'); }

// Per-tenant package maps: tenant -> Map(packageName -> packageInfo)
const tenantPackages = new Map();

/** Get the importedPackages Map for the current tenant (from ALS context) */
function getImportedPackages() {
  const tenant = getCurrentTenant();
  if (!tenantPackages.has(tenant)) {
    tenantPackages.set(tenant, new Map());
  }
  return tenantPackages.get(tenant);
}

/**
 * Load persisted packages for a specific tenant
 */
function loadPersistedPackagesForTenant(tenant) {
  try {
    const file = getPersistenceFile(tenant);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      console.log(`[Import] Loading ${data.length} persisted packages for tenant "${tenant}"...`);

      const pkgMap = new Map();
      for (const pkg of data) {
        pkgMap.set(pkg.name, pkg);

        // Re-register connectors in catalog
        for (const mcp of (pkg.mcps || [])) {
          registerImportedConnector(mcp.id, {
            name: mcp.name,
            description: mcp.description,
            transport: mcp.transport,
            command: mcp.command,
            args: mcp.args,
            env: mcp.env,
            endpoint: mcp.endpoint,
            port: mcp.port,
            requiresAuth: mcp.requiresAuth,
            category: mcp.category,
            layer: mcp.layer,
            ui_capable: mcp.ui_capable || false,
            mcp_store_included: !!pkg.mcp_store_included,
            importedFrom: pkg.name
          });
          console.log(`[Import] Restored connector: ${mcp.id} (tenant: ${tenant})`);
        }
      }
      tenantPackages.set(tenant, pkgMap);
      console.log(`[Import] Loaded ${pkgMap.size} packages for tenant "${tenant}"`);
    }
  } catch (err) {
    console.error(`[Import] Failed to load persisted packages for tenant "${tenant}":`, err.message);
  }
}

/**
 * Save packages to persistence file for the current tenant
 */
function savePackages() {
  const tenant = getCurrentTenant();
  const pkgMap = getImportedPackages();
  try {
    const dir = getPersistenceDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = Array.from(pkgMap.values());
    const file = getPersistenceFile();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`[Import] Saved ${data.length} packages to ${file} (tenant: ${tenant})`);
  } catch (err) {
    console.error(`[Import] Failed to save packages for tenant "${tenant}":`, err.message);
  }
}

// Load persisted packages for all known tenants on startup
for (const tenant of VALID_TENANTS) {
  loadPersistedPackagesForTenant(tenant);
}

/**
 * GET /api/import/packages
 * List all imported packages
 */
router.get('/packages', (_req, res) => {
  const packages = Array.from(getImportedPackages().values());
  res.json({
    ok: true,
    packages: packages.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt))
  });
});

/**
 * GET /api/import/packages/:id
 * Get a specific imported package
 */
router.get('/packages/:id', (req, res) => {
  const pkg = getImportedPackages().get(req.params.id);
  if (!pkg) {
    return res.status(404).json({ ok: false, error: 'Package not found' });
  }
  res.json({ ok: true, package: pkg });
});

/**
 * POST /api/import
 * Import an MCP package into Skill Builder catalog
 *
 * This adds the connectors to Skill Builder's prebuilt catalog,
 * making them available for use in skills and for deployment.
 *
 * Body: manifest.json content from package.sh
 */
router.post('/', async (req, res) => {
  try {
    const manifest = req.body;

    if (!manifest || !manifest.name) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid manifest: missing required fields'
      });
    }

    console.log(`[Import] Importing package: ${manifest.name} v${manifest.version}`);

    const mcps = manifest.mcps || [];
    const skills = manifest.skills || [];

    if (mcps.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Package contains no MCPs'
      });
    }

    // Handle existing package (update)
    const existingPackage = getImportedPackages().get(manifest.name);
    if (existingPackage) {
      console.log(`[Import] Updating existing package: ${manifest.name}`);
      for (const mcp of existingPackage.mcps) {
        unregisterImportedConnector(mcp.id);
      }
    }

    // Add each MCP to the Skill Builder's connector catalog
    const connectorConfigs = [];

    for (const mcp of mcps) {
      const connectorConfig = buildCatalogEntry(mcp);
      connectorConfigs.push(connectorConfig);

      registerImportedConnector(mcp.id, {
        ...connectorConfig,
        importedFrom: manifest.name
      });

      console.log(`[Import] Added connector to catalog: ${mcp.id} (${connectorConfig.transport})`);
    }

    // Store package info for tracking
    const packageInfo = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      importedAt: new Date().toISOString(),
      mcps: connectorConfigs,
      skills: skills
    };

    getImportedPackages().set(manifest.name, packageInfo);

    // Persist to file
    savePackages();

    console.log(`[Import] Package imported: ${mcps.length} MCPs added to catalog`);

    res.json({
      ok: true,
      package: packageInfo,
      message: `Imported ${mcps.length} connectors into Skill Builder catalog. Use the Skill Builder UI to deploy.`
    });

  } catch (err) {
    console.error('[Import] Failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/import/packages/:packageName
 * Remove a package from Skill Builder
 */
router.delete('/packages/:packageName', async (req, res) => {
  try {
    const { packageName } = req.params;

    const pkg = getImportedPackages().get(packageName);
    if (!pkg) {
      return res.status(404).json({ ok: false, error: 'Package not found' });
    }

    // Remove connectors from catalog
    for (const mcp of pkg.mcps) {
      unregisterImportedConnector(mcp.id);
    }

    getImportedPackages().delete(packageName);

    // Persist to file
    savePackages();

    console.log(`[Import] Package ${packageName} removed`);

    res.json({ ok: true, message: `Package ${packageName} removed` });

  } catch (err) {
    console.error('[Import] Remove failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/import/connectors
 * List all connectors from imported packages
 */
router.get('/connectors', (_req, res) => {
  const connectors = [];

  for (const pkg of getImportedPackages().values()) {
    for (const mcp of pkg.mcps) {
      connectors.push({
        ...mcp,
        importedFrom: pkg.name,
        importedVersion: pkg.version
      });
    }
  }

  res.json({ ok: true, connectors });
});

/**
 * PATCH /api/import/packages/:packageName/connectors/:connectorId
 * Update a connector config in Skill Builder
 */
router.patch('/packages/:packageName/connectors/:connectorId', async (req, res) => {
  try {
    const { packageName, connectorId } = req.params;
    const updates = req.body;

    const pkg = getImportedPackages().get(packageName);
    if (!pkg) {
      return res.status(404).json({ ok: false, error: 'Package not found' });
    }

    const mcp = pkg.mcps.find(m => m.id === connectorId);
    if (!mcp) {
      return res.status(404).json({ ok: false, error: 'Connector not found' });
    }

    // Apply updates
    const allowedFields = ['name', 'description', 'endpoint', 'port', 'layer', 'ui_capable'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        mcp[field] = updates[field];
      }
    }

    // Re-derive endpoint if port changed
    if (updates.port && !updates.endpoint) {
      mcp.endpoint = deriveEndpoint(mcp);
    }

    // Update in catalog
    registerImportedConnector(connectorId, {
      ...buildCatalogEntry(mcp),
      importedFrom: packageName
    });

    // Persist to file
    savePackages();

    console.log(`[Import] Updated connector: ${connectorId}`);

    res.json({ ok: true, connector: mcp });

  } catch (err) {
    console.error('[Import] Update failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/import/skill
 * Import a skill YAML into Skill Builder as a skill
 *
 * Duplicate Prevention Strategy:
 * 1. First, try to find existing skill by skill's original ID (e.g., "support-tier-1")
 * 2. If not found, search all skills for one with matching original_skill_id field
 * 3. If not found, search by name (for backwards compatibility)
 * 4. Only create new skill if no match found
 *
 * Body: { solution_id: string, yaml: string } - solution ID and skill YAML content
 *   OR
 * Body: { solution_id: string, ...skillObject } - solution ID and skill object directly (parsed YAML)
 */
router.post('/skill', async (req, res) => {
  try {
    let { solution_id } = req.body;
    let skillData = req.body;

    // If body contains yaml string, parse it (but keep solution_id from body)
    if (typeof skillData.yaml === 'string') {
      try {
        skillData = yaml.load(skillData.yaml);
      } catch (parseErr) {
        return res.status(400).json({
          ok: false,
          error: `Invalid YAML: ${parseErr.message}`
        });
      }
    }

    // Use solution_id from top level (before YAML parsing overwrites it)
    if (!solution_id) {
      solution_id = skillData.solution_id;
    }

    // Validate required fields
    if (!solution_id) {
      return res.status(400).json({
        ok: false,
        error: 'solution_id is required'
      });
    }

    if (!skillData.id || !skillData.name) {
      return res.status(400).json({
        ok: false,
        error: 'Skill must have id and name fields'
      });
    }

    const originalSkillId = skillData.id;
    console.log(`[Import] Importing skill: ${skillData.name} (${originalSkillId}) into solution ${solution_id}`);

    // Strategy: Find existing skill to update (prevent duplicates)
    let existingSkill = null;

    // 1. Try to load by original skill ID directly (if it was used as skill ID)
    try {
      existingSkill = await skillsStore.load(solution_id, originalSkillId);
      if (existingSkill) {
        console.log(`[Import] Found existing skill by skill ID: ${originalSkillId}`);
      }
    } catch (err) {
      // Skill doesn't exist with that ID
    }

    // 2. If not found, search all skills for matching original_skill_id or name
    if (!existingSkill) {
      try {
        const allSkills = await skillsStore.list(solution_id);

        // First try to match by original_skill_id
        for (const skillSummary of allSkills) {
          try {
            const skill = await skillsStore.load(solution_id, skillSummary.id);
            if (skill.original_skill_id === originalSkillId) {
              existingSkill = skill;
              console.log(`[Import] Found existing skill by original_skill_id: ${skillSummary.id}`);
              break;
            }
          } catch (err) {
            // Skip skills that can't be loaded
          }
        }

        // If still not found, try to match by name (for backwards compatibility)
        if (!existingSkill) {
          for (const skillSummary of allSkills) {
            if (skillSummary.name === skillData.name) {
              try {
                existingSkill = await skillsStore.load(solution_id, skillSummary.id);
                console.log(`[Import] Found existing skill by name: ${skillSummary.id}`);
                break;
              } catch (err) {
                // Skip skills that can't be loaded
              }
            }
          }
        }
      } catch (err) {
        console.log(`[Import] Could not search existing skills: ${err.message}`);
      }
    }

    let skillId;

    if (existingSkill) {
      // Update existing skill - merge skill data into existing skill
      console.log(`[Import] Updating existing skill: ${existingSkill.id}`);
      skillId = existingSkill.id;
      const updatedSkill = {
        ...existingSkill,
        ...skillData,
        id: existingSkill.id, // Keep the existing skill ID
        solution_id, // Ensure solution_id is set
        original_skill_id: originalSkillId, // Track the original skill ID
        updated_at: new Date().toISOString()
      };
      await skillsStore.save(updatedSkill);
    } else {
      // Create new skill
      console.log(`[Import] Creating new skill for skill: ${originalSkillId}`);
      const skill = await skillsStore.create(solution_id, skillData.name, skillData.settings || {});
      skillId = skill.id;

      // Save with full skill data and track original skill ID
      const fullSkill = {
        ...skillData,
        id: skill.id,
        solution_id, // Ensure solution_id is set
        original_skill_id: originalSkillId, // Track the original skill ID for future imports
        created_at: skill.created_at,
        updated_at: new Date().toISOString()
      };
      await skillsStore.save(fullSkill);
    }

    console.log(`[Import] Skill imported: ${skillData.name} -> ${skillId}`);

    // Link skillId back to any package that references this skill by its original ID.
    // This allows deploy-all to find the skillId for each package skill entry.
    for (const [, pkg] of getImportedPackages()) {
      if (!Array.isArray(pkg.skills)) continue;
      for (const skillRef of pkg.skills) {
        if (skillRef.id === originalSkillId) {
          skillRef.skillId = skillId;
          console.log(`[Import] Linked skill ${originalSkillId} -> ${skillId} in package ${pkg.name}`);
        }
      }
      // Also set solution reference if missing
      if (solution_id && (!pkg.solution || !pkg.solution.id)) {
        pkg.solution = { id: solution_id };
      }
    }
    savePackages();

    res.json({
      ok: true,
      skill: {
        id: skillId,
        original_skill_id: originalSkillId,
        name: skillData.name,
        description: skillData.description
      },
      message: existingSkill
        ? `Skill "${skillData.name}" updated (existing skill: ${skillId})`
        : `Skill "${skillData.name}" imported as new skill: ${skillId}`
    });

  } catch (err) {
    console.error('[Import] Skill import failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Helper: Find existing skill by skill ID, original_skill_id, or name
 * Searches ALL skills (not filtered by solution) to find matches
 * Returns the existing skill or null if not found
 */
async function findExistingSkillForSkill(solutionId, originalSkillId, skillName) {
  // 1. Try to load by original skill ID directly (skill.id matches originalSkillId)
  try {
    const skill = await skillsStore.load(null, originalSkillId);
    if (skill) {
      console.log(`[Import] Found existing skill by direct ID: ${originalSkillId}`);
      return skill;
    }
  } catch (err) {
    // Skill doesn't exist with that ID
  }

  // 2. Search ALL skills for matching original_skill_id, id, or name
  try {
    // list() returns ALL skills (doesn't filter by solution)
    const allSkills = await skillsStore.list();

    // First try to match by exact ID
    for (const skillSummary of allSkills) {
      if (skillSummary.id === originalSkillId) {
        try {
          const skill = await skillsStore.load(null, skillSummary.id);
          console.log(`[Import] Found existing skill by ID match: ${skillSummary.id}`);
          return skill;
        } catch (err) {
          // Skip skills that can't be loaded
        }
      }
    }

    // Try to match by original_skill_id field
    for (const skillSummary of allSkills) {
      try {
        const skill = await skillsStore.load(null, skillSummary.id);
        if (skill.original_skill_id === originalSkillId) {
          console.log(`[Import] Found existing skill by original_skill_id: ${skillSummary.id}`);
          return skill;
        }
      } catch (err) {
        // Skip skills that can't be loaded
      }
    }

    // Try to match by name (for backwards compatibility)
    for (const skillSummary of allSkills) {
      if (skillSummary.name === skillName) {
        try {
          const skill = await skillsStore.load(null, skillSummary.id);
          console.log(`[Import] Found existing skill by name: ${skillSummary.id} (${skillName})`);
          return skill;
        } catch (err) {
          // Skip skills that can't be loaded
        }
      }
    }
  } catch (err) {
    console.log(`[Import] Could not search existing skills: ${err.message}`);
  }

  return null;
}

/**
 * POST /api/import/skills
 * Import multiple skills from YAML files
 *
 * Body: { solution_id: string, skills: [{ yaml: string }, ...] }
 *   OR
 * Body: { solution_id: string, skills: [skillObject, ...] }
 */
router.post('/skills', async (req, res) => {
  try {
    const { solution_id, skills } = req.body;

    if (!solution_id) {
      return res.status(400).json({
        ok: false,
        error: 'solution_id is required'
      });
    }

    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'skills array is required'
      });
    }

    console.log(`[Import] Importing ${skills.length} skills into solution ${solution_id}...`);

    const results = [];
    const errors = [];

    for (const skill of skills) {
      try {
        let skillData = skill;

        // Parse YAML if needed
        if (typeof skill.yaml === 'string') {
          skillData = yaml.load(skill.yaml);
        }

        if (!skillData.id || !skillData.name) {
          errors.push({ id: skillData.id || 'unknown', error: 'Missing id or name' });
          continue;
        }

        const originalSkillId = skillData.id;

        // Find existing skill to update (prevent duplicates)
        const existingSkill = await findExistingSkillForSkill(solution_id, originalSkillId, skillData.name);

        let skillId;
        let isUpdate = false;

        if (existingSkill) {
          skillId = existingSkill.id;
          isUpdate = true;
          const updatedSkill = {
            ...existingSkill,
            ...skillData,
            id: existingSkill.id,
            solution_id,
            original_skill_id: originalSkillId,
            updated_at: new Date().toISOString()
          };
          await skillsStore.save(updatedSkill);
        } else {
          const skill = await skillsStore.create(solution_id, skillData.name, skillData.settings || {});
          skillId = skill.id;
          const fullSkill = {
            ...skillData,
            id: skill.id,
            solution_id,
            original_skill_id: originalSkillId,
            created_at: skill.created_at,
            updated_at: new Date().toISOString()
          };
          await skillsStore.save(fullSkill);
        }

        results.push({
          id: skillId,
          original_skill_id: originalSkillId,
          name: skillData.name,
          status: isUpdate ? 'updated' : 'imported'
        });

        console.log(`[Import] ${isUpdate ? 'Updated' : 'Imported'} skill: ${skillData.name} -> ${skillId}`);
      } catch (err) {
        errors.push({ id: skill.id || 'unknown', error: err.message });
      }
    }

    res.json({
      ok: errors.length === 0,
      imported: results,
      errors: errors.length > 0 ? errors : undefined,
      message: `Imported ${results.length} skills${errors.length > 0 ? `, ${errors.length} failed` : ''}`
    });

  } catch (err) {
    console.error('[Import] Skills import failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================================
// Solution Pack Support
// ============================================================================

function getSolutionPacksDir() { return path.join(getPersistenceDir(), 'solution-packs'); }

/**
 * POST /api/import/solution-pack
 * Import a complete solution pack (tar.gz containing manifest + skills + mcp code)
 *
 * Accepts multipart form-data with a .tar.gz file OR a JSON body with:
 * {
 *   manifest: { ... },           // manifest.json contents
 *   skills: { "id": "yaml..." }, // skill id -> YAML content map
 *   mcpStore: { "id": [{ path, content }] } // connector id -> files map
 * }
 */
router.post('/solution-pack', upload.single('file'), async (req, res) => {
  try {
    let manifest, skillFiles, mcpStoreFiles;

    // Check if file was uploaded via multipart
    if (req.file) {
      // Multer saved the uploaded file — move it and extract
      const extractDir = path.join(getSolutionPacksDir(), `_extract_${Date.now()}`);
      fs.mkdirSync(extractDir, { recursive: true });

      const tarPath = path.join(extractDir, 'pack.tar.gz');
      // copyFile + unlink instead of rename to avoid EXDEV across Docker volumes
      fs.copyFileSync(req.file.path, tarPath);
      try { fs.unlinkSync(req.file.path); } catch { /* ok */ }

      try {
        execSync(`tar -xzf pack.tar.gz`, { cwd: extractDir });
      } catch (e) {
        return res.status(400).json({ ok: false, error: `Failed to extract tar.gz: ${e.message}` });
      }

      // Find the extracted directory (might be nested under solution-pack/)
      let packDir = extractDir;
      const subDirs = fs.readdirSync(extractDir).filter(f =>
        f !== 'pack.tar.gz' && fs.statSync(path.join(extractDir, f)).isDirectory()
      );
      if (subDirs.length === 1) {
        packDir = path.join(extractDir, subDirs[0]);
      }

      // Read manifest
      const manifestPath = path.join(packDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        return res.status(400).json({ ok: false, error: 'No manifest.json found in solution pack' });
      }
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Read skill files
      skillFiles = {};
      const skillsDir = path.join(packDir, 'skills');
      if (fs.existsSync(skillsDir)) {
        for (const file of fs.readdirSync(skillsDir)) {
          if (file.endsWith('.yaml') || file.endsWith('.yml')) {
            const skillId = file.replace(/\.(yaml|yml)$/, '');
            skillFiles[skillId] = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
          }
        }
      }

      // Read mcp-store files
      mcpStoreFiles = {};
      const mcpStoreDir = path.join(packDir, 'mcp-store');
      if (fs.existsSync(mcpStoreDir)) {
        for (const mcpDir of fs.readdirSync(mcpStoreDir)) {
          const mcpPath = path.join(mcpStoreDir, mcpDir);
          if (!fs.statSync(mcpPath).isDirectory()) continue;

          // Store the directory path for later upload
          mcpStoreFiles[mcpDir] = mcpPath;
        }
      }

      // Move extracted pack to permanent location
      const permanentDir = path.join(getSolutionPacksDir(), manifest.name);
      if (fs.existsSync(permanentDir)) {
        fs.rmSync(permanentDir, { recursive: true });
      }
      fs.renameSync(packDir, permanentDir);

      // Clean up temp files
      try { fs.unlinkSync(tarPath); } catch { /* ok */ }
      try { fs.rmdirSync(extractDir); } catch { /* ok if not empty */ }

      // Update mcpStoreFiles paths to permanent location
      for (const mcpId of Object.keys(mcpStoreFiles)) {
        mcpStoreFiles[mcpId] = path.join(permanentDir, 'mcp-store', mcpId);
      }

      // Read solution.yaml if present
      const solutionYamlPath = path.join(permanentDir, 'solution.yaml');
      if (fs.existsSync(solutionYamlPath)) {
        manifest._solutionYaml = fs.readFileSync(solutionYamlPath, 'utf-8');
        console.log('[Import] Found solution.yaml in solution pack');
      }

    } else if (req.body && (req.body.manifest || req.body.name)) {
      // JSON body
      manifest = req.body.manifest || req.body;
      skillFiles = req.body.skills || {};
      mcpStoreFiles = req.body.mcpStore || {};
    } else {
      return res.status(400).json({ ok: false, error: 'No file uploaded and no JSON body provided' });
    }

    if (!manifest || !manifest.name) {
      return res.status(400).json({ ok: false, error: 'Invalid manifest: missing name' });
    }

    console.log(`[Import] Importing solution pack: ${manifest.name} v${manifest.version}`);

    // ── One solution per tenant: clear everything before importing ──
    // Remove all existing packages and their connectors
    for (const [key, oldPkg] of getImportedPackages().entries()) {
      for (const mcp of (oldPkg.mcps || [])) {
        unregisterImportedConnector(mcp.id);
      }
      getImportedPackages().delete(key);
      console.log(`[Import] Cleared old package: ${key}`);
    }

    // Remove all existing skills (dom_* directories)
    const allSkills = await skillsStore.list();
    for (const skill of allSkills) {
      await skillsStore.remove(null, skill.id);
      console.log(`[Import] Removed old skill: ${skill.id}`);
    }

    // Remove all existing solutions
    const allSolutions = await solutionsStore.list();
    for (const sol of allSolutions) {
      await solutionsStore.remove(sol.id);
      console.log(`[Import] Removed old solution: ${sol.id}`);
    }

    savePackages(); // persist the now-empty packages list

    // Step 1: Register connectors in catalog
    const mcps = manifest.mcps || [];

    const connectorConfigs = [];
    for (const mcp of mcps) {
      const connectorConfig = buildCatalogEntry(mcp);
      connectorConfigs.push(connectorConfig);

      registerImportedConnector(mcp.id, {
        ...connectorConfig,
        mcp_store_included: !!manifest.mcp_store_included,
        importedFrom: manifest.name
      });
      console.log(`[Import] Registered connector: ${mcp.id}`);
    }

    // Step 2: Import solution.yaml FIRST (to get solution ID for skills)
    let solutionResult = null;
    let targetSolutionId = null;
    if (manifest._solutionYaml || manifest.solution) {
      try {
        const solutionYamlContent = manifest._solutionYaml;
        if (solutionYamlContent) {
          const solutionData = yaml.load(solutionYamlContent);
          const solution = await solutionsStore.importFromYaml(solutionData, []);
          targetSolutionId = solution.id;
          solutionResult = { id: solution.id, name: solution.name, status: 'imported' };
          console.log(`[Import] Solution imported: ${solution.name} (${solution.id})`);
        }
      } catch (err) {
        console.error('[Import] Solution import failed:', err.message);
        solutionResult = { status: 'error', error: err.message };
      }
    }

    // If no solution was imported but we need to import skills, require solution_id in manifest
    if (!targetSolutionId && manifest.solution_id) {
      targetSolutionId = manifest.solution_id;
    }

    // Step 3: Import skills as skills (now with solution context)
    const skillResults = [];
    const skills = manifest.skills || [];

    if (skills.length > 0 && !targetSolutionId) {
      console.warn('[Import] No solution context for skills - skills will not be imported');
    } else {
      for (const skillRef of skills) {
        const skillYaml = skillFiles[skillRef.id];
        if (!skillYaml) {
          console.log(`[Import] Skipping skill ${skillRef.id}: no YAML file found`);
          continue;
        }

        try {
          const skillData = yaml.load(skillYaml);
          if (!skillData.id) skillData.id = skillRef.id;
          if (!skillData.name) skillData.name = skillRef.name;

          const existingSkill = await findExistingSkillForSkill(targetSolutionId, skillData.id, skillData.name);
          let skillId;

          if (existingSkill) {
            skillId = existingSkill.id;
            const updated = {
              ...existingSkill,
              ...skillData,
              id: existingSkill.id,
              solution_id: targetSolutionId,
              original_skill_id: skillData.id,
              updated_at: new Date().toISOString()
            };
            await skillsStore.save(updated);
            skillResults.push({ id: skillId, originalId: skillData.id, name: skillData.name, status: 'updated' });
          } else {
            const skill = await skillsStore.create(targetSolutionId, skillData.name, skillData.settings || {});
            skillId = skill.id;
            await skillsStore.save({
              ...skillData,
              id: skill.id,
              solution_id: targetSolutionId,
              original_skill_id: skillData.id,
              created_at: skill.created_at,
              updated_at: new Date().toISOString()
            });
            skillResults.push({ id: skillId, originalId: skillData.id, name: skillData.name, status: 'imported' });
          }

          console.log(`[Import] Skill ${skillData.name} -> ${skillId}`);
        } catch (err) {
          console.error(`[Import] Skill ${skillRef.id} failed:`, err.message);
          skillResults.push({ id: skillRef.id, name: skillRef.name, status: 'error', error: err.message });
        }
      }
    }

    // Clean up internal field
    delete manifest._solutionYaml;

    // Step 4: Store package info
    const packageInfo = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      mcp_store_included: manifest.mcp_store_included || Object.keys(mcpStoreFiles).length > 0,
      mcpStorePath: path.join(getSolutionPacksDir(), manifest.name, 'mcp-store'),
      importedAt: new Date().toISOString(),
      mcps: connectorConfigs,
      skills: skills.map(s => {
        const result = skillResults.find(r => r.originalId === s.id);
        return { ...s, skillId: result?.id, status: result?.status };
      }),
      solution: solutionResult || (targetSolutionId ? { id: targetSolutionId, status: 'referenced' } : null)
    };

    // One solution per tenant — just set the single package
    getImportedPackages().set(manifest.name, packageInfo);
    savePackages();

    console.log(`[Import] Solution pack imported: ${connectorConfigs.length} connectors, ${skillResults.length} skills${solutionResult ? ', 1 solution' : ''}`);

    res.json({
      ok: true,
      package: packageInfo,
      skills: skillResults,
      solution: solutionResult,
      message: `Imported ${connectorConfigs.length} connectors + ${skillResults.length} skills${solutionResult ? ' + 1 solution' : ''}`
    });

  } catch (err) {
    console.error('[Import] Solution pack import failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/import/packages/:packageName/deploy-all
 * Deploy all skills and connectors from an imported package to ADAS Core.
 *
 * Returns SSE stream with progress events.
 */
router.post('/packages/:packageName/deploy-all', async (req, res) => {
  const { packageName } = req.params;
  const pkg = getImportedPackages().get(packageName);

  if (!pkg) {
    return res.status(404).json({ ok: false, error: 'Package not found' });
  }

  // Set up SSE streaming
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  function sendEvent(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  const connectorResults = [];
  const skillResults = [];

  try {
    const totalConnectors = pkg.mcps?.length || 0;
    const totalSkills = pkg.skills?.length || 0;

    sendEvent('start', { packageName, totalConnectors, totalSkills });

    // ── Phase 0: Deploy solution-level identity config ─────────────
    const solutionId = pkg.solution?.id;
    if (solutionId) {
      sendEvent('identity_progress', { status: 'deploying', message: 'Deploying identity config...' });
      try {
        const identityResult = await deployIdentityToADAS(solutionId, console);
        if (identityResult.ok && !identityResult.skipped) {
          sendEvent('identity_progress', { status: 'done', message: `Deployed ${identityResult.actor_types?.length || 0} actor types` });
        } else if (identityResult.skipped) {
          sendEvent('identity_progress', { status: 'skipped', message: 'No identity config defined' });
        } else {
          sendEvent('identity_progress', { status: 'warning', message: `Identity deploy failed: ${identityResult.error}` });
        }
      } catch (err) {
        sendEvent('identity_progress', { status: 'warning', message: `Identity deploy error: ${err.message}` });
      }
    }

    // ── Phase 1: Deploy connectors ──────────────────────────────────
    for (let i = 0; i < totalConnectors; i++) {
      const mcp = pkg.mcps[i];
      sendEvent('connector_progress', { connectorId: mcp.id, name: mcp.name, index: i + 1, total: totalConnectors, status: 'deploying', step: 'starting', message: 'Starting...' });

      try {
        // Upload MCP code if we have it
        if (pkg.mcp_store_included && pkg.mcpStorePath) {
          const mcpCodeDir = path.join(pkg.mcpStorePath, mcp.id);
          if (fs.existsSync(mcpCodeDir)) {
            sendEvent('connector_progress', { connectorId: mcp.id, status: 'deploying', step: 'uploading_code', message: 'Uploading code...' });
            await uploadMcpCodeToADAS(mcp.id, mcpCodeDir);
          }
        }

        // Build connector payload — pass through manifest data as-is
        const connectorPayload = buildConnectorPayload(mcp);

        sendEvent('connector_progress', { connectorId: mcp.id, status: 'deploying', step: 'registering', message: 'Registering in ADAS...' });
        await syncConnectorToADAS(connectorPayload);

        sendEvent('connector_progress', { connectorId: mcp.id, status: 'deploying', step: 'connecting', message: 'Connecting...' });
        const startResult = await startConnectorInADAS(mcp.id);
        const toolCount = startResult?.tools?.length || 0;

        connectorResults.push({ id: mcp.id, ok: true, tools: toolCount });
        sendEvent('connector_progress', { connectorId: mcp.id, status: 'done', step: 'done', tools: toolCount, message: `${toolCount} tools` });

      } catch (err) {
        connectorResults.push({ id: mcp.id, ok: false, error: err.message });
        sendEvent('connector_progress', { connectorId: mcp.id, status: 'error', step: 'error', error: err.message, message: err.message });
      }
    }

    // ── Phase 2: Deploy skills (direct call, no self-referential HTTP) ──
    // solutionId already declared above from pkg.solution?.id

    for (let i = 0; i < totalSkills; i++) {
      const skillRef = pkg.skills[i];
      // Support both skillId (new) and domainId (legacy) field names
      const skillId = skillRef.skillId || skillRef.domainId;

      if (!skillId) {
        skillResults.push({ id: skillRef.id, ok: false, error: 'No skill ID (skill not imported)' });
        sendEvent('skill_progress', { skillId: skillRef.id, name: skillRef.name, index: i + 1, total: totalSkills, status: 'error', step: 'skipped', message: 'No skill', error: 'no skill' });
        continue;
      }

      if (!solutionId) {
        skillResults.push({ id: skillRef.id, skillId, ok: false, error: 'No solution ID for package' });
        sendEvent('skill_progress', { skillId: skillRef.id, name: skillRef.name, index: i + 1, total: totalSkills, status: 'error', step: 'skipped', message: 'No solution', error: 'no solution' });
        continue;
      }

      sendEvent('skill_progress', { skillId: skillRef.id, skillId, name: skillRef.name, index: i + 1, total: totalSkills, status: 'deploying', step: 'starting', message: 'Starting...' });

      try {
        // Deploy directly using the shared function (no HTTP self-call)
        // deploySkillToADAS auto-generates MCP if server.py is missing
        const deployResult = await deploySkillToADAS(solutionId, skillId, console, (step, message) => {
          sendEvent('skill_progress', { skillId: skillRef.id, status: 'deploying', step, message });
        });

        skillResults.push({ id: skillRef.id, skillId, ok: true, mcpUri: deployResult.mcpUri });
        sendEvent('skill_progress', { skillId: skillRef.id, status: 'done', step: 'done', mcpUri: deployResult.mcpUri, message: 'Deployed' });

      } catch (err) {
        skillResults.push({ id: skillRef.id, skillId, ok: false, error: err.message });
        sendEvent('skill_progress', { skillId: skillRef.id, status: 'error', step: 'error', error: err.message, message: err.message });
      }
    }

    // ── Final summary ───────────────────────────────────────────────
    const summary = {
      connectors: { total: totalConnectors, deployed: connectorResults.filter(r => r.ok).length, failed: connectorResults.filter(r => !r.ok).length },
      skills: { total: totalSkills, deployed: skillResults.filter(r => r.ok).length, failed: skillResults.filter(r => !r.ok).length },
      connectorResults,
      skillResults
    };

    sendEvent('complete', summary);
    res.end();

  } catch (err) {
    sendEvent('error', { error: err.message });
    res.end();
  }
});

export default router;
