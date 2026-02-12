/**
 * Agent API routes
 *
 * Manage the ngrok tunnel that exposes the skill-validator
 * (External Agent API) to the public internet.
 *
 * GET    /api/agent-api/status  — Current tunnel status
 * POST   /api/agent-api/tunnel  — Start the tunnel
 * DELETE /api/agent-api/tunnel  — Stop the tunnel
 */

import { Router } from 'express';
import { startTunnel, stopTunnel, getTunnelStatus } from '../services/agentApiTunnel.js';

const router = Router();

/**
 * GET /status — current tunnel status
 */
router.get('/status', (_req, res) => {
  res.json(getTunnelStatus());
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

export default router;
