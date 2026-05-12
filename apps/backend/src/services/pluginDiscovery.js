/**
 * pluginDiscovery.js — Phase 5 of §20 v2.3 schema strip (2026-05-12 REWRITE).
 *
 * AUTHORITATIVE DESIGN PRINCIPLE: plugins are owned by the MCPs that serve them.
 * The MCP's `ui.listPlugins` tool is the source of truth — NOT filesystem layout.
 *
 * Why this matters:
 *   - MCP knows its own version, surface, uiActions, capabilities, exact name.
 *   - FS scan only knows folder names → over-discovers (same plugin slug in
 *     multiple connector folders becomes N distinct plugin IDs) and misses
 *     MCP-internal fields.
 *   - Runtime `cp.listContextPlugins` deliberately skips lazy connectors to
 *     preserve lazy-spawn. Result: lazy MCPs never get queried unless their
 *     plugins are declared at solution-level — which is exactly the
 *     boilerplate the strip is meant to eliminate.
 *
 * The mechanism:
 *   1. At deploy time, for each connector in skill.connectors[] across the
 *      solution, call Core's POST /api/connectors/:id/call with tool
 *      "ui.listPlugins". Core will spawn the connector (even if lazy),
 *      execute the call, and return the result.
 *   2. Connectors that don't implement ui.listPlugins return an error →
 *      contribute zero plugins (this is correct: a non-UI connector has none).
 *   3. Dedup across connectors by plugin id. The id is already fully
 *      qualified (`mcp:<connector-id>:<plugin-name>`) so collisions only
 *      occur if two connectors both claim the same plugin — last write wins.
 *   4. Write result into solution.ui_plugins[]. Core's cp.listContextPlugins
 *      reads from there at runtime — fast, no lazy-spawn perf hit.
 *
 * REPLACE wins: an explicit author-written solution.ui_plugins[] is preserved.
 *
 * Skip rules:
 *   - Solution has no connectors → no-op.
 *   - Connector unavailable → log, skip.
 *   - ui.listPlugins returns malformed payload → log, skip.
 */

import adasCore from "./adasCoreClient.js";

/**
 * Call ui.listPlugins on a single connector via Core's bridge.
 * Returns array of plugin manifests; empty on any failure.
 */
async function fetchPluginsForConnector(connectorId) {
  try {
    const result = await adasCore.callConnectorTool(connectorId, "ui.listPlugins", {});
    if (!result) return { plugins: [], reason: "empty_result" };
    // ui.listPlugins typically returns { content: [{ type: "text", text: "<json>" }] }
    // or { plugins: [...] } depending on MCP convention. Handle both.
    let plugins = null;
    if (Array.isArray(result.plugins)) {
      plugins = result.plugins;
    } else if (Array.isArray(result?.content)) {
      // MCP text-response shape — pluck the JSON
      const textBlock = result.content.find(c => c?.type === "text" && c.text);
      if (textBlock) {
        try {
          const parsed = JSON.parse(textBlock.text);
          plugins = Array.isArray(parsed?.plugins) ? parsed.plugins
                  : Array.isArray(parsed)          ? parsed
                  : null;
        } catch (parseErr) {
          return { plugins: [], reason: `parse_error: ${parseErr.message}` };
        }
      }
    } else if (Array.isArray(result)) {
      plugins = result;
    }
    if (!Array.isArray(plugins)) return { plugins: [], reason: "unrecognized_shape" };
    // Normalize: ensure plugin.id is fully qualified
    const normalized = plugins.filter(p => p && (p.id || p.name)).map(p => {
      const pid = p.id || `mcp:${connectorId}:${p.name}`;
      return {
        ...p,
        id: pid,
        _source: "mcp_introspection",
        _connector_id: connectorId,
      };
    });
    return { plugins: normalized, reason: "ok" };
  } catch (err) {
    const msg = err?.message || String(err);
    // Tool-not-found = connector legitimately doesn't expose plugins
    if (/Unknown tool|not found|method not found/i.test(msg)) {
      return { plugins: [], reason: "no_ui_listPlugins" };
    }
    return { plugins: [], reason: `error: ${msg}` };
  }
}

/**
 * Walk solution + skill connectors, call ui.listPlugins on each, return
 * the deduped union of all returned plugins.
 *
 * @param {Object} solution                solution object (read connectors from skills + platform_connectors)
 * @param {Array}  skills                  worker skill objects
 * @returns {Promise<{ plugins, summary }>}
 */
export async function discoverPluginsViaIntrospection(solution, skills) {
  const summary = { connectors_queried: 0, connectors_with_plugins: 0, total_plugins: 0, per_connector: [] };

  // Collect unique connector IDs used by this solution
  const connectorIds = new Set();
  if (Array.isArray(solution?.platform_connectors)) {
    for (const c of solution.platform_connectors) connectorIds.add(c?.id || c);
  }
  if (Array.isArray(skills)) {
    for (const sk of skills) {
      if (Array.isArray(sk?.connectors)) {
        for (const c of sk.connectors) connectorIds.add(typeof c === "string" ? c : c?.id);
      }
    }
  }
  // Drop falsy / system connectors
  const targets = [...connectorIds].filter(id => id && !["handoff-controller-mcp"].includes(id));

  const pluginMap = new Map(); // id → plugin (last write wins, but we log conflicts)
  const conflicts = [];

  for (const connId of targets) {
    summary.connectors_queried++;
    const { plugins, reason } = await fetchPluginsForConnector(connId);
    summary.per_connector.push({ connector_id: connId, count: plugins.length, reason });
    if (plugins.length > 0) summary.connectors_with_plugins++;
    for (const p of plugins) {
      if (!p?.id) continue;
      if (pluginMap.has(p.id)) {
        conflicts.push({ id: p.id, kept_from: pluginMap.get(p.id)._connector_id, dropped_from: p._connector_id });
        // Keep first writer (deterministic), don't overwrite
        continue;
      }
      pluginMap.set(p.id, p);
    }
  }
  summary.total_plugins = pluginMap.size;
  summary.conflicts = conflicts;
  return { plugins: [...pluginMap.values()], summary };
}

/**
 * Back-compat shim. Old callers passed mcpStoreRoot for FS-scan. The new
 * implementation needs solution + skills. If only mcpStoreRoot is passed
 * (legacy call site), return empty — the deploy pipeline will call the
 * new function directly instead.
 *
 * @deprecated Use discoverPluginsViaIntrospection(solution, skills) instead.
 */
export function discoverPluginsForSolution(_mcpStoreRoot) {
  // Intentionally empty — legacy FS-scan was the wrong design.
  // Real call lives in routes/deploy.js, which now uses introspection.
  return [];
}

export default {
  discoverPluginsViaIntrospection,
  discoverPluginsForSolution,
};
