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

// Domains
export async function listDomains() {
  const data = await request('/domains');
  return data.domains;
}

export async function createDomain(name, settings = {}) {
  const data = await request('/domains', {
    method: 'POST',
    body: JSON.stringify({ name, settings })
  });
  return data.domain;
}

export async function getDomain(id) {
  const data = await request(`/domains/${id}`);
  return data.domain;
}

export async function updateDomain(id, updates) {
  const data = await request(`/domains/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ updates })
  });
  return data.domain;
}

export async function updateDomainSettings(id, settings) {
  const data = await request(`/domains/${id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  return data.domain;
}

export async function deleteDomain(id) {
  return request(`/domains/${id}`, { method: 'DELETE' });
}

export async function getDomainValidation(id) {
  const data = await request(`/domains/${id}/validation`);
  return data.validation;
}

// Chat
export async function sendDomainMessage(domainId, message, uiFocus = null) {
  return request('/chat/domain', {
    method: 'POST',
    body: JSON.stringify({
      domain_id: domainId,
      message,
      ui_focus: uiFocus
    })
  });
}

export async function getDomainGreeting() {
  const data = await request('/chat/domain/greeting');
  return data.message;
}

// Mock testing
export async function runMock(domainId, toolId, input, mode = 'example') {
  return request(`/mock/${domainId}/${toolId}`, {
    method: 'POST',
    body: JSON.stringify({ input, mode })
  });
}

// Export
export async function exportDomain(domainId) {
  return request(`/export/${domainId}`);
}

export async function previewExport(domainId) {
  return request(`/export/${domainId}/preview`);
}

export async function downloadExport(domainId, version) {
  return request(`/export/${domainId}/download/${version}`);
}

export default {
  checkHealth,
  listDomains,
  createDomain,
  getDomain,
  updateDomain,
  updateDomainSettings,
  deleteDomain,
  getDomainValidation,
  sendDomainMessage,
  getDomainGreeting,
  runMock,
  exportDomain,
  previewExport,
  downloadExport
};
