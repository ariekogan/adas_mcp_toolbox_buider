/**
 * ADAS Skill Validator — Standalone Microservice
 *
 * Validates skill and solution definitions via HTTP API.
 * Works out of the box with same env vars as the Toolbox Builder.
 *
 * Endpoints:
 *   POST /validate/skill     — 5-stage skill validation
 *   POST /validate/solution   — Cross-skill contracts + LLM quality scoring
 *   GET  /health              — Health check
 */

import express from 'express';
import cors from 'cors';
import validateRoutes from './routes/validate.js';

const app = express();
const PORT = process.env.VALIDATOR_PORT || 3200;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/', validateRoutes);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[Validator] Error:', err.message);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`[Validator] ADAS Skill Validator running on port ${PORT}`);
  console.log(`[Validator] Endpoints:`);
  console.log(`  POST /validate/skill`);
  console.log(`  POST /validate/solution`);
  console.log(`  GET  /health`);
});
