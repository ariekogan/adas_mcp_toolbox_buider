/**
 * ADAS External Agent API
 *
 * A single service that lets any external AI agent learn, build, validate,
 * and deploy ADAS multi-agent solutions.
 *
 * Golden Path: External Agent → Skill Builder → ADAS Core
 *
 * All deploy routes proxy through the Skill Builder backend, which:
 *   - Stores solutions/skills/connectors (visible in Skill Builder UI)
 *   - Auto-generates Python MCP servers from skill tool definitions
 *   - Pushes everything to ADAS Core
 *
 * External agents do NOT need to provide slugs or Python MCP code for skills.
 * Only connector implementations (real business logic) need to be written.
 *
 * Spec (learn):
 *   GET  /spec                      — API index + deploy body documentation
 *   GET  /spec/enums                — All ADAS enum values
 *   GET  /spec/skill                — Complete skill specification
 *   GET  /spec/solution             — Complete solution specification
 *   GET  /spec/examples             — Example index
 *   GET  /spec/examples/skill       — Complete validated skill example
 *   GET  /spec/examples/connector   — Standard MCP connector example
 *   GET  /spec/examples/connector-ui — UI-capable connector example
 *   GET  /spec/examples/solution    — Full multi-skill solution example + deploy body
 *
 * Validate (check):
 *   POST /validate/skill            — 5-stage skill validation
 *   POST /validate/solution         — Cross-skill contracts + LLM quality scoring
 *
 * Deploy (ship) — all routes proxy through Skill Builder:
 *   POST /deploy/connector          — Register + connect connector via Skill Builder
 *   POST /deploy/skill              — Import skill definition via Skill Builder
 *   POST /deploy/solution           — Import + deploy full solution via Skill Builder
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
  console.log(`  POST /deploy/connector           — Deploy connector via Skill Builder`);
  console.log(`  POST /deploy/skill               — Deploy skill via Skill Builder`);
  console.log(`  POST /deploy/solution            — Deploy solution via Skill Builder`);
  console.log(`  GET  /deploy/solutions           — List all solutions`);
  console.log(`  GET  /deploy/status/:solutionId  — Aggregated deploy status`);
  console.log(`  DELETE /deploy/solutions/:id      — Remove a solution`);
  console.log(`  GET  /deploy/solutions/:id/definition — Read back solution definition`);
  console.log(`  GET  /deploy/solutions/:id/skills     — List skills in a solution`);
  console.log(`  GET  /deploy/solutions/:id/skills/:sk — Read back a skill definition`);
  console.log(`  PATCH /deploy/solutions/:id           — Update solution incrementally`);
  console.log(`  PATCH /deploy/solutions/:id/skills/:sk — Update skill incrementally`);
  console.log(`  POST /deploy/solutions/:id/skills/:sk/redeploy — Re-deploy after PATCH`);
  console.log(`  DELETE /deploy/solutions/:id/skills/:sk — Delete a single skill`);
  console.log(`  GET  /deploy/solutions/:id/validate     — Validate from stored state`);
  console.log(`  GET  /deploy/solutions/:id/skills/:sk/validate — Validate skill`);
  console.log(`  GET  /deploy/solutions/:id/connectors/health — Connector health`);
  console.log(`  GET  /deploy/solutions/:id/skills/:sk/conversation — Skill chat history`);
  console.log(`  GET  /deploy/solutions/:id/health — Live health check`);
  console.log(`  POST /deploy/solutions/:id/chat   — Solution Bot chat`);
  console.log(`  POST /deploy/solutions/:id/redeploy — Bulk re-deploy all skills`);
  console.log(`  POST /deploy/solutions/:id/skills — Add skill to existing solution`);
  console.log(`  GET  /deploy/solutions/:id/export — Export solution bundle`);
  console.log(`  GET  /health                     — Health check`);
});
