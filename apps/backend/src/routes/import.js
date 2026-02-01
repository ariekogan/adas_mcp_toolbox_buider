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
import domainsStore from '../store/domains.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { execSync } from 'child_process';
import {
  syncConnectorToADAS,
  startConnectorInADAS,
  uploadMcpCodeToADAS
} from '../services/adasConnectorSync.js';

// Multer config: store uploaded files in /tmp, accept .tar.gz up to 50MB
const upload = multer({ dest: '/tmp/solution-pack-uploads', limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// Persistence file path - use /memory if available (Docker), fallback to local
const PERSISTENCE_DIR = process.env.MEMORY_DIR || '/memory';
const PERSISTENCE_FILE = path.join(PERSISTENCE_DIR, 'imported-packages.json');

// Store imported packages (design time tracking)
const importedPackages = new Map();

/**
 * Load persisted packages on startup
 */
function loadPersistedPackages() {
  try {
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, 'utf8'));
      console.log(`[Import] Loading ${data.length} persisted packages...`);

      for (const pkg of data) {
        importedPackages.set(pkg.name, pkg);

        // Re-register connectors in catalog
        for (const mcp of pkg.mcps) {
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
            importedFrom: pkg.name
          });
          console.log(`[Import] Restored connector: ${mcp.id}`);
        }
      }
      console.log(`[Import] Loaded ${importedPackages.size} packages from persistence`);
    }
  } catch (err) {
    console.error('[Import] Failed to load persisted packages:', err.message);
  }
}

/**
 * Save packages to persistence file
 */
function savePackages() {
  try {
    // Ensure directory exists
    if (!fs.existsSync(PERSISTENCE_DIR)) {
      fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
    }

    const data = Array.from(importedPackages.values());
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(data, null, 2));
    console.log(`[Import] Saved ${data.length} packages to ${PERSISTENCE_FILE}`);
  } catch (err) {
    console.error('[Import] Failed to save packages:', err.message);
  }
}

// Load persisted packages on module load
loadPersistedPackages();

/**
 * GET /api/import/packages
 * List all imported packages
 */
router.get('/packages', (_req, res) => {
  const packages = Array.from(importedPackages.values());
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
  const pkg = importedPackages.get(req.params.id);
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
    const existingPackage = importedPackages.get(manifest.name);
    if (existingPackage) {
      console.log(`[Import] Updating existing package: ${manifest.name}`);
      for (const mcp of existingPackage.mcps) {
        unregisterImportedConnector(mcp.id);
      }
    }

    // Add each MCP to the Skill Builder's connector catalog
    const connectorConfigs = [];

    for (const mcp of mcps) {
      // Support both stdio (command/args) and http (endpoint) transports
      const isStdio = mcp.transport === 'stdio' || mcp.command;

      const connectorConfig = {
        id: mcp.id,
        name: mcp.name,
        description: mcp.description,
        transport: isStdio ? 'stdio' : 'http',
        category: mcp.category || 'custom',
        requiresAuth: mcp.requiresAuth || false,
        layer: mcp.layer || 'tenant'
      };

      // Add transport-specific fields
      if (isStdio) {
        connectorConfig.command = mcp.command;
        connectorConfig.args = mcp.args || [];
        connectorConfig.env = mcp.env || {};
      } else {
        connectorConfig.endpoint = mcp.endpoint || `http://${mcp.id}:${mcp.port}/mcp`;
        connectorConfig.port = mcp.port;
      }

      connectorConfigs.push(connectorConfig);

      // Register in Skill Builder's prebuilt catalog
      // This makes it available in the connector list for skills
      registerImportedConnector(mcp.id, {
        name: mcp.name,
        description: mcp.description,
        transport: connectorConfig.transport,
        command: connectorConfig.command,
        args: connectorConfig.args,
        env: connectorConfig.env,
        endpoint: connectorConfig.endpoint,
        port: connectorConfig.port,
        requiresAuth: connectorConfig.requiresAuth,
        category: connectorConfig.category,
        layer: connectorConfig.layer,
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

    importedPackages.set(manifest.name, packageInfo);

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

    const pkg = importedPackages.get(packageName);
    if (!pkg) {
      return res.status(404).json({ ok: false, error: 'Package not found' });
    }

    // Remove connectors from catalog
    for (const mcp of pkg.mcps) {
      unregisterImportedConnector(mcp.id);
    }

    importedPackages.delete(packageName);

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

  for (const pkg of importedPackages.values()) {
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

    const pkg = importedPackages.get(packageName);
    if (!pkg) {
      return res.status(404).json({ ok: false, error: 'Package not found' });
    }

    const mcp = pkg.mcps.find(m => m.id === connectorId);
    if (!mcp) {
      return res.status(404).json({ ok: false, error: 'Connector not found' });
    }

    // Apply updates
    const allowedFields = ['name', 'description', 'endpoint', 'port', 'layer'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        mcp[field] = updates[field];
      }
    }

    // Update endpoint if port changed
    if (updates.port) {
      mcp.endpoint = `http://${connectorId}:${updates.port}/mcp`;
    }

    // Update in catalog
    registerImportedConnector(connectorId, {
      name: mcp.name,
      description: mcp.description,
      transportType: mcp.transportType,
      endpoint: mcp.endpoint,
      port: mcp.port,
      requiresAuth: false,
      category: 'custom',
      layer: mcp.layer,
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
 * Import a skill YAML into Skill Builder as a domain
 *
 * Duplicate Prevention Strategy:
 * 1. First, try to find existing domain by skill's original ID (e.g., "support-tier-1")
 * 2. If not found, search all domains for one with matching original_skill_id field
 * 3. If not found, search by name (for backwards compatibility)
 * 4. Only create new domain if no match found
 *
 * Body: { yaml: string } - skill YAML content
 *   OR
 * Body: skill object directly (parsed YAML)
 */
router.post('/skill', async (req, res) => {
  try {
    let skillData = req.body;

    // If body contains yaml string, parse it
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

    // Validate required fields
    if (!skillData.id || !skillData.name) {
      return res.status(400).json({
        ok: false,
        error: 'Skill must have id and name fields'
      });
    }

    const originalSkillId = skillData.id;
    console.log(`[Import] Importing skill: ${skillData.name} (${originalSkillId})`);

    // Strategy: Find existing domain to update (prevent duplicates)
    let existingDomain = null;

    // 1. Try to load by original skill ID directly (if it was used as domain ID)
    try {
      existingDomain = await domainsStore.load(originalSkillId);
      if (existingDomain) {
        console.log(`[Import] Found existing domain by skill ID: ${originalSkillId}`);
      }
    } catch (err) {
      // Domain doesn't exist with that ID
    }

    // 2. If not found, search all domains for matching original_skill_id or name
    if (!existingDomain) {
      try {
        const allDomains = await domainsStore.list();

        // First try to match by original_skill_id
        for (const domainSummary of allDomains) {
          try {
            const domain = await domainsStore.load(domainSummary.id);
            if (domain.original_skill_id === originalSkillId) {
              existingDomain = domain;
              console.log(`[Import] Found existing domain by original_skill_id: ${domainSummary.id}`);
              break;
            }
          } catch (err) {
            // Skip domains that can't be loaded
          }
        }

        // If still not found, try to match by name (for backwards compatibility)
        if (!existingDomain) {
          for (const domainSummary of allDomains) {
            if (domainSummary.name === skillData.name) {
              try {
                existingDomain = await domainsStore.load(domainSummary.id);
                console.log(`[Import] Found existing domain by name: ${domainSummary.id}`);
                break;
              } catch (err) {
                // Skip domains that can't be loaded
              }
            }
          }
        }
      } catch (err) {
        console.log(`[Import] Could not search existing domains: ${err.message}`);
      }
    }

    let domainId;

    if (existingDomain) {
      // Update existing domain - merge skill data into existing domain
      console.log(`[Import] Updating existing domain: ${existingDomain.id}`);
      domainId = existingDomain.id;
      const updatedDomain = {
        ...existingDomain,
        ...skillData,
        id: existingDomain.id, // Keep the existing domain ID
        original_skill_id: originalSkillId, // Track the original skill ID
        updated_at: new Date().toISOString()
      };
      await domainsStore.save(updatedDomain);
    } else {
      // Create new domain
      console.log(`[Import] Creating new domain for skill: ${originalSkillId}`);
      const domain = await domainsStore.create(skillData.name, skillData.settings || {});
      domainId = domain.id;

      // Save with full skill data and track original skill ID
      const fullDomain = {
        ...skillData,
        id: domain.id,
        original_skill_id: originalSkillId, // Track the original skill ID for future imports
        created_at: domain.created_at,
        updated_at: new Date().toISOString()
      };
      await domainsStore.save(fullDomain);
    }

    console.log(`[Import] Skill imported: ${skillData.name} -> ${domainId}`);

    res.json({
      ok: true,
      skill: {
        id: domainId,
        original_skill_id: originalSkillId,
        name: skillData.name,
        description: skillData.description
      },
      message: existingDomain
        ? `Skill "${skillData.name}" updated (existing domain: ${domainId})`
        : `Skill "${skillData.name}" imported as new domain: ${domainId}`
    });

  } catch (err) {
    console.error('[Import] Skill import failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Helper: Find existing domain by skill ID, original_skill_id, or name
 * Returns the existing domain or null if not found
 */
async function findExistingDomainForSkill(originalSkillId, skillName) {
  // 1. Try to load by original skill ID directly
  try {
    const domain = await domainsStore.load(originalSkillId);
    if (domain) {
      console.log(`[Import] Found existing domain by skill ID: ${originalSkillId}`);
      return domain;
    }
  } catch (err) {
    // Domain doesn't exist with that ID
  }

  // 2. Search all domains for matching original_skill_id or name
  try {
    const allDomains = await domainsStore.list();

    // First try to match by original_skill_id
    for (const domainSummary of allDomains) {
      try {
        const domain = await domainsStore.load(domainSummary.id);
        if (domain.original_skill_id === originalSkillId) {
          console.log(`[Import] Found existing domain by original_skill_id: ${domainSummary.id}`);
          return domain;
        }
      } catch (err) {
        // Skip domains that can't be loaded
      }
    }

    // Try to match by name (for backwards compatibility)
    for (const domainSummary of allDomains) {
      if (domainSummary.name === skillName) {
        try {
          const domain = await domainsStore.load(domainSummary.id);
          console.log(`[Import] Found existing domain by name: ${domainSummary.id}`);
          return domain;
        } catch (err) {
          // Skip domains that can't be loaded
        }
      }
    }
  } catch (err) {
    console.log(`[Import] Could not search existing domains: ${err.message}`);
  }

  return null;
}

/**
 * POST /api/import/skills
 * Import multiple skills from YAML files
 *
 * Body: { skills: [{ yaml: string }, ...] }
 *   OR
 * Body: { skills: [skillObject, ...] }
 */
router.post('/skills', async (req, res) => {
  try {
    const { skills } = req.body;

    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'skills array is required'
      });
    }

    console.log(`[Import] Importing ${skills.length} skills...`);

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

        // Find existing domain to update (prevent duplicates)
        const existingDomain = await findExistingDomainForSkill(originalSkillId, skillData.name);

        let domainId;
        let isUpdate = false;

        if (existingDomain) {
          domainId = existingDomain.id;
          isUpdate = true;
          const updatedDomain = {
            ...existingDomain,
            ...skillData,
            id: existingDomain.id,
            original_skill_id: originalSkillId,
            updated_at: new Date().toISOString()
          };
          await domainsStore.save(updatedDomain);
        } else {
          const domain = await domainsStore.create(skillData.name, skillData.settings || {});
          domainId = domain.id;
          const fullDomain = {
            ...skillData,
            id: domain.id,
            original_skill_id: originalSkillId,
            created_at: domain.created_at,
            updated_at: new Date().toISOString()
          };
          await domainsStore.save(fullDomain);
        }

        results.push({
          id: domainId,
          original_skill_id: originalSkillId,
          name: skillData.name,
          status: isUpdate ? 'updated' : 'imported'
        });

        console.log(`[Import] ${isUpdate ? 'Updated' : 'Imported'} skill: ${skillData.name} -> ${domainId}`);
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

const SOLUTION_PACKS_DIR = path.join(PERSISTENCE_DIR, 'solution-packs');

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
      const extractDir = path.join(SOLUTION_PACKS_DIR, `_extract_${Date.now()}`);
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
      const permanentDir = path.join(SOLUTION_PACKS_DIR, manifest.name);
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

    // Step 1: Register connectors in catalog (existing logic)
    const mcps = manifest.mcps || [];
    const existingPackage = importedPackages.get(manifest.name);
    if (existingPackage) {
      for (const mcp of existingPackage.mcps) {
        unregisterImportedConnector(mcp.id);
      }
    }

    const connectorConfigs = [];
    for (const mcp of mcps) {
      const isStdio = mcp.transport === 'stdio' || mcp.command;
      const connectorConfig = {
        id: mcp.id,
        name: mcp.name,
        description: mcp.description,
        transport: isStdio ? 'stdio' : 'http',
        command: isStdio ? mcp.command : undefined,
        args: isStdio ? mcp.args || [] : undefined,
        env: mcp.env || {},
        endpoint: !isStdio ? mcp.endpoint : undefined,
        port: mcp.port,
        category: mcp.category || 'custom',
        requiresAuth: mcp.requiresAuth || false,
        layer: mcp.layer || 'tenant'
      };
      connectorConfigs.push(connectorConfig);

      registerImportedConnector(mcp.id, {
        ...connectorConfig,
        importedFrom: manifest.name
      });
      console.log(`[Import] Registered connector: ${mcp.id}`);
    }

    // Step 2: Import skills as domains
    const skillResults = [];
    const skills = manifest.skills || [];

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

        const existingDomain = await findExistingDomainForSkill(skillData.id, skillData.name);
        let domainId;

        if (existingDomain) {
          domainId = existingDomain.id;
          const updated = {
            ...existingDomain,
            ...skillData,
            id: existingDomain.id,
            original_skill_id: skillData.id,
            updated_at: new Date().toISOString()
          };
          await domainsStore.save(updated);
          skillResults.push({ id: domainId, originalId: skillData.id, name: skillData.name, status: 'updated' });
        } else {
          const domain = await domainsStore.create(skillData.name, skillData.settings || {});
          domainId = domain.id;
          await domainsStore.save({
            ...skillData,
            id: domain.id,
            original_skill_id: skillData.id,
            created_at: domain.created_at,
            updated_at: new Date().toISOString()
          });
          skillResults.push({ id: domainId, originalId: skillData.id, name: skillData.name, status: 'imported' });
        }

        console.log(`[Import] Skill ${skillData.name} -> ${domainId}`);
      } catch (err) {
        console.error(`[Import] Skill ${skillRef.id} failed:`, err.message);
        skillResults.push({ id: skillRef.id, name: skillRef.name, status: 'error', error: err.message });
      }
    }

    // Step 3: Store package info
    const packageInfo = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      mcp_store_included: manifest.mcp_store_included || Object.keys(mcpStoreFiles).length > 0,
      mcpStorePath: path.join(SOLUTION_PACKS_DIR, manifest.name, 'mcp-store'),
      importedAt: new Date().toISOString(),
      mcps: connectorConfigs,
      skills: skills.map(s => {
        const result = skillResults.find(r => r.originalId === s.id);
        return { ...s, domainId: result?.id, status: result?.status };
      })
    };

    importedPackages.set(manifest.name, packageInfo);
    savePackages();

    console.log(`[Import] Solution pack imported: ${connectorConfigs.length} connectors, ${skillResults.length} skills`);

    res.json({
      ok: true,
      package: packageInfo,
      skills: skillResults,
      message: `Imported ${connectorConfigs.length} connectors + ${skillResults.length} skills`
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
  const pkg = importedPackages.get(packageName);

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
  const adasUrl = process.env.ADAS_CORE_URL || 'http://ai-dev-assistant-backend-1:4000';

  try {
    const totalConnectors = pkg.mcps?.length || 0;
    const totalSkills = pkg.skills?.length || 0;

    sendEvent('start', { packageName, totalConnectors, totalSkills });

    // ── Phase 1: Deploy connectors ──────────────────────────────────
    for (let i = 0; i < totalConnectors; i++) {
      const mcp = pkg.mcps[i];
      sendEvent('connector_progress', { connectorId: mcp.id, name: mcp.name, index: i + 1, total: totalConnectors, step: 'starting' });

      try {
        // Upload MCP code if we have it
        if (pkg.mcp_store_included && pkg.mcpStorePath) {
          const mcpCodeDir = path.join(pkg.mcpStorePath, mcp.id);
          if (fs.existsSync(mcpCodeDir)) {
            sendEvent('connector_progress', { connectorId: mcp.id, step: 'uploading_code' });
            await uploadMcpCodeToADAS(mcp.id, mcpCodeDir);
          }
        }

        // Build connector config for ADAS
        const isStdio = mcp.transport === 'stdio' || mcp.command;
        const connectorPayload = {
          id: mcp.id,
          name: mcp.name,
          type: 'mcp',
          transport: isStdio ? 'stdio' : 'http',
          endpoint: mcp.endpoint,
          config: isStdio ? {
            command: mcp.command,
            args: mcp.args || [],
            env: mcp.env || {}
          } : undefined,
          credentials: {}
        };

        // If we uploaded code, use /mcp-store path for args
        if (pkg.mcp_store_included && isStdio) {
          connectorPayload.config.args = [`/mcp-store/${mcp.id}/server.js`];
        }

        sendEvent('connector_progress', { connectorId: mcp.id, step: 'registering' });
        await syncConnectorToADAS(connectorPayload);

        sendEvent('connector_progress', { connectorId: mcp.id, step: 'starting' });
        const startResult = await startConnectorInADAS(mcp.id);
        const toolCount = startResult?.tools?.length || 0;

        connectorResults.push({ id: mcp.id, ok: true, tools: toolCount });
        sendEvent('connector_progress', { connectorId: mcp.id, step: 'done', tools: toolCount });

      } catch (err) {
        connectorResults.push({ id: mcp.id, ok: false, error: err.message });
        sendEvent('connector_progress', { connectorId: mcp.id, step: 'error', error: err.message });
      }
    }

    // ── Phase 2: Deploy skills ──────────────────────────────────────
    for (let i = 0; i < totalSkills; i++) {
      const skillRef = pkg.skills[i];
      const domainId = skillRef.domainId;

      if (!domainId) {
        skillResults.push({ id: skillRef.id, ok: false, error: 'No domain ID (skill not imported)' });
        sendEvent('skill_progress', { skillId: skillRef.id, name: skillRef.name, index: i + 1, total: totalSkills, step: 'skipped', error: 'no domain' });
        continue;
      }

      sendEvent('skill_progress', { skillId: skillRef.id, domainId, name: skillRef.name, index: i + 1, total: totalSkills, step: 'starting' });

      try {
        // Check if domain has a generated MCP export
        const domain = await domainsStore.load(domainId);
        const version = domain?.version;

        if (!version) {
          // Need to generate MCP first — use the generation endpoint internally
          sendEvent('skill_progress', { skillId: skillRef.id, step: 'generating_mcp' });

          const genUrl = `http://localhost:${process.env.PORT || 3000}/api/export/${domainId}/mcp/develop`;
          const genRes = await fetch(genUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forceRegenerate: false })
          });

          if (!genRes.ok) {
            const err = await genRes.json().catch(() => ({}));
            throw new Error(err.error || `MCP generation failed: ${genRes.status}`);
          }

          // Wait for generation to complete (it might return SSE)
          const genData = await genRes.text();
          console.log(`[DeployAll] Generated MCP for ${skillRef.id}`);
        }

        // Deploy to ADAS Core
        sendEvent('skill_progress', { skillId: skillRef.id, step: 'deploying' });

        const deployUrl = `http://localhost:${process.env.PORT || 3000}/api/export/${domainId}/mcp/deploy`;
        const deployRes = await fetch(deployUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!deployRes.ok) {
          const err = await deployRes.json().catch(() => ({}));
          throw new Error(err.error || `Deploy failed: ${deployRes.status}`);
        }

        const deployData = await deployRes.json();
        skillResults.push({ id: skillRef.id, domainId, ok: true, mcpUri: deployData.mcpUri });
        sendEvent('skill_progress', { skillId: skillRef.id, step: 'done', mcpUri: deployData.mcpUri });

      } catch (err) {
        skillResults.push({ id: skillRef.id, domainId, ok: false, error: err.message });
        sendEvent('skill_progress', { skillId: skillRef.id, step: 'error', error: err.message });
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
