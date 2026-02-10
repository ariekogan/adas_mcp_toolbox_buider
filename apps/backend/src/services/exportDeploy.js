import skillsStore from "../store/skills.js";
import solutionsStore from "../store/solutions.js";
import { getAllPrebuiltConnectors } from "../routes/connectors.js";
import { generateMCPSimple } from "./mcpGenerationAgent.js";
import { syncConnectorToADAS, startConnectorInADAS } from "./adasConnectorSync.js";

/**
 * Helper to get skillSlug from skill
 * ADAS Core requires: /^[a-z0-9]+(-[a-z0-9]+)*$/
 */
export function getSkillSlug(skill, skillId) {
  let slug;

  if (skill.name) {
    // Slugify the skill name: "Identity Assurance Manager" -> "identity-assurance-manager"
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
    const solution = await solutionsStore.get(solutionId);
    const identity = solution?.identity;

    if (!identity || !identity.actor_types || identity.actor_types.length === 0) {
      log.info(`[Identity Deploy] No identity config defined for solution ${solutionId}, skipping`);
      return { ok: true, skipped: true, reason: 'no_identity_config' };
    }

    const adasUrl = process.env.ADAS_CORE_URL || "http://ai-dev-assistant-backend-1:4000";
    const identityUrl = `${adasUrl}/api/identity`;
    const tenant = (process.env.SB_TENANT || 'main').trim().toLowerCase();

    log.info(`[Identity Deploy] Pushing identity config to ADAS Core: ${identityUrl} (${identity.actor_types.length} actor types)`);

    const response = await fetch(identityUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ADAS-TENANT": tenant },
      body: JSON.stringify({
        actor_types: identity.actor_types,
        admin_roles: identity.admin_roles || [],
        default_actor_type: identity.default_actor_type || '',
        default_roles: identity.default_roles || [],
      }),
      signal: AbortSignal.timeout(15000),
    });

    const result = await response.json();

    if (!response.ok) {
      log.error(`[Identity Deploy] ADAS Core rejected identity config: ${JSON.stringify(result)}`);
      return { ok: false, error: result.error || `HTTP ${response.status}` };
    }

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

  // Generate a valid skillSlug (lowercase alphanumeric with hyphens only)
  // ADAS Core requires: /^[a-z0-9]+(-[a-z0-9]+)*$/
  // Examples: "identity-assurance-manager", "customer-support-tier-1"
  // NOT: "dom_260534ac" (has underscore), "dom-260534ac" (fine but ugly)

  // Priority 1: Use skill.name slugified (most readable)
  // Priority 2: Use original_skill_id if set (from imported solutions)
  // Priority 3: Convert skillId (dom_xxx -> dom-xxx) as last resort
  let skillSlug;

  if (skill.name) {
    // Slugify the skill name: "Identity Assurance Manager" -> "identity-assurance-manager"
    skillSlug = skill.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")  // Replace non-alphanumeric with hyphens
      .replace(/-+/g, "-")          // Collapse multiple hyphens
      .replace(/^-|-$/g, "");       // Trim leading/trailing hyphens
  } else if (skill.original_skill_id) {
    // Use imported skill ID (already should be valid)
    skillSlug = skill.original_skill_id.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  } else {
    // Last resort: convert skillId (dom_260534ac -> dom-260534ac)
    skillSlug = skillId.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  // Final validation: ensure it matches ADAS Core requirements
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillSlug)) {
    log.warn(`[MCP Deploy] Generated skillSlug "${skillSlug}" may be invalid, sanitizing...`);
    skillSlug = skillSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  log.info(`[MCP Deploy] Using skillSlug: "${skillSlug}" (from skill.name: "${skill.name}")`);

  const adasUrl = process.env.ADAS_CORE_URL || "http://ai-dev-assistant-backend-1:4000";
  const deployUrl = `${adasUrl}/api/skills/deploy-mcp`;

  log.info(`[MCP Deploy] Sending to ADAS Core: ${deployUrl}`);

  const tenant = (process.env.SB_TENANT || 'main').trim().toLowerCase();
  const response = await fetch(deployUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ADAS-TENANT": tenant },
    body: JSON.stringify({ skillSlug, mcpServer, requirements }),
    signal: AbortSignal.timeout(120000) // 2 min timeout
  });

  const result = await response.json();

  if (!response.ok) {
    log.error(`[MCP Deploy] ADAS Core deployment failed: ${JSON.stringify(result)}`);
    throw new Error(result.error || `Deploy failed: ${response.status}`);
  }

  // Update skill status
  skill.phase = "DEPLOYED";
  skill.deployedAt = new Date().toISOString();
  skill.deployedTo = adasUrl;
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
        const isStdio = connector.transport === 'stdio' || connector.command;
        // For stdio connectors with mcp-store code, use /mcp-store/ path
        // (the original args from the catalog point to bare "server.js")
        const stdioCfg = isStdio ? {
          command: connector.command,
          args: connector.args || [],
          env: connector.envDefaults || connector.env || {}
        } : undefined;
        // If connector has mcp_store code, OR if args is just "server.js" (no path),
        // use the /mcp-store/ path so ADAS Core can find the code
        if (stdioCfg) {
          const hasBarePath = stdioCfg.args?.length === 1 && !stdioCfg.args[0].includes('/');
          if (connector.mcp_store_included || hasBarePath) {
            stdioCfg.args = [`/mcp-store/${connectorId}/server.js`];
          }
        }
        await syncConnectorToADAS({
          id: connectorId, name: connector.name, type: 'mcp',
          transport: isStdio ? 'stdio' : 'http', endpoint: connector.endpoint,
          config: stdioCfg,
          credentials: {}
        });
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
