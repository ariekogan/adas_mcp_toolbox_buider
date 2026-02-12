/**
 * ADAS External Agent API
 *
 * A single service that lets any external AI agent learn, build, validate,
 * and deploy ADAS multi-agent solutions.
 *
 * Spec (learn):
 *   GET  /spec                      — API index
 *   GET  /spec/enums                — All ADAS enum values
 *   GET  /spec/skill                — Complete skill specification
 *   GET  /spec/solution             — Complete solution specification
 *   GET  /spec/examples             — Example index
 *   GET  /spec/examples/skill       — Complete validated skill example
 *   GET  /spec/examples/connector   — Standard MCP connector example
 *   GET  /spec/examples/connector-ui — UI-capable connector example
 *   GET  /spec/examples/solution    — Full multi-skill solution example
 *
 * Validate (check):
 *   POST /validate/skill            — 5-stage skill validation
 *   POST /validate/solution         — Cross-skill contracts + LLM quality scoring
 *
 * Deploy (ship):
 *   POST /deploy/connector          — Deploy connector to ADAS Core
 *   POST /deploy/skill              — Deploy skill MCP to ADAS Core
 *   POST /deploy/solution           — Deploy full solution to ADAS Core
 *
 *   GET  /health                    — Health check
 */

import express from 'express';
import cors from 'cors';
import apiKeyAuth from './middleware/apiKeyAuth.js';
import validateRoutes from './routes/validate.js';
import specRoutes from './routes/spec.js';
import examplesRoutes from './routes/examples.js';
import deployRoutes from './routes/deploy.js';

const app = express();
const PORT = process.env.VALIDATOR_PORT || 3200;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API key authentication (skips GET /health)
app.use(apiKeyAuth);

// Routes
app.use('/', validateRoutes);
app.use('/spec', specRoutes);
app.use('/spec/examples', examplesRoutes);
app.use('/deploy', deployRoutes);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[Validator] Error:', err.message);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`[ADAS Agent API] Running on port ${PORT}`);
  console.log(`[ADAS Agent API] Endpoints:`);
  console.log(`  GET  /spec                       — API index`);
  console.log(`  GET  /spec/enums                 — Enum values`);
  console.log(`  GET  /spec/skill                 — Skill specification`);
  console.log(`  GET  /spec/solution              — Solution specification`);
  console.log(`  GET  /spec/examples              — Example index`);
  console.log(`  GET  /spec/examples/skill        — Skill example`);
  console.log(`  GET  /spec/examples/connector    — Connector example`);
  console.log(`  GET  /spec/examples/connector-ui — UI connector example`);
  console.log(`  GET  /spec/examples/solution     — Solution example`);
  console.log(`  POST /validate/skill             — Validate skill`);
  console.log(`  POST /validate/solution          — Validate solution`);
  console.log(`  POST /deploy/connector           — Deploy connector`);
  console.log(`  POST /deploy/skill               — Deploy skill`);
  console.log(`  POST /deploy/solution            — Deploy solution`);
  console.log(`  GET  /health                     — Health check`);
});
