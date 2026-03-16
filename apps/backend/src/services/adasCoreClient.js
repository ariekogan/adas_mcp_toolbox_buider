/**
 * ADAS Core Client — unified HTTP client for all outbound calls to ADAS Core.
 *
 * ARCHITECTURE: This is the BRIDGE between Skill Builder (FS) and ADAS Core (Mongo).
 * - Skill Builder stores everything on filesystem (`_builder/`).
 * - ADAS Core stores everything in MongoDB. No filesystem.
 * - This client pushes design-time data FROM Builder TO Core via HTTP API.
 * - Auth: forwards the user's JWT/PAT token from AsyncLocalStorage.
 *
 * Consolidates URL construction, tenant headers, timeouts, error handling,
 * and logging that were previously scattered across exportDeploy.js,
 * adasConnectorSync.js, exportRuntime.js, and import.js.
 *
 * Every method reads the current tenant from AsyncLocalStorage at call time,
 * so it works correctly inside per-request Express middleware chains.
 */

import { getCurrentTenant, getCurrentToken } from '../utils/tenantContext.js';

const BASE_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';
const CORE_MCP_SECRET = process.env.CORE_MCP_SECRET || '';

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

function headers(json = false) {
  const h = {};
  // Service-to-service auth via shared secret (Builder → Core)
  if (CORE_MCP_SECRET) {
    h['x-adas-token'] = CORE_MCP_SECRET;
  }
  // Tenant header — Core uses this to set tenant context
  const tenant = getCurrentTenant();
  if (tenant) {
    h['X-ADAS-TENANT'] = tenant;
  }
  // Also forward user's token for audit/traceability
  const token = getCurrentToken();
  if (token) {
    if (token.startsWith('adas_')) {
      h['X-API-KEY'] = token;
    } else {
      h['Authorization'] = `Bearer ${token}`;
    }
  }
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/**
 * Core fetch wrapper — adds tenant header, timeout, JSON parsing, error handling.
 */
async function request(endpoint, { method = 'GET', body, timeout = 15000, raw = false } = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const opts = {
    method,
    headers: headers(!!body),
    signal: AbortSignal.timeout(timeout),
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  if (raw) return res;

  // Parse response — check Content-Type to avoid parsing HTML as JSON
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    const text = await res.text().catch(() => '');
    data = { _raw: text.slice(0, 200) };
  }

  if (!res.ok) {
    const msg = data.error
      || data._raw
      || `ADAS Core ${method} ${endpoint} failed: HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════
// IDENTITY
// ═══════════════════════════════════════════════════════════════

/**
 * Deploy solution-level identity config (actor types, roles) to ADAS Core.
 */
async function deployIdentity({ actor_types, admin_roles, default_actor_type, default_roles }) {
  return request('/api/identity', {
    method: 'POST',
    body: { actor_types, admin_roles: admin_roles || [], default_actor_type: default_actor_type || '', default_roles: default_roles || [] },
  });
}

// ═══════════════════════════════════════════════════════════════
// SOLUTION CONFIG
// ═══════════════════════════════════════════════════════════════

/**
 * Deploy solution-level config (e.g. exclude_bootstrap_tools) to ADAS Core.
 * Core stores these in MongoDB configStore, applying to ALL skills in the solution.
 */
async function deploySolutionConfig({ exclude_bootstrap_tools } = {}) {
  return request('/api/solution-config', {
    method: 'POST',
    body: { exclude_bootstrap_tools: exclude_bootstrap_tools || [] },
  });
}

// ═══════════════════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════════════════

/**
 * Deploy an MCP server to ADAS Core (starts the Python process).
 * Returns { mcpUri, port, connectorId, ... }
 */
async function deployMcp(skillSlug, mcpServer, requirements) {
  return request('/api/skills/deploy-mcp', {
    method: 'POST',
    body: { skillSlug, mcpServer, requirements },
    timeout: 120000,
  });
}

/**
 * Register a skill definition so it appears in GET /api/skills.
 */
async function importSkill(skillSlug, skillDef) {
  return request('/api/skills/import', {
    method: 'POST',
    body: { skillSlug, skill: skillDef },
  });
}

/**
 * Import a full ADAS export payload (used by the /adas route).
 */
async function importSkillPayload(payload) {
  return request('/api/skills/import', {
    method: 'POST',
    body: payload,
  });
}

// ═══════════════════════════════════════════════════════════════
// CONNECTORS
// ═══════════════════════════════════════════════════════════════

/**
 * Get a single connector by ID. Returns the connector object or null if not found.
 * ADAS Core returns { ok: true, connector: { id, status, tools, ... } } —
 * this method unwraps to return just the connector object.
 */
async function getConnector(connectorId) {
  try {
    const data = await request(`/api/connectors/${connectorId}`);
    return data.connector || data;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Create or update a connector in ADAS Core.
 * Checks if the connector exists first, then PATCHes or POSTs.
 */
async function syncConnector(payload) {
  const existing = await getConnector(payload.id);
  if (existing) {
    return request(`/api/connectors/${payload.id}`, { method: 'PATCH', body: payload });
  }
  return request('/api/connectors', { method: 'POST', body: payload });
}

/**
 * Start (connect) a connector — triggers MCPGateway to spawn it.
 * Returns { ok, tools, status, error?, stderr? } from ADAS Core.
 */
async function startConnector(connectorId) {
  return request(`/api/connectors/${connectorId}/connect`, {
    method: 'POST',
    timeout: 30000,
  });
}

/**
 * Fetch connector details from ADAS Core (status, tools, error, stderr).
 * Useful for diagnosing why a connector has 0 tools after start.
 */
async function getConnectorDiagnostics(connectorId) {
  try {
    const data = await request(`/api/connectors/${connectorId}`);
    const c = data.connector || data;
    return {
      id: connectorId,
      status: c.status || 'unknown',
      transport: c.transport || null,
      tools: c.tools || [],
      error: c.error || null,
      stderr: c.stderr || c.lastError || null,
      config: c.config || null,
    };
  } catch (err) {
    return { id: connectorId, status: 'unreachable', error: err.message };
  }
}

/**
 * Stop (disconnect) a connector.
 */
async function stopConnector(connectorId) {
  return request(`/api/connectors/${connectorId}/disconnect`, { method: 'POST' });
}

/**
 * Delete a connector from ADAS Core. Silently succeeds if already gone.
 */
async function deleteConnector(connectorId) {
  try {
    await request(`/api/connectors/${connectorId}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 404) return { ok: true };
    throw err;
  }
  return { ok: true };
}

/**
 * Get all connectors.
 */
async function getConnectors() {
  const data = await request('/api/connectors');
  return data.connectors || [];
}

/**
 * Call a tool on a connector.
 */
async function callConnectorTool(connectorId, toolName, args = {}) {
  const data = await request(`/api/connectors/${connectorId}/call`, {
    method: 'POST',
    body: { tool: toolName, args },
  });
  return data.result;
}

/**
 * Upload MCP code files to ADAS Core's /mcp-store.
 * Sends source files → Core runs npm install + npm run build (if package.json has build script).
 * Agents send source code only; dist/ files are produced server-side by the build step.
 */
async function uploadMcpCode(connectorId, files) {
  return request('/api/mcp-store/upload', {
    method: 'POST',
    body: { connectorId, files, installDeps: true },
    timeout: 360000, // 6 min — npm install + build can take time
  });
}

// ═══════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a UI plugin asset exists on ADAS Core's /mcp-store.
 * Makes an HTTP HEAD request to the /mcp-ui/:tenant/:connectorId/* serving route.
 * Returns { exists: bool, status: number } — no auth needed (static file route).
 */
async function checkUiAsset(tenant, connectorId, assetPath) {
  const cleanPath = assetPath.replace(/^\//, '');
  const url = `${BASE_URL}/mcp-ui/${tenant}/${connectorId}/${cleanPath}`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return { exists: res.ok, status: res.status };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

/**
 * Check if ADAS Core is reachable.
 */
async function isAvailable() {
  try {
    await request('/api/connectors', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SKILLS — LIST / DELETE (admin)
// ═══════════════════════════════════════════════════════════════

/**
 * List all registered skills on ADAS Core.
 */
async function getSkills() {
  const data = await request('/api/skills');
  return data.skills || data || [];
}

/**
 * Delete a skill from ADAS Core. Silently succeeds if already gone.
 */
async function deleteSkill(skillSlug) {
  try {
    await request(`/api/skills/${skillSlug}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 404) return { ok: true };
    throw err;
  }
  return { ok: true };
}

/**
 * Delete ALL skills from ADAS Core. Used when removing a solution.
 */
async function deleteAllSkills() {
  return request('/api/skills', { method: 'DELETE', timeout: 30000 });
}

/**
 * Delete ALL connectors from ADAS Core. Used when removing a solution.
 */
async function deleteAllConnectors() {
  return request('/api/connectors', { method: 'DELETE', timeout: 30000 });
}

// ═══════════════════════════════════════════════════════════════
// JOBS & EXECUTION LOGS (External Agent API)
// ═══════════════════════════════════════════════════════════════

/**
 * List jobs — summaries with status, timing, skill info.
 */
async function listJobs({ skillSlug, limit = 10, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (skillSlug) qs.set('skillSlug', skillSlug);
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  return request(`/api/jobs?${qs}`);
}

/**
 * Get full job details with iterations, tool calls, planner steps.
 */
async function getJobDetails(jobId, skillSlug) {
  const qs = skillSlug ? `?skillSlug=${encodeURIComponent(skillSlug)}` : '';
  return request(`/api/job/${encodeURIComponent(jobId)}/details${qs}`);
}

/**
 * Get single job (lightweight).
 */
async function getJob(jobId) {
  return request(`/api/job/${encodeURIComponent(jobId)}`);
}

/**
 * Start a skill execution (test). Returns { ok, id, jobId, streamUrl }.
 */
async function startChat({ goal, skillSlug, actorId }) {
  return request('/api/chat', {
    method: 'POST',
    body: { goal, skillSlug, ...(actorId ? { actorId } : {}) },
    timeout: 30000,
  });
}

/**
 * Test pipeline: runs intent detection + first planner iteration WITHOUT executing tools.
 * Returns decision trace for debugging.
 */
async function testPipeline({ message, skillSlug, actorId }) {
  return request('/api/test-pipeline', {
    method: 'POST',
    body: { message, skillSlug, ...(actorId ? { actorId } : {}) },
    timeout: 30000,
  });
}

/**
 * Get job insight analysis — timing, toolStats, bottleneck, signals, recommendations.
 */
async function getInsightJob(jobId, level = 0) {
  return request(`/api/insight/${encodeURIComponent(jobId)}?level=${level}`);
}

/**
 * List conversations for a skill.
 */
async function listConversations({ skillSlug, limit = 20 } = {}) {
  const qs = new URLSearchParams();
  if (skillSlug) qs.set('skillSlug', skillSlug);
  qs.set('page_size', String(limit));
  return request(`/api/conversation?${qs}`);
}

/**
 * Abort a running job.
 */
async function abortJob(jobId) {
  return request(`/api/job/${encodeURIComponent(jobId)}/abort`, {
    method: 'POST',
    timeout: 10000,
  });
}

/**
 * Get connector source code from mcp-store.
 */
async function getConnectorSource(connectorId) {
  return request(`/api/mcp-store/${encodeURIComponent(connectorId)}`);
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// UI PLUGINS
// ═══════════════════════════════════════════════════════════════

/**
 * Deploy UI plugin manifests to ADAS Core.
 * Core stores them and serves to mobile/web clients via GET /api/ui-plugins.
 * Also auto-generates bundleUrl for each plugin that has a React Native component.
 */
async function deployUiPlugins(plugins, { solutionId } = {}) {
  // Enrich each plugin with bundleUrl if it has a reactNative render mode
  const enriched = (plugins || []).map(p => {
    const pluginId = p.id;
    // Auto-generate bundleUrl for Core's bundle serving endpoint
    if (!p.render?.reactNative?.bundleUrl && p.render?.reactNative) {
      p.render.reactNative.bundleUrl = `/api/ui-plugins/${encodeURIComponent(pluginId)}/bundle.js`;
    }
    if (!p.bundleUrl && p.render?.reactNative) {
      p.bundleUrl = `/api/ui-plugins/${encodeURIComponent(pluginId)}/bundle.js`;
    }
    return p;
  });
  return request('/api/ui-plugins', {
    method: 'POST',
    body: { plugins: enriched },
  });
}

/**
 * Fetch tenant settings from ADAS Core.
 * Returns { llmProvider, openaiApiKey, anthropicApiKey, ... } or null on error.
 */
const _settingsCache = { data: null, ts: 0 };
const SETTINGS_TTL = 60_000; // 60s cache

async function getSettings() {
  if (_settingsCache.data && Date.now() - _settingsCache.ts < SETTINGS_TTL) {
    return _settingsCache.data;
  }
  try {
    const data = await request('/api/settings');
    const settings = data.settings || data;
    _settingsCache.data = settings;
    _settingsCache.ts = Date.now();
    return settings;
  } catch {
    return null;
  }
}

export default {
  getBaseUrl: () => BASE_URL,
  getSettings,
  deployIdentity,
  deploySolutionConfig,
  deployUiPlugins,
  deployMcp,
  importSkill,
  importSkillPayload,
  getConnector,
  getConnectorDiagnostics,
  syncConnector,
  startConnector,
  stopConnector,
  deleteConnector,
  deleteAllConnectors,
  getConnectors,
  getSkills,
  deleteSkill,
  deleteAllSkills,
  callConnectorTool,
  uploadMcpCode,
  isAvailable,
  checkUiAsset,
  // External Agent API — jobs, testing, insights
  listJobs,
  getJobDetails,
  getJob,
  startChat,
  abortJob,
  testPipeline,
  getInsightJob,
  listConversations,
  getConnectorSource,
};

export {
  BASE_URL,
  getSettings,
  deployIdentity,
  deploySolutionConfig,
  deployUiPlugins,
  deployMcp,
  importSkill,
  importSkillPayload,
  getConnector,
  getConnectorDiagnostics,
  syncConnector,
  startConnector,
  stopConnector,
  deleteConnector,
  deleteAllConnectors,
  getConnectors,
  getSkills,
  deleteSkill,
  deleteAllSkills,
  callConnectorTool,
  uploadMcpCode,
  isAvailable,
  checkUiAsset,
  // External Agent API — jobs, testing, insights
  listJobs,
  getJobDetails,
  getJob,
  startChat,
  abortJob,
  testPipeline,
  getInsightJob,
  listConversations,
  getConnectorSource,
};
