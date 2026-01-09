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

// Projects
export async function listProjects() {
  const data = await request('/projects');
  return data.projects;
}

export async function createProject(name, settings = {}) {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, settings })
  });
}

export async function getProject(id) {
  return request(`/projects/${id}`);
}

export async function deleteProject(id) {
  return request(`/projects/${id}`, { method: 'DELETE' });
}

export async function updateProjectSettings(id, settings) {
  return request(`/projects/${id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
}

// Chat
export async function sendMessage(projectId, message, uiFocus = null) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      message,
      ui_focus: uiFocus
    })
  });
}

export async function getGreeting() {
  const data = await request('/chat/greeting');
  return data.message;
}

// Mock testing
export async function runMock(projectId, toolId, input, mode = 'example') {
  return request(`/mock/${projectId}/${toolId}`, {
    method: 'POST',
    body: JSON.stringify({ input, mode })
  });
}

// Export
export async function exportProject(projectId) {
  return request(`/export/${projectId}`);
}

export async function previewExport(projectId) {
  return request(`/export/${projectId}/preview`);
}

export async function downloadExport(projectId, version) {
  return request(`/export/${projectId}/download/${version}`);
}

// Health
export async function checkHealth() {
  return request('/health');
}

export default {
  listProjects,
  createProject,
  getProject,
  deleteProject,
  updateProjectSettings,
  sendMessage,
  getGreeting,
  runMock,
  exportProject,
  previewExport,
  downloadExport,
  checkHealth
};
