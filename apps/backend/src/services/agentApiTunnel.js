/**
 * Agent API Tunnel Manager
 *
 * Exposes the skill-validator microservice (port 3200) via a public URL.
 *
 * Supports two tunnel providers:
 *   1. Cloudflare Tunnel (preferred) — managed externally via `cloudflared`
 *   2. ngrok (legacy fallback) — managed in-process
 *
 * Environment variables:
 *   AGENT_API_URL        — Fixed public URL (Cloudflare Tunnel). When set,
 *                          ngrok is disabled and start/stop are no-ops.
 *                          Example: https://api.ateam-ai.com
 *   NGROK_AUTHTOKEN      — ngrok auth token (only used when AGENT_API_URL is not set)
 *   VALIDATOR_URL         — skill-validator address (default: http://localhost:3200)
 *   AGENT_API_DOMAIN      — custom ngrok domain (legacy)
 */

let ngrokModule = null;
let activeTunnel = null; // { url, domain, listener }

const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:3200';
const AGENT_API_URL = process.env.AGENT_API_URL || null;
const DOMAIN = process.env.AGENT_API_DOMAIN || null;

/**
 * Determine the tunnel provider in use.
 * @returns {'cloudflare' | 'ngrok' | null}
 */
function getProvider() {
  if (AGENT_API_URL) return 'cloudflare';
  if (process.env.NGROK_AUTHTOKEN) return 'ngrok';
  return null;
}

/* ── Cloudflare helpers ─────────────────────────────────────────── */

/**
 * Probe the Cloudflare Tunnel by hitting /health through the public URL.
 * Returns true if the tunnel is forwarding traffic.
 */
async function probeCloudflare() {
  if (!AGENT_API_URL) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${AGENT_API_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/* ── ngrok helpers ──────────────────────────────────────────────── */

async function getNgrok() {
  if (ngrokModule) return ngrokModule;
  try {
    ngrokModule = await import('@ngrok/ngrok');
    return ngrokModule;
  } catch {
    return null;
  }
}

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Start the tunnel.
 * - Cloudflare mode: no-op (tunnel is managed externally). Returns the fixed URL.
 * - ngrok mode: starts an in-process tunnel.
 */
export async function startTunnel() {
  // Cloudflare — tunnel is external, just return the URL
  if (AGENT_API_URL) {
    const active = await probeCloudflare();
    return {
      url: AGENT_API_URL,
      domain: new URL(AGENT_API_URL).hostname,
      provider: 'cloudflare',
      active,
    };
  }

  // ngrok — existing behavior
  if (activeTunnel) {
    return { url: activeTunnel.url, domain: activeTunnel.domain, provider: 'ngrok' };
  }

  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    throw new Error('NGROK_AUTHTOKEN environment variable is not set');
  }

  const ngrok = await getNgrok();
  if (!ngrok) {
    throw new Error('@ngrok/ngrok package is not installed. Run: npm install @ngrok/ngrok');
  }

  console.log(`[AgentAPI] Starting ngrok tunnel → ${VALIDATOR_URL}${DOMAIN ? ` (domain: ${DOMAIN})` : ''}`);

  const forwardOpts = { addr: VALIDATOR_URL, authtoken };
  if (DOMAIN) forwardOpts.domain = DOMAIN;

  const listener = await ngrok.default.forward(forwardOpts);

  const url = listener.url();
  const domain = DOMAIN || new URL(url).hostname;
  activeTunnel = { url, domain, listener };

  console.log(`[AgentAPI] Tunnel active: ${url}`);
  return { url, domain, provider: 'ngrok' };
}

/**
 * Stop the tunnel.
 * - Cloudflare mode: no-op.
 * - ngrok mode: closes the in-process tunnel.
 */
export async function stopTunnel() {
  if (AGENT_API_URL) return; // Cloudflare tunnel is external

  if (!activeTunnel) return;

  console.log('[AgentAPI] Stopping ngrok tunnel');
  try {
    await activeTunnel.listener.close();
  } catch (err) {
    console.warn('[AgentAPI] Error closing tunnel:', err.message);
  }
  activeTunnel = null;
}

/**
 * Get current tunnel status.
 */
export function getTunnelStatus() {
  const provider = getProvider();

  if (provider === 'cloudflare') {
    return {
      active: true, // Assume active; UI can probe /health for live check
      url: AGENT_API_URL,
      domain: new URL(AGENT_API_URL).hostname,
      provider: 'cloudflare',
      hasAuthToken: true, // Not relevant for Cloudflare, but keeps UI happy
    };
  }

  return {
    active: !!activeTunnel,
    url: activeTunnel?.url || null,
    domain: DOMAIN,
    provider: 'ngrok',
    hasAuthToken: !!process.env.NGROK_AUTHTOKEN,
  };
}
