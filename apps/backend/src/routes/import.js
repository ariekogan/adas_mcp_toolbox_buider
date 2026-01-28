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

const router = Router();

// Store imported packages (design time tracking)
const importedPackages = new Map();

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

    console.log(`[Import] Updated connector: ${connectorId}`);

    res.json({ ok: true, connector: mcp });

  } catch (err) {
    console.error('[Import] Update failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
