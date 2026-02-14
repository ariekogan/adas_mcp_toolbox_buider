import skillsStore from "../store/skills.js";
import solutionsStore from "../store/solutions.js";
import { getAllPrebuiltConnectors } from "../routes/connectors.js";
import { generateMCPSimple } from "./mcpGenerationAgent.js";
import { syncConnectorToADAS, startConnectorInADAS } from "./adasConnectorSync.js";
import { buildConnectorPayload } from "../utils/connectorPayload.js";
import { compileUiPlugins } from "../utils/skillFieldHelpers.js";
import adasCore from "./adasCoreClient.js";

/**
 * Helper to get skillSlug from skill
 * ADAS Core requires: /^[a-z0-9]+(-[a-z0-9]+)*$/
 */
export function getSkillSlug(skill, skillId) {
  let slug;

  if (skill.name) {
    slug = skill.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  } else if (skill.original_skill_id) {
    slug = skill.original_skill_id.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  } else {
    slug = skillId.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  // Final cleanup
  return slug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
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

  // Generate a valid skillSlug
  let skillSlug;

  if (skill.name) {
    skillSlug = skill.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  } else if (skill.original_skill_id) {
    skillSlug = skill.original_skill_id.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  } else {
    skillSlug = skillId.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  // Final validation
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillSlug)) {
    log.warn(`[MCP Deploy] Generated skillSlug "${skillSlug}" may be invalid, sanitizing...`);
    skillSlug = skillSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

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

    for (const connectorId of linkedConnectors) {
      const connector = allConnectors[connectorId];
      if (!connector) {
        connectorResults.push({ id: connectorId, ok: false, error: 'unknown connector' });
        continue;
      }
      try {
        await syncConnectorToADAS(buildConnectorPayload({ id: connectorId, ...connector }));
        const startResult = await startConnectorInADAS(connectorId);
        const toolCount = startResult?.tools?.length || 0;
        log.info(`[MCP Deploy] Connector "${connectorId}" started: ${toolCount} tools`);
        connectorResults.push({ id: connectorId, ok: true, tools: toolCount });
      } catch (err) {
        log.warn(`[MCP Deploy] Connector "${connectorId}" failed: ${err.message}`);
        connectorResults.push({ id: connectorId, ok: false, error: err.message });
      }
    }
  }

  return {
    ok: true, status: 'deployed', skillSlug,
    mcpUri: result.mcpUri, port: result.port, connectorId: result.connectorId,
    connectors: connectorResults, adasResponse: result,
    message: `Skill "${skillSlug}" deployed to ADAS Core and running!`
  };
}
