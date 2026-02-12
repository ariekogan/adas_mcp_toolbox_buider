/**
 * Agent API routes
 *
 * Manage the ngrok tunnel that exposes the skill-validator
 * (External Agent API) to the public internet, and manage
 * per-tenant API keys for authentication.
 *
 * GET    /api/agent-api/status      — Current tunnel status + API key
 * POST   /api/agent-api/tunnel      — Start the tunnel
 * DELETE /api/agent-api/tunnel      — Stop the tunnel
 * GET    /api/agent-api/key         — Get or create API key for current tenant
 * POST   /api/agent-api/key/rotate  — Rotate API key for current tenant
 */

import { Router } from 'express';
import { startTunnel, stopTunnel, getTunnelStatus } from '../services/agentApiTunnel.js';
import agentApiKeyStore from '../store/agentApiKeyStore.js';

const router = Router();

/**
 * GET /status — current tunnel status + API key
 */
router.get('/status', async (_req, res) => {
  try {
    const status = getTunnelStatus();
    const apiKey = await agentApiKeyStore.getOrCreateKey();
    res.json({ ...status, apiKey });
  } catch (err) {
    console.error('[AgentAPI] Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /tunnel — start the ngrok tunnel
 */
router.post('/tunnel', async (req, res) => {
  try {
    const result = await startTunnel();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[AgentAPI] Start tunnel error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /tunnel — stop the ngrok tunnel
 */
router.delete('/tunnel', async (_req, res) => {
  try {
    await stopTunnel();
    res.json({ ok: true });
  } catch (err) {
    console.error('[AgentAPI] Stop tunnel error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /key — get or create API key for current tenant
 */
router.get('/key', async (_req, res) => {
  try {
    const apiKey = await agentApiKeyStore.getOrCreateKey();
    res.json({ apiKey });
  } catch (err) {
    console.error('[AgentAPI] Get key error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /key/rotate — rotate API key for current tenant
 */
router.post('/key/rotate', async (_req, res) => {
  try {
    const apiKey = await agentApiKeyStore.rotateKey();
    res.json({ apiKey });
  } catch (err) {
    console.error('[AgentAPI] Rotate key error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
