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
 * Auto-import tools for one skill. Mutates skill.tools[] in place.
 *
 * REPLACE semantics (revised 2026-05-12):
 *   - PRESERVE any tool with `_auto_imported !== true` — that's an author-
 *     written explicit tool, never touched.
 *   - REFRESH all auto-imported tools (`_auto_imported === true`) on every
 *     call by re-fetching from connectors. Catches the case where a
 *     connector was unavailable on the previous run and contributed 0
 *     tools — surfaced as the mycoach/nutrition-mcp hang on 2026-05-12.
 *
 * @param {Object} skill              skill object (mutated in place when applicable)
 * @returns {Promise<{ imported: number, refreshed: number, skipped_reason?: string, connectors_queried: number, summary: Array }>}
 */
export async function autoImportToolsForSkill(skill) {
  if (!skill || typeof skill !== "object") {
    return { imported: 0, skipped_reason: "not_object", connectors_queried: 0, summary: [] };
  }

  const existingTools = Array.isArray(skill.tools) ? skill.tools : [];
  const authorWrittenTools = existingTools.filter(t => t && t._auto_imported !== true);
  const previousAutoImported = existingTools.filter(t => t && t._auto_imported === true);
  const wasAllAuthorWritten = authorWrittenTools.length === existingTools.length && existingTools.length > 0;

  // If the existing list is ENTIRELY author-written, preserve it verbatim
  // (this is the mobile-pa path — explicit hand-curated tools[], no
  // auto-import desired). We can't tell author intent from a previously-
  // auto-imported partial result, so we always refresh those.
  if (wasAllAuthorWritten) {
    return { imported: 0, refreshed: 0, skipped_reason: "all_explicit", connectors_queried: 0, summary: [] };
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

  // If NO tools came back at all but we previously had auto-imported ones,
  // this is a transient connector failure — KEEP the previous list and
  // surface the issue rather than wiping the skill.
  if (tools.length === 0) {
    if (previousAutoImported.length > 0) {
      const failing = summary.filter(s => s.reason !== "ok").map(s => `${s.connector_id}(${s.reason})`).join(", ");
      throw new Error(`Phase 2b tool refresh failed for "${skill.id}": all ${connectors.length} connectors returned 0 tools (${failing}). Refusing to wipe previous ${previousAutoImported.length} auto-imported tools — fix connector availability and retry.`);
    }
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

  // Dedup auto-imported tools by name
  const seen = new Set();
  const dedupedAuto = finalTools.filter(t => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  // Merge: author-written tools take precedence by name (REPLACE wins
  // per-tool, not just per-skill).
  const authorNames = new Set(authorWrittenTools.map(t => t.name));
  const autoToKeep = dedupedAuto.filter(t => !authorNames.has(t.name));
  const merged = [...authorWrittenTools, ...autoToKeep];

  // Detect connectors that USED to contribute tools but returned 0 this time
  const prevConns = new Map();  // connector_id → previous tool count
  for (const t of previousAutoImported) {
    const cid = t?.source?.connection_id;
    if (cid) prevConns.set(cid, (prevConns.get(cid) || 0) + 1);
  }
  const newConns = new Map();
  for (const t of autoToKeep) {
    const cid = t?.source?.connection_id;
    if (cid) newConns.set(cid, (newConns.get(cid) || 0) + 1);
  }
  const lostConnectors = [...prevConns.entries()]
    .filter(([cid, _]) => (newConns.get(cid) || 0) === 0)
    .map(([cid, n]) => `${cid} (${n} tools)`);
  if (lostConnectors.length > 0) {
    // Loud: connector(s) that previously had tools now return nothing.
    // This is the mycoach/nutrition-mcp incident class — fail visibly.
    throw new Error(`Phase 2b tool refresh for "${skill.id}": connector(s) that previously contributed tools returned 0 this time — ${lostConnectors.join(", ")}. Refusing to silently drop them. Fix connector availability and retry.`);
  }

  skill.tools = merged;
  return {
    imported: autoToKeep.length,
    refreshed: previousAutoImported.length > 0 ? autoToKeep.length : 0,
    preserved_explicit: authorWrittenTools.length,
    connectors_queried: connectors.length,
    summary,
  };
}

export default { autoImportToolsForSkill };
