/**
 * Deploy Routes
 *
 * POST /api/deploy/solution
 * Deploys a complete solution with all skills and connectors to A-Team Core.
 *
 * Accepts:
 * - solution: solution definition (id, name, identity, grants, handoffs, routing)
 * - skills[]: array of skill definitions
 * - connectors[]: array of connector metadata
 * - mcp_store: optional connector source code (key -> array of {path, content})
 */

import { Router } from 'express';
import solutionsStore from '../store/solutions.js';
import skillsStore from '../store/skills.js';
import { deploySkillToADAS, deployIdentityToADAS } from '../services/exportDeploy.js';
import adasCore from '../services/adasCoreClient.js';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * POST /api/deploy/solution
 * Deploy a complete solution to A-Team Core
 */
router.post('/solution', async (req, res, next) => {
  try {
    const log = req.app.locals.log;
    console.log(`[deploy.js] HIT /api/deploy/solution — body keys: ${Object.keys(req.body || {}).join(', ')}`);
    const { solution, skills = [], connectors = [], mcp_store = {}, github = false } = req.body;

    if (!solution || !solution.id) {
      return res.status(400).json({ ok: false, error: 'Missing solution.id' });
    }

    if (!Array.isArray(skills)) {
      return res.status(400).json({ ok: false, error: 'skills must be an array' });
    }

    log.info(`[Deploy] Starting deployment of solution "${solution.id}"...`);
    log.info(`[Deploy] GitHub mode: ${github ? 'enabled (will pull from GitHub)' : 'disabled (using inline mcp_store)'}`);
    log.info(`[Deploy] Skills: ${skills.length}, Connectors: ${connectors.length}, mcp_store keys: ${Object.keys(mcp_store).join(', ') || 'NONE'}`);

    // Step 1: Save solution to Skill Builder
    try {
      log.info(`[Deploy] Saving solution "${solution.id}" to Skill Builder...`);
      await solutionsStore.save(solution);
      log.info(`[Deploy] Solution saved successfully`);
    } catch (err) {
      log.error(`[Deploy] Failed to save solution: ${err.message}`);
      return res.status(500).json({
        ok: false,
        error: 'Failed to save solution to Skill Builder',
        details: err.message
      });
    }

    // Step 2: Save skills to Skill Builder
    const savedSkills = [];
    for (const skill of skills) {
      if (!skill.id) {
        log.warn(`[Deploy] Skipping skill with no id`);
        continue;
      }
      try {
        log.info(`[Deploy] Saving skill "${skill.id}"...`);
        await skillsStore.save(skill);
        savedSkills.push(skill.id);
        log.info(`[Deploy] Skill "${skill.id}" saved`);
      } catch (err) {
        log.error(`[Deploy] Failed to save skill "${skill.id}": ${err.message}`);
        // Continue with other skills
      }
    }

    // Step 3: Save connector source code (mcp_store) if provided
    if (Object.keys(mcp_store).length > 0) {
      try {
        log.info(`[Deploy] Saving connector source code from mcp_store...`);
        const connectorDir = path.join(process.env.TENANTS_ROOT || '/memory', 'connectors');
        if (!fs.existsSync(connectorDir)) {
          fs.mkdirSync(connectorDir, { recursive: true });
        }

        for (const [connectorId, files] of Object.entries(mcp_store)) {
          const connPath = path.join(connectorDir, connectorId);
          fs.mkdirSync(connPath, { recursive: true });

          for (const file of files) {
            const filePath = path.join(connPath, file.path);
            const fileDir = path.dirname(filePath);
            fs.mkdirSync(fileDir, { recursive: true });
            fs.writeFileSync(filePath, file.content, 'utf-8');
            log.info(`[Deploy] Saved connector file: ${connectorId}/${file.path}`);
          }
        }
      } catch (err) {
        log.warn(`[Deploy] Failed to save connector source code: ${err.message}`);
        // Continue even if mcp_store save fails
      }
    }

    // Step 3.5: Upload connector source code to ADAS Core and register connectors
    // This ensures connectors exist before skill deployment tries to sync them.
    const connectorResults = [];
    for (const [connId, files] of Object.entries(mcp_store)) {
      try {
        // Upload source code to ADAS Core's mcp-store
        log.info(`[Deploy] Uploading source code for connector "${connId}" to ADAS Core...`);
        await adasCore.uploadMcpCode(connId, files);
        log.info(`[Deploy] Source code uploaded for "${connId}"`);

        // Register connector in ADAS Core (create or update)
        const connMeta = connectors.find(c => c.id === connId) || {};
        await adasCore.syncConnector({
          id: connId,
          name: connMeta.name || connId,
          type: 'mcp',
          transport: connMeta.transport || 'stdio',
          config: {
            command: 'node',
            args: ['server.js'],
            env: connMeta.env || {},
          },
        });
        log.info(`[Deploy] Connector "${connId}" registered in ADAS Core`);

        // Stop old process before starting with new code
        try { await adasCore.stopConnector(connId); } catch { /* may not be running */ }

        // Start connector with updated code
        const startResult = await adasCore.startConnector(connId);
        const toolCount = startResult?.tools?.length || 0;
        connectorResults.push({ id: connId, ok: toolCount > 0, tools: toolCount });
        log.info(`[Deploy] Connector "${connId}" started (${toolCount} tools)`);
      } catch (err) {
        log.warn(`[Deploy] Connector "${connId}" setup failed (non-fatal): ${err.message}`);
        connectorResults.push({ id: connId, ok: false, error: err.message });
      }
    }

    // Step 4: Deploy to ADAS Core
    try {
      log.info(`[Deploy] Deploying to A-Team Core...`);

      // Deploy identity
      log.info(`[Deploy] Deploying solution identity...`);
      const identityResult = await deployIdentityToADAS(solution.id, log);
      log.info(`[Deploy] Identity deployed`, identityResult);

      // Deploy solution-level config (exclude_bootstrap_tools, etc.)
      if (solution.exclude_bootstrap_tools) {
        try {
          log.info(`[Deploy] Deploying solution config (exclude_bootstrap_tools)...`);
          await adasCore.deploySolutionConfig({
            exclude_bootstrap_tools: solution.exclude_bootstrap_tools,
          });
          log.info(`[Deploy] Solution config deployed`);
        } catch (err) {
          log.warn(`[Deploy] Solution config deployment failed (non-fatal): ${err.message}`);
        }
      }

      // Deploy UI plugins (if any)
      let uiPluginResult = null;
      if (solution.ui_plugins && solution.ui_plugins.length > 0) {
        try {
          log.info(`[Deploy] Deploying ${solution.ui_plugins.length} UI plugin(s) to Core...`);
          uiPluginResult = await adasCore.deployUiPlugins(solution.ui_plugins, { solutionId: solution.id });
          log.info(`[Deploy] UI plugins deployed: ${uiPluginResult.count || solution.ui_plugins.length} plugin(s)`);
        } catch (err) {
          log.warn(`[Deploy] UI plugins deployment failed (non-fatal): ${err.message}`);
          uiPluginResult = { ok: false, error: err.message };
        }
      }

      // Deploy each skill
      const deployedSkills = [];
      for (const skill of skills) {
        if (!savedSkills.includes(skill.id)) continue;
        try {
          log.info(`[Deploy] Deploying skill "${skill.id}" to A-Team Core...`);
          const result = await deploySkillToADAS(solution.id, skill.id, log);
          deployedSkills.push({ id: skill.id, status: 'deployed', result });
          log.info(`[Deploy] Skill "${skill.id}" deployed successfully`);
        } catch (err) {
          log.error(`[Deploy] Failed to deploy skill "${skill.id}": ${err.message}`);
          deployedSkills.push({ id: skill.id, status: 'failed', error: err.message });
        }
      }

      log.info(`[Deploy] Deployment complete. ${deployedSkills.filter(s => s.status === 'deployed').length}/${deployedSkills.length} skills deployed`);

      // Return success response
      return res.json({
        ok: true,
        solution_id: solution.id,
        solution_name: solution.name,
        solution_version: solution.version,
        skills_deployed: deployedSkills.filter(s => s.status === 'deployed').length,
        skills_total: deployedSkills.length,
        skills: deployedSkills,
        connectors: connectorResults.length > 0 ? connectorResults : undefined,
        ui_plugins: uiPluginResult || undefined,
        message: `Solution "${solution.id}" deployed to A-Team Core`
      });

    } catch (err) {
      log.error(`[Deploy] Failed to deploy to A-Team Core: ${err.message}`);
      return res.status(500).json({
        ok: false,
        error: 'Deployment to A-Team Core failed',
        details: err.message,
        solution_id: solution.id,
        skills_deployed: 0
      });
    }

  } catch (err) {
    req.app.locals.log.error(`[Deploy] Unexpected error: ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Internal server error', details: err.message });
  }
});

export default router;
