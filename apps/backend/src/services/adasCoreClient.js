/**
 * ADAS Core Client — unified HTTP client for all outbound calls to ADAS Core.
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

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

function headers(json = false) {
  const h = {};
  // Auth token (JWT, PAT, or API key) — forwarded from client via ALS
  const token = getCurrentToken();
  if (token) {
    if (token.startsWith('adas_')) {
      // API key format → send as X-API-KEY (Core's attachActor handles this)
      h['X-API-KEY'] = token;
    } else {
      h['Authorization'] = `Bearer ${token}`;
    }
  }
  // No fallback — if no token, request will fail at Core's requireAuth
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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `ADAS Core ${method} ${endpoint} failed: HTTP ${res.status}`);
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
 */
async function startConnector(connectorId) {
  return request(`/api/connectors/${connectorId}/connect`, {
    method: 'POST',
    timeout: 30000,
  });
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
 */
async function uploadMcpCode(connectorId, files) {
  return request('/api/mcp-store/upload', {
    method: 'POST',
    body: { connectorId, files, installDeps: true },
    timeout: 60000,
  });
}

// ═══════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════

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
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export default {
  getBaseUrl: () => BASE_URL,
  deployIdentity,
  deployMcp,
  importSkill,
  importSkillPayload,
  getConnector,
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
};

export {
  BASE_URL,
  deployIdentity,
  deployMcp,
  importSkill,
  importSkillPayload,
  getConnector,
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
};
