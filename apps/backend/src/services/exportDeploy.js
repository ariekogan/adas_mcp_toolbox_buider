import skillsStore from "../store/skills.js";
import solutionsStore from "../store/solutions.js";
import { getAllPrebuiltConnectors } from "../routes/connectors.js";
import { generateMCPSimple } from "./mcpGenerationAgent.js";
import { syncConnectorToADAS, startConnectorInADAS, stopConnectorInADAS, uploadMcpCodeToADAS } from "./adasConnectorSync.js";
import { buildConnectorPayload } from "../utils/connectorPayload.js";
import { compileUiPlugins } from "../utils/skillFieldHelpers.js";
import adasCore from "./adasCoreClient.js";

/**
 * Helper to get skillSlug from skill.
 * Since skill.id IS the canonical slug (no prefix, no remapping), just return it.
 * ADAS Core requires: /^[a-z0-9]+(-[a-z0-9]+)*$/
 */
export function getSkillSlug(skill, skillId) {
  const raw = skill.id || skillId;
  // Safety: lowercase + sanitize to match ADAS Core format
  const slug = raw.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // Fallback if skill.id sanitized to empty (degenerate case)
  return slug || (skillId !== raw ? getSkillSlug({}, skillId) : "untitled");
}

/**
 * Deploy the solution-level identity config to ADAS Core.
 * Pushes actor_types, admin_roles, default_actor_type, default_roles
 * to ADAS Core's POST /api/identity endpoint.
 *
 * @param {string} solutionId - Solution ID
 * @param {object} log - Logger (console-compatible)
 * @returns {Promise<object>} Deploy result { ok, skipped?, error? }
 */
export async function deployIdentityToADAS(solutionId, log) {
  try {
    const solution = await solutionsStore.load(solutionId);
    const identity = solution?.identity;

    if (!identity || !identity.actor_types || identity.actor_types.length === 0) {
      log.info(`[Identity Deploy] No identity config defined for solution ${solutionId}, skipping`);
      return { ok: true, skipped: true, reason: 'no_identity_config' };
    }

    log.info(`[Identity Deploy] Pushing identity config to ADAS Core (${identity.actor_types.length} actor types)`);

    const result = await adasCore.deployIdentity({
      actor_types: identity.actor_types,
      admin_roles: identity.admin_roles || [],
      default_actor_type: identity.default_actor_type || '',
      default_roles: identity.default_roles || [],
    });

    log.info(`[Identity Deploy] Successfully deployed: ${result.actor_types?.length || 0} actor types, ${result.admin_roles?.length || 0} admin roles`);
    return { ok: true, ...result };

  } catch (err) {
    log.error(`[Identity Deploy] Failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Deploy a skill MCP to ADAS Core (shared logic used by both the HTTP route and deploy-all).
 * Reads the generated MCP files, sends to ADAS Core, and syncs linked connectors.
 *
 * @param {string} solutionId - Solution ID
 * @param {string} skillId - Skill ID to deploy
 * @param {object} log - Logger (console-compatible)
 * @returns {Promise<object>} Deploy result
 */
export async function deploySkillToADAS(solutionId, skillId, log, onProgress) {
  const skill = await skillsStore.load(solutionId, skillId);
  let version = skill.version;

  if (!version) {
    throw Object.assign(new Error('No MCP export found'), { code: 'NO_EXPORT' });
  }

  log.info(`[MCP Deploy] Starting deploy for ${skillId} (version ${version})`);

  // Phase 0: Deploy solution-level identity config (actor types, roles)
  if (solutionId) {
    try {
      if (onProgress) onProgress('deploying_identity', 'Deploying identity config...');
      const identityResult = await deployIdentityToADAS(solutionId, log);
      if (!identityResult.ok && !identityResult.skipped) {
        log.warn(`[MCP Deploy] Identity deploy failed (non-fatal): ${identityResult.error}`);
      }
    } catch (err) {
      log.warn(`[MCP Deploy] Identity deploy error (non-fatal): ${err.message}`);
    }
  }

  const exportPath = await skillsStore.getExportPath(solutionId, skillId, version);
  const fs = await import('fs/promises');
  const path = await import('path');
  let files = await fs.readdir(exportPath);
  let serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');

  // Auto-generate MCP if server.py is missing
  if (!serverFile) {
    log.info(`[MCP Deploy] No server.py in export for ${skillId} — auto-generating MCP`);
    if (onProgress) onProgress('generating_mcp', 'Generating MCP...');

    try {
      const genFiles = await generateMCPSimple(skill);
      const fileList = Object.entries(genFiles).map(([name, content]) => ({ name, content }));
      await skillsStore.saveExport(solutionId, skillId, version, fileList);

      skill.phase = "EXPORTED";
      skill.lastExportedAt = new Date().toISOString();
      skill.lastExportType = "mcp-simple";
      await skillsStore.save(skill);

      log.info(`[MCP Deploy] Auto-generated MCP for ${skillId}: ${fileList.map(f => f.name).join(', ')}`);

      // Re-read after generation
      files = await fs.readdir(exportPath);
      serverFile = files.find(f => f === 'server.py' || f === 'mcp_server.py');
    } catch (genErr) {
      log.error(`[MCP Deploy] MCP generation failed for ${skillId}: ${genErr.message}`);
      throw Object.assign(new Error(`MCP generation failed: ${genErr.message}`), { code: 'GEN_FAILED' });
    }
  }

  if (!serverFile) {
    throw Object.assign(new Error('No server.py found even after generation'), { code: 'NO_SERVER' });
  }

  if (onProgress) onProgress('deploying', 'Deploying to ADAS...');

  const serverPath = path.join(exportPath, serverFile);
  const mcpServer = await fs.readFile(serverPath, 'utf8');

  let requirements = null;
  try {
    requirements = await fs.readFile(path.join(exportPath, 'requirements.txt'), 'utf8');
  } catch { /* optional */ }

  log.info(`[MCP Deploy] Read MCP files (${mcpServer.length} bytes)`);

  // skill.id IS the slug — no derivation needed
  const skillSlug = getSkillSlug(skill, skillId);

  log.info(`[MCP Deploy] Using skillSlug: "${skillSlug}" (from skill.name: "${skill.name}")`);
  log.info(`[MCP Deploy] Sending to ADAS Core: ${adasCore.getBaseUrl()}/api/skills/deploy-mcp`);

  let result;
  try {
    result = await adasCore.deployMcp(skillSlug, mcpServer, requirements);
  } catch (deployErr) {
    // Enrich error with stderr/stdout from ADAS Core for debugging
    const enriched = Object.assign(
      new Error(deployErr.message || 'MCP deploy failed'),
      { code: 'DEPLOY_FAILED', data: deployErr.data || {} }
    );
    throw enriched;
  }

  // Post-deploy verification: check tool count and get_skill_definition presence
  const deployedToolCount = result.tools ?? null;
  const hasGetSkillDefinition = result.hasGetSkillDefinition ?? false;

  if (deployedToolCount === 0) {
    log.warn(`[MCP Deploy] Skill "${skillSlug}" deployed but has 0 tools — ADAS Core cannot bootstrap this skill!`);
  } else if (!hasGetSkillDefinition) {
    log.warn(`[MCP Deploy] Skill "${skillSlug}" has ${deployedToolCount} tools but MISSING get_skill_definition — ADAS Core cannot load skill config!`);
  } else {
    log.info(`[MCP Deploy] Skill "${skillSlug}" verified: ${deployedToolCount} tools (${(result.toolNames || []).join(', ')}), get_skill_definition: OK`);
  }

  // Surface ADAS Core warnings
  if (result.warnings?.length) {
    for (const w of result.warnings) {
      log.warn(`[MCP Deploy] ADAS Core warning: ${w}`);
    }
  }

  // Register skill definition in ADAS Core so it appears in GET /api/skills
  try {
    const skillDef = {
      id: skillSlug,
      name: skill.name || skillSlug,
      version: skill.version || "1.0.0",
      description: skill.description || "",
      mcp_server: result.mcpUri,
      connectors: (skill.connectors || []),
      tools: (skill.tools || []).map(t => ({
        name: t.name,
        description: t.description || "",
      })),
      // Preserve ui_plugins and ui_capable for Tier-4 virtual tool generation
      ...(skill.ui_plugins ? { ui_plugins: skill.ui_plugins } : {}),
      ...(skill.ui_capable ? { ui_capable: skill.ui_capable } : {}),
      // Preserve full skill config for runtime (prompt, role, policy, etc.)
      ...(skill.problem ? { problem: skill.problem } : {}),
      ...(skill.role ? { role: skill.role } : {}),
      ...(skill.prompt ? { prompt: skill.prompt } : {}),
      ...(skill.policy ? { policy: skill.policy } : {}),
      ...(skill.intents ? { intents: skill.intents } : {}),
      ...(skill.scenarios ? { scenarios: skill.scenarios } : {}),
      ...(skill.engine ? { engine: skill.engine } : {}),
    };

    // Add ui_plugins for agent-to-plugin commands (UI-capable skills)
    const compiledPlugins = compileUiPlugins(skill.ui_plugins);
    if (compiledPlugins) {
      skillDef.ui_plugins = compiledPlugins;
    }

    await adasCore.importSkill(skillSlug, skillDef);
    log.info(`[MCP Deploy] Registered skill definition for "${skillSlug}" in ADAS Core`);
  } catch (err) {
    log.warn(`[MCP Deploy] Skill import warning (non-fatal): ${err.message}`);
  }

  // Update skill status
  skill.phase = "DEPLOYED";
  skill.deployedAt = new Date().toISOString();
  skill.deployedTo = adasCore.getBaseUrl();
  skill.mcpUri = result.mcpUri;
  skill.connectorId = result.connectorId;
  await skillsStore.save(skill);

  log.info(`[MCP Deploy] Successfully deployed! Skill: ${skillSlug}, MCP: ${result.mcpUri}`);

  // Sync linked connectors
  const connectorResults = [];
  const linkedConnectors = skill.connectors || [];

  if (linkedConnectors.length > 0) {
    log.info(`[MCP Deploy] Syncing ${linkedConnectors.length} linked connectors: ${linkedConnectors.join(', ')}`);
    const allConnectors = getAllPrebuiltConnectors();

    // Resolve mcp-store path for connector source code upload.
    // Full deploy writes source code to solution-packs/<name>/mcp-store/<connectorId>/.
    // On redeploy, re-upload so updated source code reaches ADAS Core.
    let mcpStoreBase = null;
    let mcpStagingDir = null;
    try {
      const { getMemoryRoot } = await import('../utils/tenantContext.js');
      const solution = await solutionsStore.load(solutionId);
      const solutionName = solution?.name || solutionId;
      mcpStoreBase = path.join(getMemoryRoot(), 'solution-packs', solutionName, 'mcp-store');
      mcpStagingDir = path.join(getMemoryRoot(), '_mcp_staging');
    } catch {
      // Non-fatal: source code upload is best-effort
    }

    // ── Pre-deploy connector validation ─────────────────────────
    // Check ALL connectors BEFORE deploying any — fail-fast with actionable errors.
    // This prevents partial deploys where some connectors succeed and others fail at runtime.
    const preDeployIssues = [];
    for (const connectorId of linkedConnectors) {
      const connector = allConnectors[connectorId];
      if (!connector) {
        preDeployIssues.push({
          connector: connectorId,
          severity: 'error',
          message: `Connector "${connectorId}" is not registered. Check the connector ID or deploy the connector definition first.`,
        });
        continue;
      }

      // For stdio connectors: verify source code exists (mcp-store or staging)
      const transport = connector.transport || (connector.command ? 'stdio' : 'http');
      if (transport === 'stdio' && mcpStoreBase) {
        const { default: fsSync } = await import('fs');
        const codeDir = path.join(mcpStoreBase, connectorId);
        const stagedDir = mcpStagingDir ? path.join(mcpStagingDir, connectorId) : null;
        const hasCode = fsSync.existsSync(codeDir);
        const hasStaged = stagedDir && fsSync.existsSync(stagedDir);

        if (!hasCode && !hasStaged) {
          preDeployIssues.push({
            connector: connectorId,
            severity: 'warning',
            message: `Stdio connector "${connectorId}" has no source code in mcp-store or staging. ` +
              `It will fail to start on ADAS Core unless the code was previously uploaded. ` +
              `Expected location: solution-packs/<solution>/mcp-store/${connectorId}/`,
          });
        }
      }
    }

    // Log all pre-deploy issues
    for (const issue of preDeployIssues) {
      if (issue.severity === 'error') {
        log.error(`[MCP Deploy] PRE-DEPLOY CHECK: ${issue.message}`);
      } else {
        log.warn(`[MCP Deploy] PRE-DEPLOY CHECK: ${issue.message}`);
      }
    }

    // Abort on blocking errors (unknown connectors)
    const blockingErrors = preDeployIssues.filter(i => i.severity === 'error');
    if (blockingErrors.length > 0) {
      for (const err of blockingErrors) {
        connectorResults.push({ id: err.connector, ok: false, error: err.message });
      }
    }

    for (const connectorId of linkedConnectors) {
      const connector = allConnectors[connectorId];
      if (!connector) {
        // Already reported in pre-deploy check — skip silently
        if (!connectorResults.find(r => r.id === connectorId)) {
          connectorResults.push({ id: connectorId, ok: false, error: 'unknown connector' });
        }
        continue;
      }
      try {
        // Merge pre-staged connector files (from upload_connector_files) into mcp-store.
        // This ensures redeploy picks up files staged via the MCP API, not just deploy-all.
        if (mcpStagingDir && mcpStoreBase) {
          const { default: fsSync } = await import('fs');
          const stagedDir = path.join(mcpStagingDir, connectorId);
          if (fsSync.existsSync(stagedDir)) {
            const targetDir = path.join(mcpStoreBase, connectorId);
            fsSync.mkdirSync(targetDir, { recursive: true });

            const copyRecursive = (src, dest) => {
              let count = 0;
              for (const entry of fsSync.readdirSync(src, { withFileTypes: true })) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                  fsSync.mkdirSync(destPath, { recursive: true });
                  count += copyRecursive(srcPath, destPath);
                } else {
                  fsSync.copyFileSync(srcPath, destPath);
                  count++;
                }
              }
              return count;
            };

            const mergedCount = copyRecursive(stagedDir, targetDir);
            // Clean up staging after successful merge
            fsSync.rmSync(stagedDir, { recursive: true, force: true });
            log.info(`[MCP Deploy] Merged ${mergedCount} pre-staged files for connector "${connectorId}" into mcp-store`);
          }
        }

        // Stop the existing connector before uploading new code.
        // This clears stale stderr/error diagnostics from the previous run,
        // ensuring error messages after redeploy reflect the CURRENT code, not the old one.
        try {
          await stopConnectorInADAS(connectorId);
          log.info(`[MCP Deploy] Stopped existing connector "${connectorId}" before redeploy`);
        } catch {
          // Non-fatal: connector may not be running yet (first deploy)
        }

        // Upload connector source code to ADAS Core mcp-store (if available)
        if (mcpStoreBase) {
          const mcpCodeDir = path.join(mcpStoreBase, connectorId);
          try {
            const { default: fsSync } = await import('fs');
            if (fsSync.existsSync(mcpCodeDir)) {
              await uploadMcpCodeToADAS(connectorId, mcpCodeDir);
              log.info(`[MCP Deploy] Uploaded mcp-store for "${connectorId}"`);
            }
          } catch (uploadErr) {
            log.warn(`[MCP Deploy] mcp-store upload for "${connectorId}" failed (non-fatal): ${uploadErr.message}`);
          }
        }

        const payload = buildConnectorPayload({ id: connectorId, ...connector });
        await syncConnectorToADAS(payload);

        // Pass transport hint so startConnectorInADAS can detect stdio failures
        const startResult = await startConnectorInADAS(connectorId, {
          transport: payload.transport || (connector.command ? 'stdio' : 'http'),
        });
        const toolCount = startResult?.tools?.length || 0;

        // Check if startConnectorInADAS flagged a failure (0 tools on stdio)
        if (startResult?.ok === false) {
          log.warn(`[MCP Deploy] Connector "${connectorId}" FAILED: ${startResult.message}`);
          connectorResults.push({
            id: connectorId,
            ok: false,
            tools: 0,
            error: startResult.error || 'connector_start_failed',
            message: startResult.message,
            diagnostic: startResult.diagnostic || null,
          });
        } else if (startResult?.warning === 'zero_tools') {
          log.warn(`[MCP Deploy] Connector "${connectorId}" WARNING: ${startResult.message}`);
          connectorResults.push({
            id: connectorId,
            ok: true,
            tools: 0,
            warning: startResult.message,
            diagnostic: startResult.diagnostic || null,
          });
        } else {
          log.info(`[MCP Deploy] Connector "${connectorId}" started: ${toolCount} tools`);
          connectorResults.push({ id: connectorId, ok: true, tools: toolCount });
        }
      } catch (err) {
        log.warn(`[MCP Deploy] Connector "${connectorId}" failed: ${err.message}`);
        connectorResults.push({
          id: connectorId,
          ok: false,
          error: err.message,
          diagnostic: err.diagnostic || null,
        });
      }
    }
  }

  // ── Post-deploy verification summary ─────────────────────────
  // Produce a clear summary of deployment health for the AI agent developer
  const failedConnectors = connectorResults.filter(c => !c.ok);
  const zeroToolConnectors = connectorResults.filter(c => c.ok && c.tools === 0);
  const healthyConnectors = connectorResults.filter(c => c.ok && c.tools > 0);

  if (failedConnectors.length > 0) {
    log.error(`[MCP Deploy] ⚠ POST-DEPLOY: ${failedConnectors.length}/${connectorResults.length} connector(s) FAILED:`);
    for (const c of failedConnectors) {
      log.error(`[MCP Deploy]   - ${c.id}: ${c.error || 'unknown error'}`);
    }
  }
  if (zeroToolConnectors.length > 0) {
    log.warn(`[MCP Deploy] ⚠ POST-DEPLOY: ${zeroToolConnectors.length} connector(s) started with 0 tools (may still be initializing):`);
    for (const c of zeroToolConnectors) {
      log.warn(`[MCP Deploy]   - ${c.id}: ${c.warning || 'zero tools'}`);
    }
  }
  if (healthyConnectors.length > 0) {
    const totalTools = healthyConnectors.reduce((sum, c) => sum + c.tools, 0);
    log.info(`[MCP Deploy] ✓ POST-DEPLOY: ${healthyConnectors.length}/${connectorResults.length} connector(s) healthy (${totalTools} total tools)`);
  }

  // Build post-deploy verification report
  const verification = {
    skill_deployed: true,
    skill_tools: deployedToolCount,
    has_get_skill_definition: hasGetSkillDefinition,
    connectors_total: connectorResults.length,
    connectors_healthy: healthyConnectors.length,
    connectors_failed: failedConnectors.length,
    connectors_zero_tools: zeroToolConnectors.length,
  };

  // Flag if the overall deploy has issues that need attention
  if (failedConnectors.length > 0 || !hasGetSkillDefinition || deployedToolCount === 0) {
    verification.needs_attention = true;
    verification.issues = [];
    if (deployedToolCount === 0) verification.issues.push('Skill has 0 tools — cannot execute');
    if (!hasGetSkillDefinition) verification.issues.push('Missing get_skill_definition — ADAS Core cannot load skill config');
    for (const c of failedConnectors) {
      verification.issues.push(`Connector "${c.id}" failed: ${c.error}`);
    }
  }

  return {
    ok: true, status: 'deployed', skillSlug,
    mcpUri: result.mcpUri, port: result.port, connectorId: result.connectorId,
    tools: deployedToolCount,
    toolNames: result.toolNames || [],
    hasGetSkillDefinition,
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    connectors: connectorResults, adasResponse: result,
    verification,
    message: `Skill "${skillSlug}" deployed to ADAS Core and running!`
  };
}
