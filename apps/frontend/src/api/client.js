const API_BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

// Skills (mapped to domains backend)
export async function listSkills() {
  const data = await request('/domains');
  return data.domains;
}

export async function createSkill(name, settings = {}, templateId = null) {
  const data = await request('/domains', {
    method: 'POST',
    body: JSON.stringify({ name, settings, templateId })
  });
  return data.domain;
}

export async function getSkill(id) {
  const data = await request(`/domains/${id}`);
  return data.domain;
}

export async function updateSkill(id, updates) {
  const data = await request(`/domains/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ updates })
  });
  return data.domain;
}

export async function updateSkillSettings(id, settings) {
  const data = await request(`/domains/${id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  return data.domain;
}

export async function deleteSkill(id) {
  return request(`/domains/${id}`, { method: 'DELETE' });
}

export async function getSkillValidation(id) {
  const data = await request(`/domains/${id}/validation`);
  return data.validation;
}

// Chat
export async function sendSkillMessage(skillId, message, uiFocus = null) {
  const response = await request('/chat/domain', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: skillId,
      message,
      ui_focus: uiFocus
    })
  });
  // Rename domain to skill in response
  if (response.domain) {
    response.skill = response.domain;
    delete response.domain;
  }
  return response;
}

export async function getSkillGreeting() {
  const data = await request('/chat/domain/greeting');
  return {
    message: data.message,
    inputHint: data.input_hint
  };
}

// File digestion
export async function digestFile(skillId, file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('domain_id', skillId);

  const response = await fetch(`${API_BASE}/chat/domain/digest`, {
    method: 'POST',
    body: formData
    // Don't set Content-Type - browser sets it with boundary
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function applyExtraction(skillId, extraction) {
  const response = await request('/chat/domain/digest/apply', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: skillId,
      extraction
    })
  });

  if (response.domain) {
    response.skill = response.domain;
    delete response.domain;
  }
  return response;
}

// Mock testing
export async function runMock(skillId, toolId, input, mode = 'example') {
  return request(`/mock/${skillId}/${toolId}`, {
    method: 'POST',
    body: JSON.stringify({ input, mode })
  });
}

// Validation
export async function validateToolsConsistency(skillId, newTool = null) {
  return request('/validate/tools-consistency', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: skillId,
      new_tool: newTool
    })
  });
}

export async function validatePolicyConsistency(skillId) {
  return request('/validate/policy-consistency', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: skillId
    })
  });
}

export async function validateIntentsConsistency(skillId) {
  return request('/validate/intents-consistency', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: skillId
    })
  });
}

export async function validateIdentityConsistency(skillId) {
  return request('/validate/identity-consistency', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: skillId
    })
  });
}

export async function validateAll(skillId) {
  // Run all validations in parallel
  const [identity, intents, tools, policy] = await Promise.all([
    validateIdentityConsistency(skillId).catch(e => ({ error: e.message, issues: [] })),
    validateIntentsConsistency(skillId).catch(e => ({ error: e.message, issues: [] })),
    validateToolsConsistency(skillId).catch(e => ({ error: e.message, issues: [] })),
    validatePolicyConsistency(skillId).catch(e => ({ error: e.message, issues: [] }))
  ]);

  return {
    identity,
    intents,
    tools,
    policy,
    totalIssues: (identity.issues?.length || 0) +
                 (intents.issues?.length || 0) +
                 (tools.issues?.length || 0) +
                 (policy.issues?.length || 0)
  };
}

// Export
export async function exportSkill(skillId) {
  return request(`/export/${skillId}`);
}

export async function previewExport(skillId) {
  return request(`/export/${skillId}/preview`);
}

export async function downloadExport(skillId, version) {
  return request(`/export/${skillId}/download/${version}`);
}

// ADAS Core export
export async function deployToAdas(skillId, adasUrl = null) {
  const params = new URLSearchParams({ deploy: 'true' });
  if (adasUrl) params.append('adasUrl', adasUrl);
  return request(`/export/${skillId}/adas?${params}`, { method: 'POST' });
}

export async function previewAdasExport(skillId) {
  return request(`/export/${skillId}/adas/preview`);
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

export async function importConnectorTools(connectionId, domainId, tools = [], policies = {}) {
  return request(`/connectors/${connectionId}/import-to-domain`, {
    method: 'POST',
    body: JSON.stringify({ domainId, tools, policies })
  });
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
// MCP Generation (Autonomous Agent)
// ============================================

export async function listSkillMCPs() {
  const data = await request('/export/mcps');
  return data.mcps;
}

export async function previewMCPGeneration(skillId) {
  return request(`/export/${skillId}/mcp/develop/preview`);
}

export async function* generateMCP(skillId) {
  const response = await fetch(`${API_BASE}/export/${skillId}/mcp/develop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
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

export async function downloadMCPExport(skillId, version) {
  return request(`/export/${skillId}/download/${version}`);
}

export async function getMCPFile(skillId, version, filename) {
  return request(`/export/${skillId}/files/${version}/${encodeURIComponent(filename)}`);
}

export async function startMCPServer(skillId) {
  return request(`/export/${skillId}/mcp/run`, { method: 'POST' });
}

export async function stopMCPServer(skillId) {
  return request(`/export/${skillId}/mcp/stop`, { method: 'POST' });
}

export async function getMCPServerStatus(skillId) {
  return request(`/export/${skillId}/mcp/running`);
}

// ============================================
// Triggers (CORE trigger-runner bridge)
// ============================================

export async function getTriggersStatus(skillId) {
  return request(`/export/${skillId}/triggers/status`);
}

export async function toggleTriggerInCore(skillId, triggerId, active) {
  return request(`/export/${skillId}/triggers/${encodeURIComponent(triggerId)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ active })
  });
}

export async function getTriggerHistory(skillId, triggerId, limit = 20) {
  return request(`/export/${skillId}/triggers/${encodeURIComponent(triggerId)}/history?limit=${limit}`);
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
  getTenantPolicies,
  updateTenantPolicies,
  listEmailAliases,
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
  getMCPServerStatus
};
