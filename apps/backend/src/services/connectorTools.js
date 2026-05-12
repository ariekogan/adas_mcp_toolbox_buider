/**
 * connectorTools.js — Phase 2b of §20 v2.3 schema strip.
 *
 * Auto-import tool bridge declarations from running connectors at deploy
 * time. Eliminates the per-skill `tools[]` boilerplate (~30% additional
 * JSON reduction on top of Phases 0-9, gets us closer to the irreducible
 * author content: persona + handoff_when + policy).
 *
 * The mechanism:
 *   1. At deploy time, for each connector listed in skill.connectors[],
 *      call Core's GET /api/connectors/:id/tools to fetch the live
 *      tool schemas (name + description + inputSchema).
 *   2. Build a tool bridge entry per tool:
 *        {
 *          name: "<tool-name>",
 *          description: "<tool-description>",
 *          source: { type: "mcp_bridge", connection_id, mcp_tool },
 *        }
 *   3. Apply Phase 2 security classification on top (toolSecurityClassifier).
 *   4. Inject into skill.tools[] before deploy.
 *
 * REPLACE semantics: only fires when skill.tools[] is empty/missing. An
 * explicit author-written tools[] is preserved (mobile-pa case).
 *
 * Skip rules:
 *   - skill.tools[] is non-empty → REPLACE wins, no auto-import.
 *   - Connector unavailable / not in CONNECTED state → log, fall through.
 *   - Connector returns empty tools → no-op for that connector.
 *
 * Author overrides:
 *   - `skill.excluded_tools[]` (glob patterns) — drop matching auto-imported
 *     tools before they ship. Handled by Phase 2's applyExclusions.
 *   - `skill.included_tools_only[]` (NEW, optional) — when set, ONLY include
 *     tools matching these patterns. Useful for skills that share a
 *     connector but only want a subset of its tools.
 */

import adasCore from "./adasCoreClient.js";

/**
 * Fetch the tool list for one connector from Core.
 * Returns [] if connector unavailable or not connected.
 */
async function fetchConnectorTools(connectorId) {
  try {
    // adasCoreClient already handles tenant headers + auth
    const res = await adasCore.fetchCore(`/api/connectors/${encodeURIComponent(connectorId)}/tools`);
    if (!res || !res.ok) {
      return { tools: [], reason: res?.error || "unknown_error" };
    }
    // Core returns { ok, connected, tools: [name...], toolSchemas: [{name, description, inputSchema}, ...] }
    if (!res.connected) {
      return { tools: [], reason: "connector_not_connected" };
    }
    const toolSchemas = Array.isArray(res.toolSchemas) ? res.toolSchemas : [];
    return { tools: toolSchemas, reason: "ok" };
  } catch (err) {
    return { tools: [], reason: `fetch_error: ${err.message}` };
  }
}

/**
 * Auto-import tools for one skill. Mutates skill.tools[] in place ONLY
 * when it's currently empty (REPLACE semantics).
 *
 * @param {Object} skill              skill object (mutated in place when applicable)
 * @returns {Promise<{ imported: number, skipped_reason?: string, connectors_queried: number, summary: Array }>}
 */
export async function autoImportToolsForSkill(skill) {
  if (!skill || typeof skill !== "object") {
    return { imported: 0, skipped_reason: "not_object", connectors_queried: 0, summary: [] };
  }

  // REPLACE: explicit non-empty tools[] preserved.
  if (Array.isArray(skill.tools) && skill.tools.length > 0) {
    return { imported: 0, skipped_reason: "explicit_tools", connectors_queried: 0, summary: [] };
  }

  const connectors = Array.isArray(skill.connectors) ? skill.connectors : [];
  if (connectors.length === 0) {
    return { imported: 0, skipped_reason: "no_connectors", connectors_queried: 0, summary: [] };
  }

  const tools = [];
  const summary = [];

  for (const connId of connectors) {
    const { tools: connTools, reason } = await fetchConnectorTools(connId);
    summary.push({ connector_id: connId, tools_count: connTools.length, reason });

    for (const t of connTools) {
      if (!t || !t.name) continue;
      const bridge = {
        name: t.name,
        description: t.description || "",
        source: {
          type: "mcp_bridge",
          connection_id: connId,
          mcp_tool: t.name,
        },
        _auto_imported: true,
      };
      // Preserve input schema info if Core provided it (advisory; Builder
      // historically ships only name + description to keep planner prompts compact)
      if (t.inputSchema && typeof t.inputSchema === "object") {
        bridge.inputSchema = t.inputSchema;
      }
      tools.push(bridge);
    }
  }

  if (tools.length === 0) {
    return {
      imported: 0,
      skipped_reason: "no_tools_returned",
      connectors_queried: connectors.length,
      summary,
    };
  }

  // Apply included_tools_only filter if author opted in
  let finalTools = tools;
  if (Array.isArray(skill.included_tools_only) && skill.included_tools_only.length > 0) {
    const regexes = skill.included_tools_only.map(p => {
      const escaped = String(p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      try { return new RegExp(`^${escaped}$`, "i"); } catch { return null; }
    }).filter(Boolean);
    finalTools = tools.filter(t => regexes.some(r => r.test(t.name)));
  }

  // Dedup by name (in case the same tool somehow gets imported twice)
  const seen = new Set();
  const deduped = finalTools.filter(t => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  skill.tools = deduped;
  return {
    imported: deduped.length,
    connectors_queried: connectors.length,
    summary,
  };
}

export default { autoImportToolsForSkill };
