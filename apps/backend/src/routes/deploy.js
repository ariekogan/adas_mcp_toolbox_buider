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
import { deploySkillToADAS, deployIdentityToADAS, preSyncConnectors } from '../services/exportDeploy.js';
import adasCore from '../services/adasCoreClient.js';
import gitSync, { verifyConsistency } from '../services/gitSync.js';
import { enrichPluginList } from '../services/uiActionsAutoDefaults.js';
import { discoverPluginsViaIntrospection } from '../services/pluginDiscovery.js';
import { generateOrchestratorIfNeeded } from '../services/builtinOrchestrator.js';
import { getMemoryRoot } from '../utils/tenantContext.js';
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

  // verifyConsistency errors propagate. A broken guard is worse than a
  // missing one — the operator must see and fix it instead of guessing
  // that the deploy was "checked".
  const consistency = await verifyConsistency(solutionId);

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

    // ── A1.UA — uiActions auto-defaults (§20 of UI_ACTIONS_DESIGN.md) ────
    //
    // For each plugin without an explicit `uiActions` block, synthesize a
    // sensible default at deploy time so the Reply Polisher can offer chips
    // for it. Explicit blocks (REPLACE semantics) are NEVER overwritten.
    // The synthesized block carries `_autoGenerated: true` so dashboards
    // can distinguish authored vs synthesized.
    //
    // Applied to BOTH solution-level ui_plugins[] and each skill's ui_plugins[].
    // Plugins returned at runtime by a connector's ui.getPlugin handler are
    // NOT touched here — those need either author update or a Core-side
    // fetch-time hook (out of scope for this layer).
    // ── Phase 5 of §20 strip: plugin discovery via MCP introspection ──
    // Errors propagate — a deploy with broken plugin discovery should
    // fail loudly. If a connector legitimately doesn't expose
    // ui.listPlugins, fetchPluginsForConnector returns 0 plugins for it
    // (correct: non-UI connector has no plugins) without throwing.
    //
    // Re-introspection policy (2026-05-15):
    //   Previously this only ran when solution.ui_plugins was empty — so once
    //   an old manifest landed, it stuck. ada's surface-block-missing bug went
    //   undetected for a day because of this caching behavior. Now we
    //   re-introspect on every deploy and MERGE: hand-authored solution-level
    //   plugin fields take precedence over connector-supplied fields, so
    //   ateam_patch(target:"solution",ui_plugins:...) edits never get clobbered.
    //   Connector-only fields (render, capabilities, channels, commands) get
    //   refreshed every deploy. Force-disable via solution._skip_introspection.
    const skipReintrospect = solution._skip_introspection === true;
    if (!skipReintrospect) {
      const { plugins: discovered, summary } = await discoverPluginsViaIntrospection(solution, skills);
      if (discovered.length > 0) {
        const existing = Array.isArray(solution.ui_plugins) ? solution.ui_plugins : [];
        const existingById = new Map(existing.map(p => [p.id, p]));
        // Merge: connector fields are base, hand-authored fields layer on top.
        // Hand-authored = anything that's NOT _source:"mcp_introspection" OR
        // any field explicitly set by ateam_patch (we detect via _hand_authored
        // marker, falling back to "treat ALL fields on a non-introspection
        // plugin as hand-authored").
        const merged = discovered.map(disc => {
          const prev = existingById.get(disc.id);
          if (!prev) return disc;  // fresh from introspection
          const prevWasHand = prev._source !== 'mcp_introspection';
          return prevWasHand
            ? { ...disc, ...prev, _source: prev._source }  // hand-authored wins
            : { ...prev, ...disc };  // both auto: latest introspection wins
        });
        // Also keep any hand-authored plugins that introspection didn't return
        // (e.g. plugins for connectors that are temporarily offline).
        const discoveredIds = new Set(discovered.map(p => p.id));
        for (const e of existing) {
          if (!discoveredIds.has(e.id) && e._source !== 'mcp_introspection') {
            merged.push(e);
          }
        }
        solution.ui_plugins = merged;
        log.info(`[Deploy] Plugin introspection: ${discovered.length} discovered / ${merged.length} total (${summary.connectors_with_plugins}/${summary.connectors_queried} connectors${summary.conflicts.length > 0 ? `, ${summary.conflicts.length} id conflicts deduped` : ''}): ${merged.map(p => p.id).join(', ')}`);
      } else {
        log.info(`[Deploy] Plugin introspection: 0 plugins from ${summary.connectors_queried} connectors. Per-connector: ${summary.per_connector.map(c => `${c.connector_id}(${c.reason})`).join(', ')}`);
      }
    }

    if (Array.isArray(solution.ui_plugins) && solution.ui_plugins.length > 0) {
      const r = enrichPluginList(solution.ui_plugins);
      solution.ui_plugins = r.plugins;
      if (r.summary.synthesized.length > 0) {
        log.info(`[Deploy] Auto-generated uiActions for ${r.summary.synthesized.length} solution-level plugin(s): ${r.summary.synthesized.map(s => `${s.id}[${s.intents.join('+')}]`).join(', ')}`);
      }
      if (r.summary.skipped.length > 0) {
        const interesting = r.summary.skipped.filter(s => s.reason !== 'explicit_uiActions');
        if (interesting.length > 0) {
          log.info(`[Deploy] Skipped uiActions auto-default for ${interesting.length} plugin(s): ${interesting.map(s => `${s.id}(${s.reason})`).join(', ')}`);
        }
      }
    }
    if (Array.isArray(skills)) {
      for (const skill of skills) {
        if (!Array.isArray(skill?.ui_plugins) || skill.ui_plugins.length === 0) continue;
        const r = enrichPluginList(skill.ui_plugins);
        skill.ui_plugins = r.plugins;
        if (r.summary.synthesized.length > 0) {
          log.info(`[Deploy] Auto-generated uiActions for ${r.summary.synthesized.length} plugin(s) in skill "${skill.id}": ${r.summary.synthesized.map(s => `${s.id}[${s.intents.join('+')}]`).join(', ')}`);
        }
      }
    }

    // ── Phase 6 of §20 strip: built-in orchestrator generation ──
    // When solution.routing_mode === "auto", generate an _orchestrator
    // skill from sibling worker skills' descriptions + handoff_when fields.
    // Generated skill is injected into the skills[] array so it gets
    // deployed like any other skill. REPLACE wins: mobile-pa has neither
    // routing_mode:"auto" nor a need for this — generation skipped.
    {
      // Phase 6 errors propagate — a routing_mode:auto solution that
      // failed to generate an orchestrator ships without a routing layer.
      const orchResult = await generateOrchestratorIfNeeded(solution, skills);
      // Drop stale auto-generated orchestrators. Detection is marker-based
      // (skill._auto_generated === true AND role_type === "orchestrator"
      // AND id !== currentORCH_ID) — author-written skills are NEVER touched
      // regardless of their id. Core 404 on delete = already gone, fine.
      // Any other delete failure aborts the deploy.
      const staleIds = orchResult.stale_orchestrator_ids || [];
      for (const staleId of staleIds) {
        const { default: skillsStoreLocal } = await import('../store/skills.js');
        await adasCore.deleteSkill(staleId);  // returns ok on 404, throws on real error
        await skillsStoreLocal.remove(solution.id, staleId);
        log.info(`[Deploy] Dropped stale auto-orchestrator "${staleId}" (replaced by current ORCH_ID)`);
        // Drop from in-memory skills array so deploy loop ignores it
        const idx = skills.findIndex(s => s?.id === staleId);
        if (idx >= 0) skills.splice(idx, 1);
        if (Array.isArray(solution.linked_skills)) {
          solution.linked_skills = solution.linked_skills.filter(s => s !== staleId);
        }
      }
      if (orchResult.generated) {
        // Insert orchestrator skill at the front of the skills array
        skills.unshift(orchResult.orchestrator);
        // Add to solution.linked_skills if not already there
        if (!Array.isArray(solution.linked_skills)) solution.linked_skills = [];
        if (!solution.linked_skills.includes(orchResult.orchestrator.id)) {
          solution.linked_skills.unshift(orchResult.orchestrator.id);
        }
        // Merge auto-generated handoffs into solution.handoffs[]
        if (!Array.isArray(solution.handoffs)) solution.handoffs = [];
        const existingHandoffIds = new Set(solution.handoffs.map(h => h.id));
        for (const h of orchResult.handoffs) {
          if (!existingHandoffIds.has(h.id)) solution.handoffs.push(h);
        }
        // Set routing channels to point at the generated orchestrator
        if (!solution.routing || typeof solution.routing !== 'object') solution.routing = {};
        for (const ch of ['voice', 'chat', 'api']) {
          if (!solution.routing[ch] || !solution.routing[ch].default_skill) {
            solution.routing[ch] = {
              default_skill: orchResult.orchestrator.id,
              description: `Auto-routed via generated orchestrator`,
            };
          }
        }
        const hs = orchResult.handoff_synthesis || {};
        log.info(`[Deploy] Generated built-in orchestrator "${orchResult.orchestrator.id}" with ${orchResult.handoffs.length} handoff(s); handoff_when synthesis: ${hs.synthesized || 0} new, ${hs.cached || 0} cached, ${hs.skipped || 0} skipped (explicit), ${hs.failures || 0} failures`);
      } else if (orchResult.reason !== 'routing_mode_not_auto' && orchResult.reason !== 'orchestrator_role_already_declared') {
        // Informative log only for unusual skip reasons (not the common mobile-pa case)
        log.info(`[Deploy] Orchestrator generation skipped: ${orchResult.reason}`);
      }
    }

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

    // Step 3: Save connector source code (mcp_store) if provided.
    //
    // Writes go to TWO destinations:
    //   (a) <TENANTS_ROOT>/connectors/<id>/<file>   — cross-tenant shared dir
    //       (back-compat path; some legacy code reads from here)
    //   (b) <memoryRoot>/solution-packs/<solName>/mcp-store/<id>/<file>
    //       — the per-tenant solution-pack mcp-store. exportDeploy.js's
    //       deploySkillToADAS reads from here when uploading to Core. If we
    //       skip this write, mcpStoreBase keeps stale content from a prior
    //       build and the next redeploy ships those stale bytes to Core,
    //       silently regressing what the user just pulled (the rn-bundle
    //       regression bug — DEPLOYER_BUNDLE_REGRESSION_HANDOFF.md).
    if (Object.keys(mcp_store).length > 0) {
      try {
        log.info(`[Deploy] Saving connector source code from mcp_store...`);
        const connectorDir = path.join(process.env.TENANTS_ROOT || '/memory', 'connectors');
        if (!fs.existsSync(connectorDir)) {
          fs.mkdirSync(connectorDir, { recursive: true });
        }

        // Resolve the per-tenant solution-pack mcp-store base. mcpStoreBase is
        // <memoryRoot>/solution-packs/<solution.name>/mcp-store/. Best-effort:
        // if we can't load the solution name (very early first deploy), we
        // skip the secondary write and let the primary cross-tenant write
        // serve as the only source.
        let mcpStoreBase = null;
        try {
          const { getMemoryRoot } = await import('../utils/tenantContext.js');
          const stored = await solutionsStore.load(solution.id);
          const solutionName = stored?.name || solution.name || solution.id;
          mcpStoreBase = path.join(getMemoryRoot(), 'solution-packs', solutionName, 'mcp-store');
          fs.mkdirSync(mcpStoreBase, { recursive: true });
        } catch {
          mcpStoreBase = null;
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

          // Mirror destination (per-tenant solution-pack mcp-store) — only
          // computed if mcpStoreBase resolved. Same path-validation rules
          // applied independently per destination.
          const mirrorPath = mcpStoreBase ? path.resolve(mcpStoreBase, connectorId) : null;
          if (mirrorPath) {
            if (!mirrorPath.startsWith(path.resolve(mcpStoreBase) + path.sep)) {
              log.warn(`[Deploy] Skipping mcpStoreBase mirror for "${connectorId}" — escapes mcpStoreBase`);
            } else {
              fs.mkdirSync(mirrorPath, { recursive: true });
            }
          }

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

            // Mirror to per-tenant solution-pack mcp-store. Same validation
            // applied to the mirror path.
            if (mirrorPath && mirrorPath.startsWith(path.resolve(mcpStoreBase) + path.sep)) {
              const mirrorFilePath = path.resolve(mirrorPath, file.path);
              if (mirrorFilePath.startsWith(mirrorPath + path.sep)) {
                fs.mkdirSync(path.dirname(mirrorFilePath), { recursive: true });
                fs.writeFileSync(mirrorFilePath, file.content, 'utf-8');
              }
            }
          }
          log.info(`[Deploy] Saved ${files.length} file(s) for connector "${connectorId}"${mirrorPath ? ' (cross-tenant + solution-pack)' : ' (cross-tenant only)'}`);
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
      // Errors propagate — connector upload/sync/start failures all
      // ship a broken runtime. Per-connector try/catch was the kind of
      // swallow that hid Phase 2b regressions all day.
      log.info(`[Deploy] Uploading source code for connector "${connId}" to ADAS Core...`);
      await adasCore.uploadMcpCode(connId, files);
      log.info(`[Deploy] Source code uploaded for "${connId}"`);

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

      // Stop old process before starting with new code. "Not running"
      // is the legitimate prior-state we tolerate; other errors propagate.
      try {
        await adasCore.stopConnector(connId);
      } catch (e) {
        if (!/not running|not found|404/i.test(e.message || "")) throw e;
      }

      const startResult = await adasCore.startConnector(connId);
      const toolCount = startResult?.tools?.length || 0;
      connectorResults.push({ id: connId, ok: toolCount > 0, tools: toolCount });
      log.info(`[Deploy] Connector "${connId}" started (${toolCount} tools)`);
    }

    // Step 4: Deploy to ADAS Core
    try {
      log.info(`[Deploy] Deploying to A-Team Core...`);

      // Deploy identity
      log.info(`[Deploy] Deploying solution identity...`);
      const identityResult = await deployIdentityToADAS(solution.id, log);
      log.info(`[Deploy] Identity deployed`, identityResult);

      // Deploy solution-level config (bootstrap_tools, exclude_bootstrap_tools).
      // Errors propagate — wrong/missing bootstrap config = wrong skill
      // initialization at runtime.
      if (solution.bootstrap_tools || solution.exclude_bootstrap_tools) {
        log.info(`[Deploy] Deploying solution config...`);
        await adasCore.deploySolutionConfig({
          bootstrap_tools: solution.bootstrap_tools,
          exclude_bootstrap_tools: solution.exclude_bootstrap_tools,
        });
        log.info(`[Deploy] Solution config deployed`);
      }

      // Deploy UI plugins. Errors propagate — UI plugins not pushed to
      // Core means the UI can't render the panels even though the
      // solution doc says they exist.
      let uiPluginResult = null;
      if (solution.ui_plugins && solution.ui_plugins.length > 0) {
        log.info(`[Deploy] Deploying ${solution.ui_plugins.length} UI plugin(s) to Core...`);
        uiPluginResult = await adasCore.deployUiPlugins(solution.ui_plugins, { solutionId: solution.id });
        log.info(`[Deploy] UI plugins deployed: ${uiPluginResult.count || solution.ui_plugins.length} plugin(s)`);
      }

      // Pre-sync connectors ONCE for the whole deploy.
      //
      // Why this happens BEFORE the parallel skill loop, not inside it:
      //   Each skill's connector list is a subset of solution.connectors. With
      //   N skills sharing M connectors (avg 6× shared on ada), running the
      //   per-skill connector-sync block under Promise.all caused the SAME
      //   connector to be Stop+Upload+Restart'd M times concurrently — a race
      //   condition that crashed `personal-assistant-ui-mcp` mid-deploy with
      //   `ENOENT: uv_cwd` because one upload deleted the working directory
      //   out from under another's running process. Also wasted 3-5 min per
      //   deploy thrashing connectors that didn't need to change.
      //
      //   Pre-sync the DEDUPLICATED union once (serial, fast — most are
      //   already healthy with matching source hash), then skip per-skill
      //   connector sync below.
      const skillsToDeploy = skills.filter(s => savedSkills.includes(s.id));
      const uniqueConnectorIds = Array.from(new Set(
        skillsToDeploy.flatMap(s => s.connectors || [])
      ));
      if (uniqueConnectorIds.length > 0) {
        log.info(`[Deploy] Pre-syncing ${uniqueConnectorIds.length} unique connector(s) before parallel skill deploys`);
        await preSyncConnectors(solution.id, uniqueConnectorIds, log);
      }

      // Deploy skills in parallel — 9 skills × 15s sequential = 135s, parallel = ~15s
      // skipGuard:true — route-level guard already ran (above).
      // skipConnectorSync:true — pre-sync above handled connectors once for the
      // whole deploy; running it again per-skill would re-introduce the race.
      log.info(`[Deploy] Deploying ${skillsToDeploy.length} skill(s) in parallel...`);
      const deployedSkills = await Promise.all(
        skillsToDeploy.map(async (skill) => {
          try {
            log.info(`[Deploy] Deploying skill "${skill.id}" to A-Team Core...`);
            const result = await deploySkillToADAS(solution.id, skill.id, log, undefined, { skipGuard: true, skipConnectorSync: true });
            log.info(`[Deploy] Skill "${skill.id}" deployed successfully`);
            return { id: skill.id, status: 'deployed', result };
          } catch (err) {
            log.error(`[Deploy] Failed to deploy skill "${skill.id}": ${err.message}`);
            return { id: skill.id, status: 'failed', error: err.message };
          }
        })
      );

      log.info(`[Deploy] Deployment complete. ${deployedSkills.filter(s => s.status === 'deployed').length}/${deployedSkills.length} skills deployed`);

      // Note (§20 v2.2 architecture): Tier 2 uiActions for connector-returned
      // plugins (those NOT in solution.ui_plugins[]) is synthesized lazily by
      // Core at runtime on first chat that needs them — NOT here. Builder
      // owns Tier 1 only (heuristic enrichment of declared plugins, applied
      // above before save). See docs/UI_ACTIONS_DESIGN.md §20.

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
