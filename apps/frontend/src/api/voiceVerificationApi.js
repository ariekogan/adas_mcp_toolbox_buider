// API functions for voice caller verification settings + known phones.

import voiceFetch from './voiceFetch.js';

export async function getVerificationConfig() {
  const r = await voiceFetch('voice-verification/config');
  return r.json();
}

export async function saveVerificationConfig(config) {
  const r = await voiceFetch('voice-verification/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return r.json();
}

export async function getKnownPhones() {
  const r = await voiceFetch('voice-verification/phones');
  return r.json();
}

export async function addKnownPhone({ number, label }) {
  const r = await voiceFetch('voice-verification/phones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, label }),
  });
  return r.json();
}

export async function removeKnownPhone(number) {
  const r = await voiceFetch(`voice-verification/phones/${encodeURIComponent(number)}`, {
    method: 'DELETE',
  });
  return r.json();
}
