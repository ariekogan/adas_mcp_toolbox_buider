const API_BASE = '/api';

// Tenant management — fixed allow-list
const VALID_TENANTS = ['main', 'testing', 'dev'];
const TENANT_STORAGE_KEY = 'sb.tenant';

export function getTenant() {
  const stored = localStorage.getItem(TENANT_STORAGE_KEY);
  return VALID_TENANTS.includes(stored) ? stored : 'main';
}

export function setTenant(tenant) {
  if (VALID_TENANTS.includes(tenant)) {
    localStorage.setItem(TENANT_STORAGE_KEY, tenant);
  }
}

export { VALID_TENANTS };

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-ADAS-TENANT': getTenant(),
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Health
export async function checkHealth() {
  return request('/health');
}

// Templates
export async function listTemplates() {
  const data = await request('/templates');
  return data.templates;
}

export async function getTemplate(id) {
  const data = await request(`/templates/${id}`);
  return data.template;
}

// Skills (mapped to skills backend - now solution-scoped)
export async function listSkills(solutionId) {
  if (!solutionId) throw new Error('solutionId is required');
  const data = await request(`/solutions/${solutionId}/skills`);
  return data.skills;
}

export async function createSkill(solutionId, name, settings = {}, templateId = null) {
  if (!solutionId) throw new Error('solutionId is required');
  const data = await request(`/solutions/${solutionId}/skills`, {
    method: 'POST',
    body: JSON.stringify({ name, settings, templateId })
  });
  return data.skill;
}

export async function getSkill(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  const data = await request(`/solutions/${solutionId}/skills/${skillId}`);
  return data.skill;
}

export async function updateSkill(solutionId, skillId, updates) {
  if (!solutionId) throw new Error('solutionId is required');
  const data = await request(`/solutions/${solutionId}/skills/${skillId}`, {
    method: 'PATCH',
    body: JSON.stringify({ updates })
  });
  return data.skill;
}

export async function updateSkillSettings(solutionId, skillId, settings) {
  if (!solutionId) throw new Error('solutionId is required');
  const data = await request(`/solutions/${solutionId}/skills/${skillId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  return data.skill;
}

export async function deleteSkill(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/solutions/${solutionId}/skills/${skillId}`, { method: 'DELETE' });
}

export async function getSkillValidation(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  const data = await request(`/solutions/${solutionId}/skills/${skillId}/validation`);
  return data.validation;
}

// Chat
export async function sendSkillMessage(solutionId, skillId, message, uiFocus = null) {
  if (!solutionId) throw new Error('solutionId is required');
  const response = await request('/chat/skill', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId,
      message,
      ui_focus: uiFocus
    })
  });
  return response;
}

export async function getSkillGreeting() {
  const data = await request('/chat/skill/greeting');
  return {
    message: data.message,
    inputHint: data.input_hint
  };
}

// File digestion
export async function digestFile(solutionId, skillId, file) {
  if (!solutionId) throw new Error('solutionId is required');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('solution_id', solutionId);
  formData.append('skill_id', skillId);

  const response = await fetch(`${API_BASE}/chat/skill/digest`, {
    method: 'POST',
    headers: {
      'X-ADAS-TENANT': getTenant()
    },
    body: formData
    // Don't set Content-Type - browser sets it with boundary
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function applyExtraction(solutionId, skillId, extraction) {
  if (!solutionId) throw new Error('solutionId is required');
  const response = await request('/chat/skill/digest/apply', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId,
      extraction
    })
  });

  return response;
}

// Mock testing
export async function runMock(solutionId, skillId, toolId, input, mode = 'example') {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/mock/${skillId}/${toolId}`, {
    method: 'POST',
    body: JSON.stringify({ solution_id: solutionId, input, mode })
  });
}

// Validation
export async function validateToolsConsistency(solutionId, skillId, newTool = null) {
  if (!solutionId) throw new Error('solutionId is required');
  return request('/validate/tools-consistency', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId,
      new_tool: newTool
    })
  });
}

export async function validatePolicyConsistency(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request('/validate/policy-consistency', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId
    })
  });
}

export async function validateIntentsConsistency(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request('/validate/intents-consistency', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId
    })
  });
}

export async function validateIdentityConsistency(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request('/validate/identity-consistency', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId
    })
  });
}

export async function validateSecurityConsistency(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request('/validate/security-consistency', {
    method: 'POST',
    body: JSON.stringify({
      solution_id: solutionId,
      skill_id: skillId
    })
  });
}

export async function validateAll(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  // Run all validations in parallel
  const [identity, intents, tools, policy, security] = await Promise.all([
    validateIdentityConsistency(solutionId, skillId).catch(e => ({ error: e.message, issues: [] })),
    validateIntentsConsistency(solutionId, skillId).catch(e => ({ error: e.message, issues: [] })),
    validateToolsConsistency(solutionId, skillId).catch(e => ({ error: e.message, issues: [] })),
    validatePolicyConsistency(solutionId, skillId).catch(e => ({ error: e.message, issues: [] })),
    validateSecurityConsistency(solutionId, skillId).catch(e => ({ error: e.message, issues: [] }))
  ]);

  return {
    identity,
    intents,
    tools,
    policy,
    security,
    totalIssues: (identity.issues?.length || 0) +
                 (intents.issues?.length || 0) +
                 (tools.issues?.length || 0) +
                 (policy.issues?.length || 0) +
                 (security.issues?.length || 0)
  };
}

// Export
export async function exportSkill(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}?solution_id=${solutionId}`);
}

export async function previewExport(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/preview?solution_id=${solutionId}`);
}

export async function downloadExport(solutionId, skillId, version) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/download/${version}?solution_id=${solutionId}`);
}

// ADAS Core export
export async function deployToAdas(solutionId, skillId, adasUrl = null) {
  if (!solutionId) throw new Error('solutionId is required');
  const params = new URLSearchParams({ deploy: 'true', solution_id: solutionId });
  if (adasUrl) params.append('adasUrl', adasUrl);
  return request(`/export/${skillId}/adas?${params}`, { method: 'POST' });
}

export async function previewAdasExport(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/adas/preview?solution_id=${solutionId}`);
}

// Connectors
export async function listConnectors() {
  return request('/connectors');
}

export async function listPrebuiltConnectors() {
  return request('/connectors/prebuilt');
}

export async function connectMCP(config) {
  return request('/connectors/connect', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function connectPrebuilt(connectorId, options = {}) {
  return request(`/connectors/prebuilt/${connectorId}/connect`, {
    method: 'POST',
    body: JSON.stringify(options)
  });
}

export async function disconnectMCP(id) {
  return request(`/connectors/disconnect/${id}`, { method: 'POST' });
}

export async function getConnectorStatus(id) {
  return request(`/connectors/${id}/status`);
}

export async function getConnectorTools(id) {
  return request(`/connectors/${id}/tools`);
}

export async function callConnectorTool(connectionId, tool, args = {}) {
  return request(`/connectors/${connectionId}/call`, {
    method: 'POST',
    body: JSON.stringify({ tool, args })
  });
}

export async function importConnectorTools(connectionId, solutionId, skillId, tools = [], policies = {}) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/connectors/${connectionId}/import-to-skill`, {
    method: 'POST',
    body: JSON.stringify({ solutionId, skillId, tools, policies })
  });
}

export async function getConnectorsADASStatus() {
  return request('/connectors/adas-status');
}

export async function getSavedConnectors() {
  return request('/connectors/saved');
}

// ============================================
// Package Import (External MCP Packages)
// ============================================

/**
 * Import an MCP package manifest into Skill Builder catalog
 * @param {object} manifest - The manifest.json content from package.sh
 */
export async function importPackage(manifest) {
  return request('/import', {
    method: 'POST',
    body: JSON.stringify(manifest)
  });
}

/**
 * Import a solution pack (.tar.gz) into Skill Builder.
 * Handles skills, connectors, and MCP source code.
 * @param {File} file - The .tar.gz file
 * @returns {Promise<object>} Import result with summary
 */
export async function importSolutionPack(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/import/solution-pack`, {
    method: 'POST',
    body: formData
    // Don't set Content-Type - browser sets it with boundary
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Import failed: ${response.status}`);
  }

  return response.json();
}

/**
 * List all imported packages
 */
export async function listImportedPackages() {
  return request('/import/packages');
}

/**
 * Get details of a specific imported package
 */
export async function getImportedPackage(packageName) {
  return request(`/import/packages/${encodeURIComponent(packageName)}`);
}

/**
 * Remove an imported package from Skill Builder catalog
 */
export async function removeImportedPackage(packageName) {
  return request(`/import/packages/${encodeURIComponent(packageName)}`, {
    method: 'DELETE'
  });
}

/**
 * Deploy all connectors and skills from an imported package to ADAS Core.
 * Returns an SSE stream with progress events.
 *
 * @param {string} packageName - Package name
 * @param {function} onEvent - Callback for each SSE event: { type, ... }
 *   Types: start, connector_progress, skill_progress, complete, error
 * @returns {Promise<void>} Resolves when stream ends
 */
export async function deployAllPackage(packageName, onEvent) {
  const response = await fetch(
    `${API_BASE}/import/packages/${encodeURIComponent(packageName)}/deploy-all`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Deploy failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

// ============================================
// Solutions
// ============================================

export async function listSolutions() {
  const data = await request('/solutions');
  return data.solutions;
}

export async function createSolution(name) {
  const data = await request('/solutions', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  return data.solution;
}

export async function getSolution(id) {
  const data = await request(`/solutions/${id}`);
  return data.solution;
}

export async function updateSolution(id, stateUpdate) {
  const data = await request(`/solutions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ state_update: stateUpdate })
  });
  return data.solution;
}

export async function deleteSolution(id) {
  return request(`/solutions/${id}`, { method: 'DELETE' });
}

export async function sendSolutionMessage(solutionId, message) {
  return request(`/solutions/${solutionId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message })
  });
}

export async function getSolutionGreeting(solutionId) {
  const data = await request(`/solutions/${solutionId}/greeting`);
  return {
    message: data.message,
    inputHint: data.input_hint
  };
}

export async function validateSolution(id) {
  const data = await request(`/solutions/${id}/validate`);
  return data.validation;
}

export async function getSolutionValidation(id) {
  return request(`/solutions/${id}/validation`);
}

export async function getSolutionValidationReport(id) {
  return request(`/solutions/${id}/validation-report`);
}

export async function getSolutionTopology(id) {
  const data = await request(`/solutions/${id}/topology`);
  return data.topology;
}

// ============================================
// Actors (CORE cp.admin_api bridge)
// ============================================

export async function listActors(params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);
  if (params.status) query.append('status', params.status);
  const queryStr = query.toString();
  return request(`/actors${queryStr ? `?${queryStr}` : ''}`);
}

export async function getActor(actorId) {
  return request(`/actors/${actorId}`);
}

export async function createActor(params) {
  return request('/actors', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function updateActorRoles(actorId, roles) {
  return request(`/actors/${actorId}/roles`, {
    method: 'PATCH',
    body: JSON.stringify({ roles })
  });
}

export async function approveActor(actorId) {
  return request(`/actors/${actorId}/approve`, { method: 'POST' });
}

export async function deactivateActor(actorId) {
  return request(`/actors/${actorId}/deactivate`, { method: 'POST' });
}

export async function linkIdentity(actorId, provider, externalId) {
  return request(`/actors/${actorId}/identities`, {
    method: 'POST',
    body: JSON.stringify({ provider, externalId })
  });
}

export async function unlinkIdentity(actorId, provider, externalId) {
  return request(`/actors/${actorId}/identities`, {
    method: 'DELETE',
    body: JSON.stringify({ provider, externalId })
  });
}

export async function listTokens(actorId) {
  return request(`/actors/${actorId}/tokens`);
}

export async function createToken(actorId, scopes = ['*']) {
  return request(`/actors/${actorId}/tokens`, {
    method: 'POST',
    body: JSON.stringify({ scopes })
  });
}

export async function revokeToken(tokenId) {
  return request(`/actors/tokens/${tokenId}`, { method: 'DELETE' });
}

export async function findOrCreateActorForIdentity(params) {
  return request('/actors/find-or-create', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getOrCreateTokenForIdentity(params) {
  return request('/actors/token-for-identity', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// ============================================
// Tenant Configuration
// ============================================

export async function getTenantConfig() {
  return request('/tenant');
}

export async function updateTenantConfig(config) {
  return request('/tenant', {
    method: 'PUT',
    body: JSON.stringify(config)
  });
}

export async function patchTenantConfig(updates) {
  return request('/tenant', {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export async function getTenantChannels() {
  return request('/tenant/channels');
}

export async function updateTenantChannel(channel, config) {
  return request(`/tenant/channels/${channel}`, {
    method: 'PUT',
    body: JSON.stringify(config)
  });
}

export async function enableTenantChannel(channel, enabled) {
  return request(`/tenant/channels/${channel}/enable`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
  });
}

export async function addEmailRoutingRule(address, skillSlug) {
  return request('/tenant/channels/email/routing/rules', {
    method: 'POST',
    body: JSON.stringify({ address, skill_slug: skillSlug })
  });
}

export async function removeEmailRoutingRule(address) {
  return request(`/tenant/channels/email/routing/rules/${encodeURIComponent(address)}`, {
    method: 'DELETE'
  });
}

export async function addSlackRoutingRule(rule) {
  return request('/tenant/channels/slack/routing/rules', {
    method: 'POST',
    body: JSON.stringify(rule)
  });
}

export async function removeSlackRoutingRule(params) {
  const query = new URLSearchParams();
  if (params.mention_handle) query.append('mention_handle', params.mention_handle);
  if (params.channel_id) query.append('channel_id', params.channel_id);
  return request(`/tenant/channels/slack/routing/rules?${query}`, {
    method: 'DELETE'
  });
}

export async function addTelegramRoutingRule(rule) {
  return request('/tenant/channels/telegram/routing/rules', {
    method: 'POST',
    body: JSON.stringify(rule)
  });
}

export async function removeTelegramRoutingRule(params) {
  const query = new URLSearchParams();
  if (params.command) query.append('command', params.command);
  if (params.chat_id) query.append('chat_id', params.chat_id);
  if (params.username) query.append('username', params.username);
  return request(`/tenant/channels/telegram/routing/rules?${query}`, {
    method: 'DELETE'
  });
}

export async function setChannelDefaultSkill(channel, skillSlug) {
  return request(`/tenant/channels/${channel}/routing/default-skill`, {
    method: 'PATCH',
    body: JSON.stringify({ default_skill: skillSlug || null })
  });
}

export async function getTenantPolicies() {
  return request('/tenant/policies');
}

export async function updateTenantPolicies(policies) {
  return request('/tenant/policies', {
    method: 'PATCH',
    body: JSON.stringify(policies)
  });
}

export async function listEmailAliases() {
  return request('/tenant/email-aliases');
}

// ============================================
// Email Config (CORE bridge)
// ============================================

export async function getEmailConfig() {
  return request('/tenant/email/config');
}

export async function setEmailConfig(config) {
  return request('/tenant/email/config', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function testEmailConnection(params = {}) {
  return request('/tenant/email/test', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// ============================================
// Telegram Config (CORE bridge)
// ============================================

export async function getTelegramBotConfig() {
  return request('/tenant/telegram/config');
}

export async function setTelegramBotConfig(config) {
  return request('/tenant/telegram/config', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function testTelegramConnection() {
  return request('/tenant/telegram/test', {
    method: 'POST'
  });
}

// ============================================
// Retention Cleanup
// ============================================

export async function previewRetentionCleanup() {
  return request('/tenant/retention/preview');
}

export async function triggerRetentionCleanup(dryRun = false) {
  return request('/tenant/retention/cleanup', {
    method: 'POST',
    body: JSON.stringify({ dryRun })
  });
}

// ============================================
// MCP Generation (Autonomous Agent)
// ============================================

export async function listSkillMCPs(solutionId = null) {
  // If solutionId provided, list MCPs for that solution only
  // If no solutionId, list MCPs from ALL solutions
  const url = solutionId ? `/export/mcps?solution_id=${solutionId}` : '/export/mcps';
  const data = await request(url);
  return data.mcps;
}

export async function previewMCPGeneration(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/mcp/develop/preview?solution_id=${solutionId}`);
}

export async function* generateMCP(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  const response = await fetch(`${API_BASE}/export/${skillId}/mcp/develop?solution_id=${solutionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ADAS-TENANT': getTenant()
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Generation failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

export async function downloadMCPExport(solutionId, skillId, version) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/download/${version}?solution_id=${solutionId}`);
}

export async function getMCPFile(solutionId, skillId, version, filename) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/files/${version}/${encodeURIComponent(filename)}?solution_id=${solutionId}`);
}

export async function startMCPServer(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/mcp/run`, {
    method: 'POST',
    body: JSON.stringify({ solution_id: solutionId })
  });
}

export async function stopMCPServer(skillId) {
  return request(`/export/${skillId}/mcp/stop`, { method: 'POST' });
}

export async function getMCPServerStatus(skillId) {
  return request(`/export/${skillId}/mcp/running`);
}

/**
 * Deploy MCP to ADAS Core (one-click: start server + register)
 */
export async function deployMCPToAdas(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/mcp/deploy`, {
    method: 'POST',
    body: JSON.stringify({ solution_id: solutionId })
  });
}

// ============================================
// Triggers (CORE trigger-runner bridge)
// ============================================

export async function getTriggersStatus(solutionId, skillId) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/triggers/status?solution_id=${solutionId}`);
}

export async function toggleTriggerInCore(solutionId, skillId, triggerId, active) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/triggers/${encodeURIComponent(triggerId)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ solution_id: solutionId, active })
  });
}

export async function getTriggerHistory(solutionId, skillId, triggerId, limit = 20) {
  if (!solutionId) throw new Error('solutionId is required');
  return request(`/export/${skillId}/triggers/${encodeURIComponent(triggerId)}/history?limit=${limit}&solution_id=${solutionId}`);
}

export default {
  checkHealth,
  listTemplates,
  getTemplate,
  listSkills,
  createSkill,
  getSkill,
  updateSkill,
  updateSkillSettings,
  deleteSkill,
  getSkillValidation,
  sendSkillMessage,
  getSkillGreeting,
  digestFile,
  applyExtraction,
  runMock,
  validateToolsConsistency,
  validatePolicyConsistency,
  validateIntentsConsistency,
  validateIdentityConsistency,
  validateSecurityConsistency,
  validateAll,
  exportSkill,
  previewExport,
  downloadExport,
  deployToAdas,
  previewAdasExport,
  // Connectors
  listConnectors,
  listPrebuiltConnectors,
  connectMCP,
  connectPrebuilt,
  disconnectMCP,
  getConnectorStatus,
  getConnectorTools,
  callConnectorTool,
  importConnectorTools,
  // Actors (CORE bridge)
  listActors,
  getActor,
  createActor,
  updateActorRoles,
  approveActor,
  deactivateActor,
  linkIdentity,
  unlinkIdentity,
  listTokens,
  createToken,
  revokeToken,
  findOrCreateActorForIdentity,
  getOrCreateTokenForIdentity,
  // Tenant
  getTenantConfig,
  updateTenantConfig,
  patchTenantConfig,
  getTenantChannels,
  updateTenantChannel,
  enableTenantChannel,
  addEmailRoutingRule,
  removeEmailRoutingRule,
  addSlackRoutingRule,
  removeSlackRoutingRule,
  addTelegramRoutingRule,
  removeTelegramRoutingRule,
  getTenantPolicies,
  updateTenantPolicies,
  listEmailAliases,
  // Email Config (CORE bridge)
  getEmailConfig,
  setEmailConfig,
  testEmailConnection,
  // Telegram Config (CORE bridge)
  getTelegramBotConfig,
  setTelegramBotConfig,
  testTelegramConnection,
  // Retention
  previewRetentionCleanup,
  triggerRetentionCleanup,
  // Triggers (CORE bridge)
  getTriggersStatus,
  toggleTriggerInCore,
  getTriggerHistory,
  // MCP Generation
  listSkillMCPs,
  previewMCPGeneration,
  generateMCP,
  downloadMCPExport,
  getMCPFile,
  startMCPServer,
  stopMCPServer,
  getMCPServerStatus,
  deployMCPToAdas,
  // Solutions
  listSolutions,
  createSolution,
  getSolution,
  updateSolution,
  deleteSolution,
  sendSolutionMessage,
  getSolutionGreeting,
  validateSolution,
  getSolutionValidation,
  getSolutionValidationReport,
  getSolutionTopology,
  // Package Import
  importPackage,
  importSolutionPack,
  listImportedPackages,
  getImportedPackage,
  removeImportedPackage,
  deployAllPackage
};
