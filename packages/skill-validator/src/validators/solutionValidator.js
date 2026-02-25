/**
 * Solution Validator
 *
 * Validates cross-skill contracts in a solution definition.
 * Checks grant economy, handoff chains, routing coverage,
 * and security contracts.
 *
 * @module validators/solutionValidator
 */

/**
 * Validate a solution definition
 * @param {Object} solution - Solution object
 * @param {Object} [context] - Optional deployment context for deeper validation
 * @param {Array}  [context.skills] - Full skill definitions (with tools)
 * @param {Array}  [context.connectors] - Connector definitions from the deploy payload
 * @param {Object} [context.mcp_store] - MCP store code map (connector_id → code)
 * @returns {Object} Validation result with errors and warnings
 */
export function validateSolution(solution, context) {
  const errors = [];
  const warnings = [];

  const identity = solution.identity || {};
  const skills = solution.skills || [];
  const grants = solution.grants || [];
  const handoffs = solution.handoffs || [];
  const routing = solution.routing || {};
  const platformConnectors = solution.platform_connectors || [];
  const securityContracts = solution.security_contracts || [];

  const skillIds = new Set(skills.map(s => s.id));

  // ─── 0. Identity configuration ─────────────────────────────
  const actorTypes = identity.actor_types || [];
  const actorTypeKeys = new Set(actorTypes.map(a => a.key));

  if (actorTypes.length === 0) {
    warnings.push({
      check: 'identity_actor_types',
      message: 'No actor types defined. Define the user types for your solution in the Identity tab.',
    });
  }

  if (!(identity.admin_roles || []).length && actorTypes.length > 0) {
    warnings.push({
      check: 'identity_admin_roles',
      message: 'No admin roles defined. Consider setting which actor types have admin privileges.',
    });
  }

  if (identity.default_actor_type && actorTypeKeys.size > 0 && !actorTypeKeys.has(identity.default_actor_type)) {
    errors.push({
      check: 'identity_default_type_valid',
      message: `Default actor type "${identity.default_actor_type}" is not a defined actor type`,
    });
  }

  for (const role of (identity.admin_roles || [])) {
    if (actorTypeKeys.size > 0 && !actorTypeKeys.has(role)) {
      warnings.push({
        check: 'identity_admin_role_valid',
        message: `Admin role "${role}" is not a defined actor type`,
      });
    }
  }

  // ─── 1. Grant provider exists ──────────────────────────────
  // Every consumed grant must have at least one issuer
  for (const grant of grants) {
    if (grant.internal) continue; // Internal grants don't need consumers

    // Check issuers exist
    for (const issuerId of (grant.issued_by || [])) {
      if (!skillIds.has(issuerId)) {
        errors.push({
          check: 'grant_provider_exists',
          message: `Grant "${grant.key}" references issuer "${issuerId}" which is not a skill in this solution`,
          grant: grant.key,
          skill: issuerId,
        });
      }
    }

    // Check consumers exist
    for (const consumerId of (grant.consumed_by || [])) {
      if (!skillIds.has(consumerId)) {
        errors.push({
          check: 'grant_consumer_exists',
          message: `Grant "${grant.key}" references consumer "${consumerId}" which is not a skill in this solution`,
          grant: grant.key,
          skill: consumerId,
        });
      }
    }

    // Check that consumed grants have at least one issuer
    if ((grant.consumed_by || []).length > 0 && (grant.issued_by || []).length === 0) {
      errors.push({
        check: 'grant_provider_missing',
        message: `Grant "${grant.key}" is consumed by ${grant.consumed_by.join(', ')} but has no issuer`,
        grant: grant.key,
      });
    }
  }

  // ─── 2. Handoff targets exist ──────────────────────────────
  for (const handoff of handoffs) {
    if (!skillIds.has(handoff.from)) {
      errors.push({
        check: 'handoff_source_exists',
        message: `Handoff "${handoff.id}" references source skill "${handoff.from}" which doesn't exist`,
        handoff: handoff.id,
        skill: handoff.from,
      });
    }
    if (!skillIds.has(handoff.to)) {
      errors.push({
        check: 'handoff_target_exists',
        message: `Handoff "${handoff.id}" references target skill "${handoff.to}" which doesn't exist`,
        handoff: handoff.id,
        skill: handoff.to,
      });
    }
  }

  // ─── 3. Grants passed match consumer requirements ──────────
  // For each security contract, check if the handoff chain passes the needed grants
  for (const contract of securityContracts) {
    if (!skillIds.has(contract.consumer)) {
      errors.push({
        check: 'contract_consumer_exists',
        message: `Security contract "${contract.name}" references consumer "${contract.consumer}" which doesn't exist`,
        contract: contract.name,
      });
      continue;
    }

    if (contract.provider && !skillIds.has(contract.provider)) {
      errors.push({
        check: 'contract_provider_exists',
        message: `Security contract "${contract.name}" references provider "${contract.provider}" which doesn't exist`,
        contract: contract.name,
      });
      continue;
    }

    // Check that a handoff path exists from provider to consumer
    if (contract.provider) {
      const handoffPath = findHandoffPath(handoffs, contract.provider, contract.consumer);
      if (!handoffPath) {
        warnings.push({
          check: 'contract_handoff_path',
          message: `Security contract "${contract.name}": no handoff path from "${contract.provider}" to "${contract.consumer}"`,
          contract: contract.name,
        });
      } else {
        // Check that required grants are passed along the handoff chain
        for (const requiredGrant of (contract.requires_grants || [])) {
          const allPassed = handoffPath.every(h =>
            (h.grants_passed || []).includes(requiredGrant)
          );
          if (!allPassed) {
            errors.push({
              check: 'grants_passed_match',
              message: `Security contract "${contract.name}": grant "${requiredGrant}" is not passed through all handoffs from "${contract.provider}" to "${contract.consumer}"`,
              contract: contract.name,
              grant: requiredGrant,
            });
          }
        }
      }
    }
  }

  // ─── 4. Routing covers channels ────────────────────────────
  for (const skill of skills) {
    if (skill.entry_channels && skill.entry_channels.length > 0) {
      for (const channel of skill.entry_channels) {
        if (!routing[channel]) {
          warnings.push({
            check: 'routing_covers_channels',
            message: `Skill "${skill.id}" declares entry channel "${channel}" but no routing rule exists for it`,
            skill: skill.id,
            channel,
          });
        }
      }
    }
  }

  // Check that routing targets exist
  for (const [channel, config] of Object.entries(routing)) {
    if (config.default_skill && !skillIds.has(config.default_skill)) {
      errors.push({
        check: 'routing_target_exists',
        message: `Routing for channel "${channel}" targets skill "${config.default_skill}" which doesn't exist`,
        channel,
        skill: config.default_skill,
      });
    }
  }

  // ─── 5. Platform connectors available ──────────────────────
  const declaredConnectors = new Set(platformConnectors.map(c => c.id));
  for (const handoff of handoffs) {
    if (handoff.mechanism && handoff.mechanism !== 'internal-message') {
      if (!declaredConnectors.has(handoff.mechanism)) {
        warnings.push({
          check: 'platform_connectors_declared',
          message: `Handoff "${handoff.id}" uses mechanism "${handoff.mechanism}" which is not declared in platform_connectors`,
          handoff: handoff.id,
          connector: handoff.mechanism,
        });
      }
    }
  }

  // ─── 6. No orphan skills ──────────────────────────────────
  // Every skill should be reachable via routing or as a handoff target
  const routedSkills = new Set(
    Object.values(routing).map(r => r.default_skill).filter(Boolean)
  );
  const handoffTargets = new Set(handoffs.map(h => h.to));
  const handoffSources = new Set(handoffs.map(h => h.from));
  const reachableSkills = new Set([...routedSkills, ...handoffTargets, ...handoffSources]);

  for (const skill of skills) {
    if (!reachableSkills.has(skill.id)) {
      warnings.push({
        check: 'no_orphan_skills',
        message: `Skill "${skill.id}" is not reachable via routing or handoffs`,
        skill: skill.id,
      });
    }
  }

  // ─── 7. Circular handoff detection ─────────────────────────
  const cycles = detectCycles(handoffs);
  for (const cycle of cycles) {
    errors.push({
      check: 'circular_handoffs',
      message: `Circular handoff chain detected: ${cycle.join(' → ')}`,
      cycle,
    });
  }

  // ─── 8. Connector binding validation ──────────────────────
  // When full skill definitions and connector list are provided,
  // check that mcp_bridge tools reference declared connectors
  // and that stdio connectors have server code in mcp_store.
  if (context) {
    const fullSkills = context.skills || [];
    const connectors = context.connectors || [];
    const mcpStore = context.mcp_store || {};
    const connectorIds = new Set(connectors.map(c => c.id));

    // Check mcp_bridge tools reference declared connectors
    for (const skill of fullSkills) {
      for (const tool of (skill.tools || [])) {
        if (tool.source?.type === 'mcp_bridge' && tool.source.connection_id) {
          if (!connectorIds.has(tool.source.connection_id)) {
            errors.push({
              check: 'mcp_bridge_connector_exists',
              message: `Tool "${tool.name}" in skill "${skill.name || skill.id}" references connector "${tool.source.connection_id}" which is not in the connectors array`,
              skill: skill.id,
              tool: tool.name,
              connector: tool.source.connection_id,
            });
          }
        }
      }
    }

    // Check stdio connectors have server code when mcp_store is expected
    for (const connector of connectors) {
      const transport = connector.transport || 'stdio';
      if (transport === 'stdio' && !mcpStore[connector.id]) {
        errors.push({
          check: 'connector_code_available',
          message: `Connector "${connector.id}" has no server code. Provide the business logic (API calls, DB queries, etc.) in mcp_store.${connector.id} — the deploy pipeline will auto-wrap it into a working MCP server. Without this, the connector will fail to start on ADAS Core.`,
          connector: connector.id,
          fix: `Add mcp_store: { "${connector.id}": [{ path: "server.js", content: "..." }] } to your deploy payload. Write only the tool implementations — the MCP server scaffolding is generated automatically. See GET /spec/examples/connector for a working template.`,
        });
      }
    }

    // ─── 8b. Connector mcp_store deep validation ──────────────
    // Catch common deployment failures: missing package.json, wrong paths,
    // missing dependencies, deprecated paths.
    for (const connector of connectors) {
      const storeFiles = mcpStore[connector.id];
      if (!storeFiles || !Array.isArray(storeFiles)) continue;

      const filePaths = storeFiles.map(f => f.path);
      const serverFile = storeFiles.find(f =>
        f.path === 'server.js' || f.path === 'index.js' || f.path === 'server.ts'
      );
      const pkgFile = storeFiles.find(f => f.path === 'package.json');
      const serverCode = serverFile?.content || '';

      // 8b-1: Detect require() or import calls that need npm dependencies
      const NODE_BUILTINS = new Set(['fs', 'path', 'http', 'https', 'crypto', 'url', 'os', 'util', 'stream', 'events', 'child_process', 'net', 'tls', 'dns', 'querystring', 'readline', 'assert', 'buffer', 'zlib', 'worker_threads', 'cluster', 'dgram', 'perf_hooks', 'async_hooks', 'v8', 'vm', 'module', 'timers', 'console', 'process', 'string_decoder', 'punycode']);
      const baseName = (mod) => mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];

      const requireMatches = serverCode.match(/require\s*\(\s*['"]([^./][^'"]*)['"]\s*\)/g) || [];
      const importMatches = serverCode.match(/from\s+['"]([^./][^'"]*)['"]/g) || [];

      // Extract and filter to only external (non-builtin) modules
      const reqModules = requireMatches.map(m => m.match(/['"]([^'"]+)['"]/)?.[1]).filter(Boolean);
      const impModules = importMatches.map(m => m.match(/['"]([^'"]+)['"]/)?.[1]).filter(Boolean);
      const allModules = [...new Set([...reqModules, ...impModules])];
      const externalModules = allModules.filter(m => !NODE_BUILTINS.has(baseName(m)));
      const hasExternalDeps = externalModules.length > 0;

      if (hasExternalDeps && !pkgFile) {
        const depList = externalModules.slice(0, 5).join(', ');

        errors.push({
          check: 'connector_missing_package_json',
          message: `Connector "${connector.id}" server code requires npm packages (${depList}) but no package.json was included in mcp_store. Without it, npm install cannot run and the connector will crash at startup with MODULE_NOT_FOUND.`,
          connector: connector.id,
          fix: `Add a package.json to mcp_store.${connector.id} with the required dependencies: { "name": "${connector.id}", "dependencies": { ${externalModules.slice(0, 5).map(m => `"${baseName(m)}": "*"`).join(', ')} } }`,
        });
      }

      // 8b-2: If package.json exists, check that required modules are in dependencies
      if (hasExternalDeps && pkgFile) {
        try {
          const pkg = JSON.parse(pkgFile.content);
          const declaredDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          const missingDeps = externalModules
            .map(baseName)
            .filter(mod => !declaredDeps[mod]);

          if (missingDeps.length > 0) {
            warnings.push({
              check: 'connector_missing_dependencies',
              message: `Connector "${connector.id}" server code requires ${missingDeps.join(', ')} but ${missingDeps.length === 1 ? "it's" : "they're"} not in package.json dependencies. The connector may crash at startup.`,
              connector: connector.id,
              fix: `Add to package.json dependencies: ${missingDeps.map(m => `"${m}": "*"`).join(', ')}`,
            });
          }
        } catch { /* malformed package.json — handled elsewhere */ }
      }

      // 8b-3: Detect deprecated /opt/mcp-connectors/ path in explicit args
      const args = connector.args || [];
      for (const arg of args) {
        if (typeof arg === 'string' && arg.includes('/opt/mcp-connectors/')) {
          errors.push({
            check: 'connector_deprecated_path',
            message: `Connector "${connector.id}" uses deprecated path "/opt/mcp-connectors/" in args. This path does not exist on A-Team Core. You can omit command and args entirely — the system auto-detects the entry point from mcp_store files.`,
            connector: connector.id,
            fix: `Remove command and args from the connector definition. The system will auto-resolve them from the uploaded mcp_store files. Or if you need explicit control, use "/mcp-store/${connector.id}/server.js".`,
          });
        }
      }

      // 8b-4: Warn about wrong /mcp-store/ path that doesn't match connector id
      for (const arg of args) {
        if (typeof arg === 'string' && arg.includes('/mcp-store/')) {
          const pathMatch = arg.match(/\/mcp-store\/([^/]+)\//);
          if (pathMatch && pathMatch[1] !== connector.id) {
            warnings.push({
              check: 'connector_path_mismatch',
              message: `Connector "${connector.id}" args reference "/mcp-store/${pathMatch[1]}/" but the connector id is "${connector.id}". Files are stored at /mcp-store/${connector.id}/.`,
              connector: connector.id,
              fix: `Change the path to "/mcp-store/${connector.id}/..." or omit command/args to let the system auto-resolve.`,
            });
          }
        }
      }
    }

    // ─── 9. UI-capable connector validation ──────────────────
    // Connectors with ui_capable: true MUST have ui.listPlugins and ui.getPlugin tools,
    // and their mcp_store server code must return the correct response format.
    const UI_DOC_REF = 'API docs: GET /spec/examples/connector-ui → _ui_tool_response_formats';

    for (const connector of connectors) {
      if (!connector.ui_capable) continue;

      // Check transport is stdio (required for UI-capable connectors)
      const transport = connector.transport || 'stdio';
      if (transport !== 'stdio') {
        errors.push({
          check: 'ui_connector_transport',
          message: `UI-capable connector "${connector.id}" must use transport: "stdio". Got "${transport}".`,
          connector: connector.id,
          docs: UI_DOC_REF,
        });
      }

      // Check mcp_store has server code — scan for ui.listPlugins/ui.getPlugin
      const storeFiles = mcpStore[connector.id];
      if (storeFiles && Array.isArray(storeFiles)) {
        const serverFile = storeFiles.find(f => f.path === 'server.js');
        if (serverFile && serverFile.content) {
          const code = serverFile.content;

          // Must implement ui.listPlugins
          if (!code.includes('ui.listPlugins')) {
            errors.push({
              check: 'ui_connector_listplugins_tool',
              message: `UI-capable connector "${connector.id}" server.js does not implement the "ui.listPlugins" tool. This tool is required for ADAS Core to discover UI plugins.`,
              connector: connector.id,
              fix: 'Implement a "ui.listPlugins" tool that returns { plugins: [{ id, name, version, description }] }.',
              docs: UI_DOC_REF,
            });
          }

          // Must implement ui.getPlugin
          if (!code.includes('ui.getPlugin')) {
            errors.push({
              check: 'ui_connector_getplugin_tool',
              message: `UI-capable connector "${connector.id}" server.js does not implement the "ui.getPlugin" tool. This tool is required for ADAS Core to load plugin manifests.`,
              connector: connector.id,
              fix: 'Implement a "ui.getPlugin" tool that returns { id, name, version, render: { mode: "iframe", iframeUrl }, channels, capabilities }.',
              docs: UI_DOC_REF,
            });
          }

          // Check ui.listPlugins response format — warn if returning bare array instead of { plugins: [...] }
          // Look for patterns like JSON.stringify([{ or JSON.stringify( [ that indicate a bare array response
          const listPluginsMatch = code.match(/['"]ui\.listPlugins['"][\s\S]{0,500}?JSON\.stringify\s*\(\s*\[/);
          if (listPluginsMatch) {
            // Also check it's not wrapped in { plugins: ... }
            const surroundingCode = code.substring(
              Math.max(0, code.indexOf(listPluginsMatch[0]) - 50),
              code.indexOf(listPluginsMatch[0]) + listPluginsMatch[0].length + 200
            );
            if (!surroundingCode.includes('plugins:') && !surroundingCode.includes('"plugins"')) {
              warnings.push({
                check: 'ui_connector_listplugins_format',
                message: `UI-capable connector "${connector.id}": ui.listPlugins appears to return a bare array instead of { plugins: [...] }. ADAS Core expects the response format: { plugins: [{ id, name, version, description }] }.`,
                connector: connector.id,
                fix: 'Change the ui.listPlugins response from JSON.stringify([...]) to JSON.stringify({ plugins: [...] }). See the correct_example and wrong_example in the docs.',
                docs: UI_DOC_REF,
              });
            }
          }

          // Check ui-dist directory exists in mcp_store
          const hasUiDist = storeFiles.some(f => f.path.startsWith('ui-dist/'));
          if (!hasUiDist) {
            warnings.push({
              check: 'ui_connector_dist_files',
              message: `UI-capable connector "${connector.id}" has no ui-dist/ files in mcp_store. The UI plugin HTML/JS/CSS should be in ui-dist/<plugin-id>/<version>/.`,
              connector: connector.id,
              docs: UI_DOC_REF,
            });
          }
        }
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      skills: skills.length,
      grants: grants.length,
      handoffs: handoffs.length,
      channels: Object.keys(routing).length,
      platform_connectors: platformConnectors.length,
      security_contracts: securityContracts.length,
      error_count: errors.length,
      warning_count: warnings.length,
    },
  };
}

/**
 * Find a handoff path from source to target skill
 * @param {Array} handoffs - Handoff definitions
 * @param {string} from - Source skill ID
 * @param {string} to - Target skill ID
 * @returns {Array|null} - Array of handoffs forming the path, or null
 */
function findHandoffPath(handoffs, from, to) {
  // BFS to find path
  const queue = [[from, []]];
  const visited = new Set();

  while (queue.length > 0) {
    const [current, path] = queue.shift();

    if (current === to && path.length > 0) {
      return path;
    }

    if (visited.has(current)) continue;
    visited.add(current);

    for (const handoff of handoffs) {
      if (handoff.from === current) {
        queue.push([handoff.to, [...path, handoff]]);
      }
    }
  }

  return null;
}

/**
 * Detect circular handoff chains
 * @param {Array} handoffs - Handoff definitions
 * @returns {Array<string[]>} - Arrays of skill IDs forming cycles
 */
function detectCycles(handoffs) {
  const cycles = [];
  const graph = new Map();

  // Build adjacency list
  for (const handoff of handoffs) {
    if (!graph.has(handoff.from)) graph.set(handoff.from, []);
    graph.get(handoff.from).push(handoff.to);
  }

  const visited = new Set();
  const inStack = new Set();
  const path = [];

  function dfs(node) {
    if (inStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of (graph.get(node) || [])) {
      dfs(neighbor);
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
}

export default { validateSolution };
