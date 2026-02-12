/**
 * Agent API Tunnel Manager
 *
 * Manages an ngrok tunnel to expose the skill-validator microservice
 * (port 3200) via a public URL with a custom domain.
 *
 * Environment variables:
 *   NGROK_AUTHTOKEN     — ngrok auth token (required)
 *   VALIDATOR_URL        — skill-validator address (default: http://localhost:3200)
 *   AGENT_API_DOMAIN     — custom ngrok domain (default: agent-api.ateam-ai.com)
 */

let ngrokModule = null;
let activeTunnel = null; // { url, domain, listener }

const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:3200';
const DOMAIN = process.env.AGENT_API_DOMAIN || 'agent-api.ateam-ai.com';

/**
 * Lazily load the @ngrok/ngrok module.
 * Returns null if not installed (graceful degradation).
 */
async function getNgrok() {
  if (ngrokModule) return ngrokModule;
  try {
    ngrokModule = await import('@ngrok/ngrok');
    return ngrokModule;
  } catch {
    return null;
  }
}

/**
 * Start the ngrok tunnel.
 * No-op if already active. Returns tunnel info.
 *
 * @returns {Promise<{ url: string, domain: string }>}
 */
export async function startTunnel() {
  // Already running — return existing
  if (activeTunnel) {
    return { url: activeTunnel.url, domain: activeTunnel.domain };
  }

  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    throw new Error('NGROK_AUTHTOKEN environment variable is not set');
  }

  const ngrok = await getNgrok();
  if (!ngrok) {
    throw new Error('@ngrok/ngrok package is not installed. Run: npm install @ngrok/ngrok');
  }

  console.log(`[AgentAPI] Starting ngrok tunnel → ${VALIDATOR_URL} (domain: ${DOMAIN})`);

  const listener = await ngrok.default.forward({
    addr: VALIDATOR_URL,
    authtoken,
    domain: DOMAIN,
  });

  const url = listener.url();
  activeTunnel = { url, domain: DOMAIN, listener };

  console.log(`[AgentAPI] Tunnel active: ${url}`);
  return { url, domain: DOMAIN };
}

/**
 * Stop the ngrok tunnel.
 */
export async function stopTunnel() {
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
 *
 * @returns {{ active: boolean, url: string|null, domain: string }}
 */
export function getTunnelStatus() {
  return {
    active: !!activeTunnel,
    url: activeTunnel?.url || null,
    domain: DOMAIN,
    hasAuthToken: !!process.env.NGROK_AUTHTOKEN,
  };
}
