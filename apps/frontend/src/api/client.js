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

// Mock testing
export async function runMock(skillId, toolId, input, mode = 'example') {
  return request(`/mock/${skillId}/${toolId}`, {
    method: 'POST',
    body: JSON.stringify({ input, mode })
  });
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
  runMock,
  exportSkill,
  previewExport,
  downloadExport
};
