// Shared fetch wrapper for voice-backend API calls.
// Routes through /voice-api/ proxy (nginx rewrites to voice-backend /api/).
// Uses builder's auth tokens (JWT/PAT) automatically.

import { getTenant, getAuthToken } from './client.js';

const _isBuilderPath = window.location.pathname.startsWith('/builder');
const VOICE_API_BASE = _isBuilderPath ? '/builder/voice-api' : '/voice-api';

export default function voiceFetch(path, options = {}) {
  const headers = { ...options.headers, 'X-ADAS-TENANT': getTenant() };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${VOICE_API_BASE}/${path}`, { ...options, headers });
}
