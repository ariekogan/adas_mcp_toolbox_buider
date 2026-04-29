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
import gitSync, { verifyConsistency } from '../services/gitSync.js';
import fs from 'fs';
import path from 'path';

/**
 * Pre-deploy consistency guard — F3 PR-5.
 *
 * Before any external deploy entrypoint touches state, we verify Builder FS
 * matches the GitHub repo for the target solution. If they drift, we either
 * block (strict), log + proceed (warn — default), or skip the check (off).
 *
 * Why guard at all: most deploy failures we see in the wild trace back to FS
 * vs GH drift — a skill exists in GH but not FS, or vice versa, and the
 * deploy reads from the wrong side. Boot sync (PR-2) reconciles on restart,
 * but between restarts drift can re-accumulate (an ateam_github_patch from
 * an external agent, a manual FS edit, a partial PR-3 write). The guard
 * catches that drift the moment a deploy is requested.
 *
 * Env: GITSYNC_DEPLOY_GUARD = warn (default) | strict | off
 */
const VALID_GUARD_MODES = new Set(['warn', 'strict', 'off']);
function resolveGuardMode() {
  const raw = (process.env.GITSYNC_DEPLOY_GUARD || 'warn').toLowerCase();
  return VALID_GUARD_MODES.has(raw) ? raw : 'warn';
}

/**
 * Run the pre-deploy guard for a solution.
 * @returns {Promise<{ blocked: boolean, body?: object }>}
 *   blocked=true and body set when caller should `return res.status(409).json(body)`.
 *   blocked=false when deploy should proceed.
 */
export async function runPreDeployGuard(solutionId, log) {
  const mode = resolveGuardMode();
  if (mode === 'off') return { blocked: false };

  let consistency;
  try {
    consistency = await verifyConsistency(solutionId);
  } catch (err) {
    // Verification itself crashed (network, parse, etc.). Never block deploys
    // because the guard is broken — log loudly and let the deploy through.
    log.warn(`[Deploy Guard] verifyConsistency(${solutionId}) crashed (non-fatal, deploy proceeds): ${err.message}`);
    return { blocked: false };
  }

  if (consistency.skipped) {
    // GitHub disabled or off-mode — nothing to verify, proceed.
    return { blocked: false };
  }

  if (consistency.ok) {
    log.info(`[Deploy Guard] ${solutionId}: FS == GH (no drift)`);
    return { blocked: false };
  }

  // Drift detected.
  log.warn(`[Deploy Guard] ${solutionId}: ${consistency.drifts.length} drift(s) detected`);
  consistency.drifts.forEach(d => {
    const detail = d.fsTarget ? ` (fs=${d.fsTarget})` : '';
    log.warn(`[Deploy Guard]   - ${d.kind}: ${d.path}${detail}`);
  });

  if (mode === 'strict') {
    return {
      blocked: true,
      body: {
        ok: false,
        error: 'Pre-deploy consistency check failed',
        code: 'DRIFT_DETECTED',
        solution_id: solutionId,
        drifts: consistency.drifts,
        hint: 'Run ateam_github_pull(solution_id) to restore Builder FS from GitHub, or restart the backend to trigger startup sync. Set GITSYNC_DEPLOY_GUARD=warn to log and proceed.',
      },
    };
  }

  // warn mode — log and let the deploy through.
  return { blocked: false };
}

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

    // Pre-deploy consistency guard (F3 PR-5). Skipped when github=true since the
    // caller is explicitly pulling from GH on this run — drift is about to be
    // overwritten by the pull. For inline / non-github deploys, drift means we
    // might be writing stale state to Core, so the guard is meaningful.
    if (!github) {
      const guard = await runPreDeployGuard(solution.id, log);
      if (guard.blocked) return res.status(409).json(guard.body);
    } else {
      log.info('[Deploy Guard] Skipped (github=true — pull will reconcile)');
    }

    // Wrap the entire bulk deploy in one gitSync.txn so all writes for this
    // solution + N skills collapse into one GH commit per repo. The inner
    // deploySkillToADAS calls (each their own txn) re-enter this outer txn,
    // so a 9-skill bulk deploy goes from 9*3+1 = 28 commits down to 1.
    return await gitSync.txn(`deploy-solution ${solution.id}`, async () => {

    // Step 0: Backup existing solution before overwriting (for rollback on deploy failure)
    let previousSolution = null;
    try {
      previousSolution = await solutionsStore.load(solution.id);
      log.info(`[Deploy] Backed up existing solution "${solution.id}" for rollback`);
    } catch { /* no existing solution — fresh deploy */ }

    // Step 1: Save solution to Skill Builder (merge linked_skills to avoid wiping existing skills)
    try {
      log.info(`[Deploy] Saving solution "${solution.id}" to Skill Builder...`);
      if (previousSolution && previousSolution.linked_skills?.length) {
        // Merge: keep existing linked_skills, add any new ones from payload
        const existingSkills = new Set(previousSolution.linked_skills);
        const payloadSkills = solution.linked_skills || [];
        for (const s of payloadSkills) existingSkills.add(s);
        solution.linked_skills = [...existingSkills];
        log.info(`[Deploy] Merged linked_skills: ${solution.linked_skills.length} total (was ${previousSolution.linked_skills.length}, payload had ${payloadSkills.length})`);
      }
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

        // Validate connectorId — only [a-z0-9_-] allowed; reject path-traversal
        // payloads like ".." or "/foo". Round 019 hardening.
        const CONNECTOR_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
        for (const [connectorId, files] of Object.entries(mcp_store)) {
          if (!CONNECTOR_ID_RE.test(connectorId)) {
            log.warn(`[Deploy] Rejected mcp_store connectorId "${connectorId}" — invalid format`);
            continue;
          }
          const connPath = path.resolve(connectorDir, connectorId);
          // Defense-in-depth: connPath must still be inside connectorDir.
          if (!connPath.startsWith(path.resolve(connectorDir) + path.sep)) {
            log.warn(`[Deploy] Rejected mcp_store connectorId "${connectorId}" — escapes connectorDir`);
            continue;
          }
          fs.mkdirSync(connPath, { recursive: true });

          for (const file of files) {
            // file.path is user-controlled; must stay inside connPath.
            // Reject absolute paths, "..", or any payload that resolves outside.
            if (typeof file?.path !== 'string' || !file.path) {
              log.warn(`[Deploy] Skipping file with missing path in connector "${connectorId}"`);
              continue;
            }
            if (file.path.includes('\0') || path.isAbsolute(file.path)) {
              log.warn(`[Deploy] Rejected file path "${file.path}" — absolute or null byte`);
              continue;
            }
            const filePath = path.resolve(connPath, file.path);
            if (!filePath.startsWith(connPath + path.sep)) {
              log.warn(`[Deploy] Rejected file path "${file.path}" — escapes connector dir`);
              continue;
            }
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

      // Deploy solution-level config (bootstrap_tools, exclude_bootstrap_tools)
      if (solution.bootstrap_tools || solution.exclude_bootstrap_tools) {
        try {
          log.info(`[Deploy] Deploying solution config...`);
          await adasCore.deploySolutionConfig({
            bootstrap_tools: solution.bootstrap_tools,
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

      // Deploy skills in parallel — 9 skills × 15s sequential = 135s, parallel = ~15s
      // skipGuard:true — route-level guard already ran (above).
      const skillsToDeploy = skills.filter(s => savedSkills.includes(s.id));
      log.info(`[Deploy] Deploying ${skillsToDeploy.length} skill(s) in parallel...`);
      const deployedSkills = await Promise.all(
        skillsToDeploy.map(async (skill) => {
          try {
            log.info(`[Deploy] Deploying skill "${skill.id}" to A-Team Core...`);
            const result = await deploySkillToADAS(solution.id, skill.id, log, undefined, { skipGuard: true });
            log.info(`[Deploy] Skill "${skill.id}" deployed successfully`);
            return { id: skill.id, status: 'deployed', result };
          } catch (err) {
            log.error(`[Deploy] Failed to deploy skill "${skill.id}": ${err.message}`);
            return { id: skill.id, status: 'failed', error: err.message };
          }
        })
      );

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

      // Rollback: restore previous solution if we had one
      if (previousSolution) {
        try {
          await solutionsStore.save(previousSolution);
          log.info(`[Deploy] Rolled back solution "${solution.id}" to previous state`);
        } catch (rollbackErr) {
          log.error(`[Deploy] Rollback failed: ${rollbackErr.message}`);
        }
      }

      return res.status(500).json({
        ok: false,
        error: 'Deployment to A-Team Core failed',
        details: err.message,
        solution_id: solution.id,
        skills_deployed: 0
      });
    }
    }); // end gitSync.txn

  } catch (err) {
    req.app.locals.log.error(`[Deploy] Unexpected error: ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Internal server error', details: err.message });
  }
});

/**
 * GET /api/deploy/verify/:solutionId
 *
 * Read-only consistency probe. Returns the same drift report the pre-deploy
 * guard uses. Useful for:
 *   - debugging deploy-time DRIFT_DETECTED 409s without re-running the deploy
 *   - operator dashboards / CI checks
 *   - verifying boot sync did its job after a restart
 *
 * Never writes anything. Cheap (~1 GH list + N file reads + N FS reads).
 */
router.get('/verify/:solutionId', async (req, res, next) => {
  try {
    const log = req.app.locals.log;
    const { solutionId } = req.params;
    if (!solutionId) {
      return res.status(400).json({ ok: false, error: 'solutionId required' });
    }

    const consistency = await verifyConsistency(solutionId);
    return res.json({
      ok: true,
      solution_id: solutionId,
      mode: (process.env.GITSYNC_DEPLOY_GUARD || 'warn').toLowerCase(),
      consistent: consistency.ok,
      ...(consistency.skipped && { skipped: true, reason: consistency.reason }),
      drifts: consistency.drifts || [],
    });
  } catch (err) {
    req.app.locals.log.error(`[Verify] /verify/${req.params.solutionId} failed: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
