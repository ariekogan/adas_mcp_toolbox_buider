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

// Skills (mapped to domains backend)
export async function listSkills() {
  const data = await request('/domains');
  return data.domains;
}

export async function createSkill(name, settings = {}) {
  const data = await request('/domains', {
    method: 'POST',
    body: JSON.stringify({ name, settings })
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

export default {
  checkHealth,
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
  previewAdasExport
};
