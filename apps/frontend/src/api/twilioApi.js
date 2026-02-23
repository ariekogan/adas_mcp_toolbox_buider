// API wrappers for Twilio management endpoints
import voiceFetch from './voiceFetch.js';

export async function loadSettings() {
  const r = await voiceFetch('settings');
  return r.json();
}

export async function saveSettings(patch) {
  const r = await voiceFetch('settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export async function loadNumbers() {
  const r = await voiceFetch('twilio/numbers');
  return r.json();
}

export async function wireNumber(phoneNumberSid) {
  const r = await voiceFetch('twilio/wire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumberSid }),
  });
  return r.json();
}

export async function getTwilioStatus() {
  const r = await voiceFetch('twilio/status');
  return r.json();
}

export async function getVoicePrompt() {
  const r = await voiceFetch('voice-prompt');
  return r.json();
}

export async function getVoicePromptCustom() {
  const r = await voiceFetch('voice-prompt/custom');
  return r.json();
}

export async function chatVoicePrompt(body) {
  const r = await voiceFetch('voice-prompt/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function previewVoicePrompt() {
  const r = await voiceFetch('voice-prompt/preview', { method: 'POST' });
  return r.json();
}
