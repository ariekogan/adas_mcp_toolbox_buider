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
 *
 * Returns `{ plugins: [...], reason: "ok" }` on success.
 * Returns `{ plugins: [], reason: "no_ui_listPlugins" }` ONLY when the
 *   connector legitimately doesn't expose the tool (tool-not-found error).
 *   This is a legitimate skip, not an error.
 *
 * Any other failure (network, parse, malformed payload) THROWS. The deploy
 * should fail loudly — partial plugin discovery is worse than no discovery
 * because the UI loses plugins silently.
 */
async function fetchPluginsForConnector(connectorId) {
  let result;
  try {
    result = await adasCore.callConnectorTool(connectorId, "ui.listPlugins", {});
  } catch (err) {
    const msg = err?.message || String(err);
    // Legitimate skip: connector doesn't implement the tool
    if (/Unknown tool|not found|method not found/i.test(msg)) {
      return { plugins: [], reason: "no_ui_listPlugins" };
    }
    // All other errors propagate — the deploy must fail visibly
    throw new Error(`ui.listPlugins call to connector "${connectorId}" failed: ${msg}`);
  }
  if (!result) {
    throw new Error(`ui.listPlugins on "${connectorId}" returned empty/null result`);
  }
  // Detect MCP-protocol error responses (per MCP spec: result with
  // isError:true, or text content starting with "MCP error" which is
  // how some Core bridges relay tool-call errors). Tool-not-found is a
  // legitimate skip — connector simply doesn't expose ui.listPlugins.
  if (result?.isError === true || result?.content?.[0]?.isError === true) {
    const errText = result?.content?.[0]?.text || "MCP error";
    if (/Unknown tool|not found|method not found|Method not found|-32601/i.test(errText)) {
      return { plugins: [], reason: "no_ui_listPlugins" };
    }
    throw new Error(`ui.listPlugins on "${connectorId}" returned MCP error: ${errText}`);
  }

  // Normalize across MCP response shapes
  let plugins = null;
  if (Array.isArray(result.plugins)) {
    plugins = result.plugins;
  } else if (Array.isArray(result?.content)) {
    const textBlock = result.content.find(c => c?.type === "text" && c.text);
    if (textBlock) {
      // Text block starting with "MCP error" is a wrapped tool-call
      // error (no isError flag set, just an error string). Treat as
      // legitimate skip if it's a method-not-found variant.
      const t = textBlock.text.trim();
      if (t.startsWith("MCP error")) {
        if (/Unknown tool|not found|method not found|-32601/i.test(t)) {
          return { plugins: [], reason: "no_ui_listPlugins" };
        }
        throw new Error(`ui.listPlugins on "${connectorId}" returned MCP error: ${t}`);
      }
      // Otherwise treat as JSON payload — JSON.parse errors propagate
      // (malformed MCP response is a bug worth surfacing).
      const parsed = JSON.parse(t);
      // Connector explicitly said "not available right now" (e.g. not
      // authenticated, not connected). Treat as legitimate skip — the
      // connector exists but has 0 plugins to surface in this state.
      // When the user authenticates, the next redeploy will pick them up.
      // NOTE: ideally the connector's ui.listPlugins would return its
      // static plugin manifest unconditionally (plugin metadata is not
      // a runtime concern), but some connectors gate this on auth.
      // That's a connector-side bug to fix separately.
      if (parsed && parsed.ok === false) {
        return { plugins: [], reason: `connector_not_ready: ${parsed.error || "unspecified"}` };
      }
      plugins = Array.isArray(parsed?.plugins) ? parsed.plugins
              : Array.isArray(parsed)          ? parsed
              : null;
    }
  } else if (Array.isArray(result)) {
    plugins = result;
  }
  if (!Array.isArray(plugins)) {
    throw new Error(`ui.listPlugins on "${connectorId}" returned unrecognized shape — expected {plugins:[...]} or array, got ${JSON.stringify(result).slice(0, 200)}`);
  }
  const indexEntries = plugins.filter(p => p && (p.id || p.name));

  // For each plugin in the index, fetch the FULL manifest via ui.getPlugin.
  // ui.listPlugins returns just {id, name, version, description, [uiActions]};
  // ui.getPlugin returns {render, surface, capabilities, channels, commands,
  // ...} — the fields runtime needs to actually mount the plugin in the UI.
  // Per CLAUDE.md: ui_capable:true MCPs implement both. Two roundtrips per
  // plugin is acceptable at deploy time (cached in solution.ui_plugins[]).
  const normalized = [];
  for (const idx of indexEntries) {
    const qualifiedPrefix = `mcp:${connectorId}:`;
    let pid = idx.id || idx.name;
    if (!pid.startsWith("mcp:")) pid = qualifiedPrefix + pid;

    let manifest = {};
    try {
      const detail = await adasCore.callConnectorTool(connectorId, "ui.getPlugin", { id: idx.id || idx.name });
      // Same response-shape handling as ui.listPlugins
      if (detail?.content?.[0]?.text) {
        const t = detail.content[0].text.trim();
        if (!t.startsWith("MCP error")) {
          const parsed = JSON.parse(t);
          if (parsed && parsed.ok !== false && !parsed.error) {
            manifest = parsed;
          }
        }
      } else if (detail && typeof detail === "object") {
        manifest = detail;
      }
    } catch (err) {
      // ui.getPlugin failure: same legitimate-skip rule as listPlugins
      const msg = err?.message || String(err);
      if (!/Unknown tool|not found|method not found|-32601/i.test(msg)) {
        throw new Error(`ui.getPlugin("${idx.id || idx.name}") on "${connectorId}" failed: ${msg}`);
      }
      // Tool not found → fall through with just the index entry
    }

    // Merge index + manifest. Then sanitize known-broken fields before the
    // result lands in solution.ui_plugins.
    const merged = {
      ...idx,
      ...manifest,
      id: pid,
      _source: "mcp_introspection",
      _connector_id: connectorId,
    };

    // Sanitize: strip render.reactNative.bundleUrl. The platform serves bundles
    // at /api/ui-plugins/<id>/bundle.js; the host derives that URL via the
    // default convention. A connector-injected bundleUrl (typically using
    // URL-encoded colons that don't match Core's route table) makes the mobile
    // bundle fetch 404 and silently fall back to the iframe WebView — the bug
    // pattern that bit ada's coach plugins on 2026-05-15. Strip and warn so
    // the connector author sees it in deploy logs.
    if (merged?.render?.reactNative?.bundleUrl) {
      const badUrl = merged.render.reactNative.bundleUrl;
      delete merged.render.reactNative.bundleUrl;
      console.warn(
        `[pluginDiscovery] stripped render.reactNative.bundleUrl="${badUrl}" ` +
        `from plugin "${pid}" (connector "${connectorId}"). The platform serves ` +
        `bundles via the default route; connector-injected URLs cause silent ` +
        `iframe-WebView fallback on mobile. Remove bundleUrl from this plugin's ` +
        `ui.getPlugin response.`
      );
    }

    normalized.push(merged);
  }
  return { plugins: normalized, reason: "ok" };
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
