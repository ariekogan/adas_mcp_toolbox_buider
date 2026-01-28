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
import { registerImportedConnector, unregisterImportedConnector } from './connectors.js';
import domainsStore from '../store/domains.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

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

    console.log(`[Import] Importing skill: ${skillData.name} (${skillData.id})`);

    // Check if domain already exists
    let existingDomain = null;
    try {
      existingDomain = await domainsStore.load(skillData.id);
    } catch (err) {
      // Domain doesn't exist, that's fine
    }

    if (existingDomain) {
      // Update existing domain
      console.log(`[Import] Updating existing skill: ${skillData.id}`);
      await domainsStore.save(skillData.id, skillData);
    } else {
      // Create new domain - use the skill data directly
      // The domains store expects a name for create, but we want to use the skill's ID as slug
      const domain = await domainsStore.create(skillData.name, skillData.settings || {});

      // Now update with the full skill data
      await domainsStore.save(domain.id, {
        ...skillData,
        id: domain.id // Keep the generated ID
      });
    }

    console.log(`[Import] Skill imported: ${skillData.name}`);

    res.json({
      ok: true,
      skill: {
        id: skillData.id,
        name: skillData.name,
        description: skillData.description
      },
      message: `Skill "${skillData.name}" imported successfully`
    });

  } catch (err) {
    console.error('[Import] Skill import failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

        // Check if domain exists
        let existingDomain = null;
        try {
          existingDomain = await domainsStore.load(skillData.id);
        } catch (err) {
          // Domain doesn't exist
        }

        if (existingDomain) {
          await domainsStore.save(skillData.id, skillData);
        } else {
          const domain = await domainsStore.create(skillData.name, skillData.settings || {});
          await domainsStore.save(domain.id, { ...skillData, id: domain.id });
          skillData.id = domain.id;
        }

        results.push({
          id: skillData.id,
          name: skillData.name,
          status: 'imported'
        });

        console.log(`[Import] Imported skill: ${skillData.name}`);
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

export default router;
