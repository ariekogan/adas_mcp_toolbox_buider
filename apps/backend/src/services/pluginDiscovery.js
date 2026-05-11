/**
 * pluginDiscovery.js — Phase 5 of §20 v2.3 schema strip.
 *
 * Auto-discover UI plugins by walking the deployed connector folders.
 * When `solution.ui_plugins[]` is empty/missing, this populates it at
 * deploy time. REPLACE wins: an explicit `solution.ui_plugins[]` is
 * preserved verbatim (mobile-pa path).
 *
 * Convention-based discovery:
 *
 *   <mcp-store-root>/<connector-id>/ui-dist/<plugin-name>/index.html
 *     → iframe plugin, render.mode = "adaptive", iframeUrl
 *
 *   <mcp-store-root>/<connector-id>/plugins/<plugin-name>/index.tsx
 *     → React Native plugin, render.reactNative.component = <plugin-name>
 *
 *   <mcp-store-root>/<connector-id>/{ui-dist,plugins}/<plugin-name>/manifest.json
 *     → optional override manifest. Fields here merge over the
 *       auto-generated defaults (commands, capabilities, surface, etc.).
 *
 * The resolved plugin id is always `mcp:<connector-id>:<plugin-name>` —
 * fully qualified, no collisions possible.
 *
 * mobile-pa-test's solution.ui_plugins[] is fully populated (14 plugins)
 * → discovery is a no-op for it. Stripped solutions can omit the field
 * entirely and get all plugins auto-discovered.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Discover plugins for a single connector by scanning its folders.
 *
 * @param {string} connectorRoot   Absolute path to the connector dir
 *                                 (e.g. ".../mcp-store/personal-assistant-ui-mcp")
 * @param {string} connectorId
 * @returns {Array} list of plugin manifests
 */
export function discoverPluginsForConnector(connectorRoot, connectorId) {
  const out = [];
  if (!connectorRoot || !connectorId) return out;
  if (!fs.existsSync(connectorRoot)) return out;

  // Detect iframe plugins under ui-dist/
  const uiDistDir = path.join(connectorRoot, "ui-dist");
  if (fs.existsSync(uiDistDir) && fs.statSync(uiDistDir).isDirectory()) {
    const entries = fs.readdirSync(uiDistDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const pluginName = e.name;
      // Must contain index.html to be a valid iframe plugin
      const indexHtml = path.join(uiDistDir, pluginName, "index.html");
      if (!fs.existsSync(indexHtml)) continue;
      out.push(buildManifest({
        connectorId,
        pluginName,
        hasIframe: true,
        hasRN: false,
        overridePath: path.join(uiDistDir, pluginName, "manifest.json"),
      }));
    }
  }

  // Detect RN plugins under plugins/
  const pluginsDir = path.join(connectorRoot, "plugins");
  if (fs.existsSync(pluginsDir) && fs.statSync(pluginsDir).isDirectory()) {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const pluginName = e.name;
      // Look for index.tsx / index.ts / index.jsx / index.js
      const candidates = ["index.tsx", "index.ts", "index.jsx", "index.js"];
      const hasIndex = candidates.some(f => fs.existsSync(path.join(pluginsDir, pluginName, f)));
      if (!hasIndex) continue;

      // Check if iframe entry already exists for this plugin name; if so,
      // merge RN render mode into the existing entry rather than creating
      // a duplicate id (e.g., adaptive plugins).
      const id = `mcp:${connectorId}:${pluginName}`;
      const existing = out.find(p => p.id === id);
      if (existing) {
        // Promote to adaptive — both iframe + RN exist
        existing.render = {
          ...existing.render,
          mode: "adaptive",
          reactNative: { component: pluginName },
        };
        continue;
      }

      out.push(buildManifest({
        connectorId,
        pluginName,
        hasIframe: false,
        hasRN: true,
        overridePath: path.join(pluginsDir, pluginName, "manifest.json"),
      }));
    }
  }

  return out;
}

function buildManifest({ connectorId, pluginName, hasIframe, hasRN, overridePath }) {
  const id = `mcp:${connectorId}:${pluginName}`;

  // Default render based on what was found
  const render = { mode: "adaptive" };
  if (hasIframe) render.iframeUrl = `/ui/${pluginName}/index.html`;
  if (hasRN) render.reactNative = { component: pluginName };

  // Default manifest. Sensible minimums.
  let manifest = {
    id,
    name: humanizeName(pluginName),
    version: "1.0.0",
    type: "ui",
    render,
    capabilities: {},
    channels: ["command"],
    commands: [],
    _auto_discovered: true,
  };

  // Merge author overrides if manifest.json exists next to the plugin
  if (overridePath && fs.existsSync(overridePath)) {
    try {
      const override = JSON.parse(fs.readFileSync(overridePath, "utf8"));
      manifest = deepMerge(manifest, override);
      // Re-fix id to the canonical pattern even if override messed it up
      manifest.id = id;
      manifest._auto_discovered = true;
      manifest._has_override = true;
    } catch (err) {
      console.warn(`[pluginDiscovery] failed to parse override at ${overridePath}: ${err.message}`);
    }
  }

  return manifest;
}

function humanizeName(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || slug;
}

function deepMerge(a, b) {
  if (typeof a !== "object" || a === null) return b;
  if (typeof b !== "object" || b === null) return a;
  if (Array.isArray(b)) return b; // arrays replace, not merge
  const out = { ...a };
  for (const k of Object.keys(b)) {
    if (typeof b[k] === "object" && b[k] !== null && !Array.isArray(b[k])) {
      out[k] = deepMerge(a[k], b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

/**
 * Discover plugins across all connectors in a solution.
 *
 * @param {string} mcpStoreRoot  Absolute path to the solution's mcp-store
 *                                (e.g. ".../solution-packs/personal-adas/mcp-store")
 * @returns {Array} merged list of plugin manifests across all connectors
 */
export function discoverPluginsForSolution(mcpStoreRoot) {
  const all = [];
  if (!mcpStoreRoot || !fs.existsSync(mcpStoreRoot)) return all;

  const entries = fs.readdirSync(mcpStoreRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const connectorId = e.name;
    const connectorRoot = path.join(mcpStoreRoot, connectorId);
    const plugins = discoverPluginsForConnector(connectorRoot, connectorId);
    all.push(...plugins);
  }
  return all;
}

export default {
  discoverPluginsForConnector,
  discoverPluginsForSolution,
};
