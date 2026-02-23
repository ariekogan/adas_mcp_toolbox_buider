// API wrappers for voice-conversation endpoints
import voiceFetch from './voiceFetch.js';

export async function createSession(opts = {}) {
  const r = await voiceFetch('voice-conversation/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  return r.json();
}

export async function listSessions() {
  const r = await voiceFetch('voice-conversation/sessions');
  return r.json();
}

export async function getSessionState(sessionId) {
  const r = await voiceFetch(`voice-conversation/${sessionId}/state`);
  return r.json();
}

export async function getManifest(force = false) {
  const r = await voiceFetch(`voice-conversation/manifest?force=${force ? '1' : '0'}`);
  return r.json();
}

export async function postTurn(sessionId, { role, text }) {
  const r = await voiceFetch(`voice-conversation/${sessionId}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, text }),
  });
  return r.json();
}

export async function getSkillSelection() {
  const r = await voiceFetch('voice-skills/selection');
  return r.json();
}

export async function saveSkillSelection({ enabled, disabled }) {
  const r = await voiceFetch('voice-skills/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, disabled }),
  });
  return r.json();
}

export async function getCompiledManifest() {
  const r = await voiceFetch('manifest');
  return r.json();
}

export async function recompileManifest() {
  const r = await voiceFetch('manifest/recompile', { method: 'POST' });
  return r.json();
}
