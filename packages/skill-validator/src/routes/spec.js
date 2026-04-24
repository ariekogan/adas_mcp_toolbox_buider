/**
 * A-Team Specification API routes
 *
 * Serves the complete A-Team multi-agent specification as structured JSON
 * so that any external agent (LLM, CI tool, IDE plugin) can understand
 * how to build valid A-Team skills and solutions.
 *
 * GET /spec           — Index of spec endpoints
 * GET /spec/enums     — All enum values
 * GET /spec/skill     — Complete skill specification
 * GET /spec/solution  — Complete solution specification
 */

import { Router } from 'express';
import { PHASES, PHASE_LABELS } from '../types/DraftSkill.js';
import { VALID_DATA_TYPES, VALID_TRIGGER_TYPES, VALID_TRIGGER_SCOPES, VALID_PHASES } from '../validators/schemaValidator.js';
import { VALID_CLASSIFICATIONS, VALID_RISK_LEVELS, VALID_EFFECTS, HIGH_RISK_CLASSIFICATIONS } from '../validators/securityValidator.js';
import { SYSTEM_TOOL_PREFIXES } from '../validators/referenceResolver.js';
import { DIMENSION_WEIGHTS, GRADE_THRESHOLDS } from '../validators/solutionQualityValidator.js';
import { ALL_COVERAGE, COVERAGE_GAPS } from '../validators/coverage.js';

const router = Router();
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=86400' };

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM CONNECTORS — fetched dynamically from Core at startup
// ═══════════════════════════════════════════════════════════════════════════

const PLATFORM_CONNECTOR_META = {
  'memory-mcp':            { transport: 'http', port: 7306, description: 'Persistent cognitive memory engine — every solution gets a built-in long-term brain per user. Semantic recall, deduplication, contradiction detection, automatic extraction, decay, compaction. Per-user isolated. See memory_engine spec section for full capabilities.' },
  'whatsapp-mcp':          { transport: 'http', port: 7305, description: 'WhatsApp Business messaging — send/receive messages, check connection, pair devices. Per-actor sessions.', ui_plugins: ['whatsapp-setup'] },
  'telegram-mcp':          { transport: 'http', port: 7302, description: 'Telegram messaging — send messages, manage webhooks for inbound.' },
  'gmail-mcp':             { transport: 'http', port: 7301, description: 'Gmail integration — send, read, search, archive, trash, label emails. OAuth-based.' },
  'mobile-device-mcp':     { transport: 'http', port: 7304, description: 'Mobile device bridge — calendar, contacts, location, weather, battery, notifications, DND, navigation. Data from mobile app relay.' },
  'handoff-controller-mcp':{ transport: 'http', port: 7309, description: 'Skill-to-skill handoff orchestration — manages live conversation transfers with grant passing.' },
  'internal-comm-mcp':     { transport: 'http', port: 7303, description: 'Internal message queue — skill-to-skill async communication for voice replies and cross-skill coordination.' },
  'browser-mcp':           { transport: 'http', port: 7315, description: 'Browser automation — navigate, read, click, type, fill forms, take screenshots. Playwright-based headless Chromium. Use from connector code for web scraping and automation.', ui_plugins: ['browser-view'] },

  // ─── Document intelligence stack ──────────────────────────────────────
  // cloud-docs-mcp and docs-index-mcp work as a pair: cloud-docs connects
  // to the user\'s cloud provider (Dropbox, Google Drive, ...), docs-index-mcp
  // chunks + embeds + searches over any content ingested into it.
  // The `cloud.create_corpus` tool wires them together automatically.
  'docs-index-mcp':        {
    transport: 'http',
    port: 7311,
    description:
      'Source-agnostic document corpus retrieval. Chunks + embeds + cosine-searches user documents. Platform embedding-service powers the vectors (provider-agnostic). Storage is per-tenant Mongo + per-actor scoping.\n' +
      '\n' +
      'TYPICAL USE — if your document source is a cloud provider (Dropbox/GDrive), DO NOT use docs.corpus.create directly. Use cloud-docs-mcp\'s cloud.create_corpus({name, service_id, path}) instead — it creates the corpus here AND auto-wires background sync so docs.search stays fresh. Only call docs.corpus.create + docs.ingest.file directly when ingesting from a custom source that cloud-docs-mcp does not cover.\n' +
      '\n' +
      'KEY TOOLS:\n' +
      '  docs.search({corpus_id?, query, top_k})        → top-k chunks with {text, path, heading_path, score}\n' +
      '  docs.answer({query, corpus_id?})               → LLM-backed RAG answer with citations\n' +
      '  docs.corpus.list() / docs.corpus.get(id)       → inspect corpora\n' +
      '  docs.stats({corpus_id?})                       → ingestion stats\n' +
      '  docs.file.get({file_id})                       → full file text + chunks\n' +
      '\n' +
      'SUPPORTED FILE TYPES: text/* (plain, markdown, html, csv, json, xml), PDF, DOCX, common code files. Others are skipped with a reason.',
  },

  'cloud-docs-mcp':        {
    transport: 'http',
    port: 7312,
    description:
      'Unified cloud document source — one connector, multiple providers. Current adapters: Dropbox, Google Drive. Authentication is delegated to platform.auth (OAuth tokens are stored there; cloud-docs NEVER runs its own OAuth flow). Users connect via platform.auth.ensureConnected({service_id: "dropbox"|"google_drive"}).\n' +
      '\n' +
      'TYPICAL FLOW (skill creates a searchable corpus from user\'s Dropbox):\n' +
      '  1. platform.auth.ensureConnected({service_id:"dropbox"})  — user links their account\n' +
      '  2. cloud.create_corpus({name, service_id:"dropbox", path:"/Contracts"}) — creates corpus in docs-index-mcp, wires auto-sync, triggers initial walk\n' +
      '  3. docs.search({corpus_id, query}) — returns chunks; fresh-sync happens in the background (cooldown 15 min)\n' +
      '\n' +
      'KEY TOOLS:\n' +
      '  cloud.list_services()                          → which providers are enabled\n' +
      '  cloud.list_folder({service_id, path, cursor})  → directory listing\n' +
      '  cloud.get_metadata({service_id, path})         → size, modified, mime\n' +
      '  cloud.download({service_id, path})             → {content_base64, size, mime, name}\n' +
      '  cloud.upload({service_id, path, artifact_hash, mode})  → push a CAS artifact to cloud (Dropbox write scope required)\n' +
      '  cloud.walk({service_id, path, max_files})      → recursive file iterator (initial ingest)\n' +
      '  cloud.list_changes({service_id, cursor})       → delta sync using provider cursor\n' +
      '  cloud.create_corpus({name, service_id, path})  → one-shot: corpus + sync wiring + initial walk\n' +
      '\n' +
      'DO NOT call cloud.download + docs.ingest.file manually when cloud.create_corpus covers your use case — the latter wires the sync webhook so every subsequent docs.search auto-refreshes the corpus.',
  },
};

let _platformConnectors = {};
let _platformConnectorsTs = 0;
const PLATFORM_CACHE_TTL = 10 * 60_000; // 10 minutes

async function getPlatformConnectors() {
  if (_platformConnectorsTs && Date.now() - _platformConnectorsTs < PLATFORM_CACHE_TTL) {
    return _platformConnectors;
  }
  const CORE_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || 'http://ai-dev-assistant-backend-1:4000';
  const SECRET = process.env.CORE_MCP_SECRET || process.env.MCP_SHARED_SECRET || '';
  const result = {};
  for (const [id, meta] of Object.entries(PLATFORM_CONNECTOR_META)) {
    try {
      const resp = await fetch(`${CORE_URL}/api/connectors/${id}/tools`, {
        headers: { 'x-adas-token': SECRET, 'X-ADAS-TENANT': 'mobile-pa' },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const schemas = data.toolSchemas || [];
        const tools = schemas
          .filter(t => !t.name.startsWith('ui.'))  // exclude ui.listPlugins, ui.getPlugin (internal)
          .map(t => ({
            name: t.name,
            description: t.description || '',
            inputs: Object.entries(t.inputSchema?.properties || {})
              .filter(([k]) => !k.startsWith('_adas_'))  // exclude internal params
              .map(([k, v]) => ({ name: k, type: v.type || 'string', description: v.description || '', required: (t.inputSchema?.required || []).includes(k) })),
          }));
        result[id] = { ...meta, tools, status: data.connected ? 'connected' : 'disconnected' };
      } else {
        result[id] = { ...meta, tools: [] };
      }
    } catch (err) {
      result[id] = { ...meta, tools: [] };
    }
  }
  _platformConnectors = result;
  _platformConnectorsTs = Date.now();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD RESPONSES AT MODULE LOAD (static data — compute once)
// ═══════════════════════════════════════════════════════════════════════════

const ENUMS = buildEnums();
const SKILL_SPEC = buildSkillSpec();
const SOLUTION_SPEC = buildSolutionSpec();
const WORKFLOWS = buildWorkflows();
const MOBILE_CONNECTOR_SPEC = buildMobileConnectorSpec();
const UI_PLUGINS_SPEC = buildUIPluginsSpec();
const MULTI_USER_CONNECTOR_SPEC = buildMultiUserConnectorSpec();
const INDEX = buildIndex();

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/', (_req, res) => res.set(CACHE_HEADERS).json(INDEX));
router.get('/enums', (_req, res) => res.set(CACHE_HEADERS).json(ENUMS));
router.get('/skill', (req, res) => {
  const search = req.query.search;
  const section = req.query.section;
  let result = SKILL_SPEC;
  if (section && SKILL_SECTIONS[section]) {
    result = SKILL_SECTIONS[section];
  }
  if (search) {
    result = filterBySearch(result, search.toLowerCase());
  }
  res.set(CACHE_HEADERS).json(result);
});
router.get('/solution', async (req, res) => {
  const search = req.query.search;
  let result = { ...SOLUTION_SPEC };
  // Inject live platform connector tools
  try {
    const liveConnectors = await getPlatformConnectors();
    if (result.schema?.platform_connectors_reference) {
      result = JSON.parse(JSON.stringify(result)); // deep clone
      result.schema.platform_connectors_reference.connectors = liveConnectors;
    }
  } catch {}
  if (search) {
    result = filterBySearch(result, search.toLowerCase());
  }
  res.set(CACHE_HEADERS).json(result);
});
router.get('/workflows', (_req, res) => res.set(CACHE_HEADERS).json(WORKFLOWS));
router.get('/mobile-connector', (_req, res) => res.set(CACHE_HEADERS).json(MOBILE_CONNECTOR_SPEC));
router.get('/ui-plugins', (_req, res) => res.set(CACHE_HEADERS).json(UI_PLUGINS_SPEC));
router.get('/multi-user-connector', (_req, res) => res.set(CACHE_HEADERS).json(MULTI_USER_CONNECTOR_SPEC));

// Platform SDK — runtime API reference for custom connectors and skills
router.get('/sdk', (_req, res) => res.set(CACHE_HEADERS).json({
  name: '@ateam/sdk',
  version: '1.0.0',
  description: 'Runtime SDK for A-Team platform. Use from custom connectors and skill code to access platform capabilities cleanly.',
  install: 'npm install @ateam/sdk',
  quick_start: `import { platform, context, memory, progress, log, llm } from "@ateam/sdk";

// Call any platform connector
const page = await platform.callTool("browser-mcp", "web.navigate", { url: "https://example.com" });

// Current execution context
const tenant = context.tenant();            // "mobile-pa"
const actorId = context.actorId();           // "278d0d74-..."
const full = await context.get();            // { tenant, actorId, actor, jobId, skillSlug }
context.rejectSystemActor();                 // throws if not a real user

// Memory shortcuts
await memory.store({ type: "preference", content: "Prefers window seats" });
const hits = await memory.recall("seats");
const profile = await memory.profile();
await memory.profileSet("phone", "+972544567033");

// Progress events (visible in UI traces)
await progress.emit("Scraping page 3", { step: 3, total: 7 });

// Structured logging
log.info("starting request", { url });
log.error("request failed", { err: err.message });

// Platform LLM (fast tier)
const res = await llm.call({ prompt: "Summarize: ...", max_tokens: 200 });`,
  env_vars: {
    description: 'Platform injects these into every connector process automatically. Do NOT set them yourself.',
    ADAS_SDK_URL: 'Platform MCP gateway URL (e.g. http://backend:4000/mcp)',
    ADAS_MCP_TOKEN: 'Shared secret for platform auth',
    ADAS_TENANT: 'Current tenant name',
    ADAS_ACTOR_ID: 'Current actor ID (may be empty for system calls)',
    ADAS_CONNECTOR_ID: 'Your connector\u2019s ID (used by logging)',
    'PLATFORM_<CONNECTOR>_URL': 'Per-platform-connector URLs (e.g. PLATFORM_BROWSER_MCP_URL). Use these to bypass the gateway if needed.',
  },
  modules: {
    platform: {
      'callTool(connector, tool, args)': 'Call any platform connector\u2019s tool. Auto-injects tenant/actor.',
      'mcpCall(toolName, args, opts?)': 'Low-level MCP JSON-RPC call. Most users want callTool().',
    },
    context: {
      'tenant()': 'Current tenant (from env, synchronous)',
      'actorId()': 'Current actor ID (from env, synchronous)',
      'get()': 'Async: full context { tenant, actorId, actor, jobId, skillSlug }',
      'isSystemActor(id)': 'True for synthetic actors (default, trigger-runner, test, ...)',
      'rejectSystemActor()': 'Throw if current actor is synthetic \u2014 use before per-user operations',
    },
    memory: {
      'store(args)': 'Store a memory (preference, fact, instruction, rule, user_model)',
      'recall(query, opts?)': 'Keyword search',
      'list(opts?)': 'List memories with type/limit filters',
      'profile()': 'Full user profile bundle',
      'profileSet(field, value)': 'Set a structured profile field (name, phone, email, ...)',
      'update(id, patch)': 'Update a memory',
      'remove(id)': 'Delete a memory',
    },
    progress: {
      'emit(message, opts?)': 'Emit a progress event to the current job\u2019s SSE feed. opts: { step, total, data }',
    },
    log: {
      'info(msg, data?)': 'Log at info level with [connector-id] prefix',
      'warn(msg, data?)': 'Log at warn level',
      'error(msg, data?)': 'Log at error level (stderr)',
      'debug(msg, data?)': 'Log at debug level',
    },
    llm: {
      'call({ prompt, system?, max_tokens?, temperature?, caller? })': 'Call platform fast LLM',
    },
  },
  mcp_contract: {
    description: 'The SDK is a thin client over these MCP tools exposed by the platform. You can call them directly via JSON-RPC for language-agnostic access (Python, Rust, etc.).',
    endpoint: 'POST ${ADAS_SDK_URL}',
    wire_format: 'JSON-RPC 2.0',
    tools: [
      'platform.callTool(connector, tool, args) \u2014 proxy to any platform connector',
      'platform.context.get() \u2014 { tenant, actorId, actor, jobId, skillSlug }',
      'platform.progress.emit(message, step?, total?, data?) \u2014 emit progress event',
      'platform.dataStore.set(key, value, ttl_seconds?) \u2014 raw key-value store per actor (for structured data like cookies, tokens, cached API responses). Separate from memory-mcp. Optional TTL for auto-expiry.',
      'platform.dataStore.get(key) \u2014 retrieve raw value by exact key. JSON values auto-parsed.',
      'platform.dataStore.delete(key) \u2014 delete a key-value pair',
      'platform.dataStore.list(prefix?, limit?) \u2014 list stored keys, optionally filtered by prefix',
      'sys.llm(prompt, system?, max_tokens?, ...) \u2014 platform LLM',
    ],
  },
  related_specs: [
    '/spec/platform-connectors \u2014 available connectors + tools',
    '/spec/solution \u2014 solution definition reference',
    '/spec/skill \u2014 skill definition reference',
  ],
}));

// Live platform connector catalog with tool schemas
router.get('/platform-connectors', async (_req, res) => {
  try {
    const connectors = await getPlatformConnectors();
    res.set(CACHE_HEADERS).json({
      description: 'Platform connectors — pre-built, shared across all tenants. Add to skill.connectors[] to use.',
      inter_connector_calling: {
        summary: 'Custom connectors can call platform connectors through the Core MCP gateway. This is the recommended pattern for connector-to-connector communication.',
        gateway_url: 'Use env var ADAS_MCP_GATEWAY_URL (injected automatically) or default: http://backend:4000/mcp',
        auth: 'Include x-adas-token header with ADAS_MCP_TOKEN env var (injected automatically)',
        tenant: 'Include x-adas-tenant header with ADAS_TENANT env var (injected automatically)',
        wire_format: 'JSON-RPC 2.0',
        example: {
          description: 'Call browser-mcp:web.read from inside a custom connector',
          code: `const CORE_URL = process.env.ADAS_MCP_GATEWAY_URL || process.env.ADAS_CORE_URL || "http://backend:4000";
const TOKEN = process.env.ADAS_MCP_TOKEN || "";
const TENANT = process.env.ADAS_TENANT || "";

async function callPlatformTool(toolName, args) {
  const res = await fetch(CORE_URL + "/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-adas-tenant": TENANT,
      "x-adas-token": TOKEN,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: Date.now(),
      params: { name: toolName, arguments: args },
    }),
  });
  const data = await res.json();
  return data?.result?.content?.[0]?.text
    ? JSON.parse(data.result.content[0].text)
    : data?.result;
}

// Usage: const page = await callPlatformTool("web.read", { url: "https://example.com" });`,
        },
        injected_env_vars: {
          ADAS_MCP_GATEWAY_URL: 'Core MCP gateway URL (recommended for inter-connector calls)',
          ADAS_MCP_TOKEN: 'Shared secret for authenticating to Core',
          ADAS_TENANT: 'Current tenant name',
          ADAS_CORE_URL: 'Core API base URL (legacy, same as gateway but without /mcp suffix)',
        },
      },
      connectors,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// SKILL SPEC SECTIONS — named slices for targeted retrieval
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_SECTIONS = buildSkillSections();

function buildSkillSections() {
  const schema = SKILL_SPEC.schema || {};
  return {
    engine: {
      _section: 'engine',
      description: 'AI model, reasoning config, and planner tool budget optimization (bootstrap_tools pinning, prefetch_tools pre-loading, exclude_bootstrap_tools).',
      engine: schema.engine,
      bootstrap_tools: schema.bootstrap_tools,
      prefetch_tools: schema.prefetch_tools,
      exclude_bootstrap_tools: schema.exclude_bootstrap_tools,
    },
    tools: {
      _section: 'tools',
      description: 'Tool definitions, meta tools, bootstrap tool pinning, prefetch tool pre-loading.',
      tools: schema.tools,
      meta_tools: schema.meta_tools,
      bootstrap_tools: schema.bootstrap_tools,
      prefetch_tools: schema.prefetch_tools,
    },
    intents: {
      _section: 'intents',
      description: 'Intent definitions, examples, and routing.',
      intents: schema.intents,
      problem: schema.problem,
      scenarios: schema.scenarios,
    },
    policy: {
      _section: 'policy',
      description: 'Policy, access control, grants, response filters, and workflows.',
      policy: schema.policy,
      access_policy: schema.access_policy,
      grant_mappings: schema.grant_mappings,
      response_filters: schema.response_filters,
    },
    triggers: {
      _section: 'triggers',
      description: 'Automation triggers (static schedules and dynamic sys.trigger).',
      triggers: schema.triggers,
    },
    connectors: {
      _section: 'connectors',
      description: 'Connector linking, channels, and skill identity.',
      connectors: schema.connectors,
      channels: schema.channels,
      skill_identity: schema.skill_identity,
    },
    role: {
      _section: 'role',
      description: 'Agent persona, goals, limitations, communication style.',
      role: schema.role,
      glossary: schema.glossary,
    },
    template: {
      _section: 'template',
      description: 'Minimal and full skill templates for quick start.',
      auto_expand: SKILL_SPEC.auto_expand,
      template: SKILL_SPEC.template,
    },
    guide: {
      _section: 'guide',
      description: 'Agent guide, build steps, common mistakes, and key concepts.',
      agent_guide: SKILL_SPEC.agent_guide,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH — recursively filter JSON tree to branches containing search term
// ═══════════════════════════════════════════════════════════════════════════

function filterBySearch(obj, term) {
  if (obj === null || obj === undefined) return undefined;

  if (typeof obj === 'string') {
    return obj.toLowerCase().includes(term) ? obj : undefined;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj).toLowerCase().includes(term) ? obj : undefined;
  }

  if (Array.isArray(obj)) {
    const filtered = obj.filter(item => {
      if (typeof item === 'string') return item.toLowerCase().includes(term);
      if (typeof item === 'object' && item !== null) return filterBySearch(item, term) !== undefined;
      return String(item).toLowerCase().includes(term);
    });
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof obj === 'object') {
    const result = {};
    let hasMatch = false;
    for (const [key, value] of Object.entries(obj)) {
      // Key match — include the entire subtree
      if (key.toLowerCase().includes(term)) {
        result[key] = value;
        hasMatch = true;
        continue;
      }
      // Recurse into value
      const filtered = filterBySearch(value, term);
      if (filtered !== undefined) {
        result[key] = filtered;
        hasMatch = true;
      }
    }
    return hasMatch ? result : undefined;
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildIndex() {
  return {
    service: '@adas/skill-validator',
    version: '1.0.0',
    description: 'A-Team External Agent API — learn, build, validate, and deploy A-Team multi-agent solutions',
    getting_started: [
      '1. GET /spec/skill — read the skill specification (note the auto_expand section for minimal definitions)',
      '2. GET /spec/examples/skill — study a complete working example',
      '3. Build your skill definition — define only what is unique (problem, tools, guardrails). The platform auto-generates intents, workflows, scenarios, and role when you validate or deploy.',
      '4. POST /validate/skill — validate and fix errors',
      '5. GET /spec/solution — read the solution specification when ready to compose skills',
      '6. POST /validate/solution — validate the full solution',
      '7. POST /deploy/solution — deploy everything to A-Team Core (the Skill Builder auto-generates MCP servers from your tool definitions — no slug or Python code needed)',
      '8. GET /deploy/solutions/:id/definition — read back the deployed solution to verify',
      '9. GET /deploy/solutions/:id/skills/:skillId — read back individual skills to verify',
      '10. PATCH /deploy/solutions/:id/skills/:skillId — update skills incrementally (tools_push, tools_delete, etc.) without re-deploying everything',
      '11. POST /deploy/solutions/:id/skills/:skillId/redeploy — after PATCH, redeploy just that skill (regenerates MCP server, pushes to A-Team Core)',
      '--- Operate & Debug ---',
      '12. POST /deploy/solutions/:id/skills/:skillId/test — test a skill (sync: wait for result, or async: true to get job_id immediately)',
      '13. POST /deploy/solutions/:id/skills/:skillId/test-pipeline — test decision pipeline only (intent + planning, NO tool execution). Returns intent classification, first planned action, and timing.',
      '14. GET /deploy/solutions/:id/skills/:skillId/test/:jobId — poll async test progress (iteration, steps, result)',
      '15. DELETE /deploy/solutions/:id/skills/:skillId/test/:jobId — abort a running test',
      '16. GET /deploy/solutions/:id/logs — view execution logs (job traces, tool calls, errors)',
      '17. GET /deploy/solutions/:id/metrics — analyze execution metrics (timing, bottlenecks, signals)',
      '18. GET /deploy/solutions/:id/diff — compare Builder definitions vs what is deployed in Core',
      '19. GET /deploy/solutions/:id/connectors/:connectorId/source — inspect connector source code',
      '--- Voice Testing ---',
      '20. POST /deploy/voice-test — simulate a voice conversation (text-based E2E test). Send { messages: ["Hello", "Acme", "Check vehicle 7"], phone_number?: "+14155551234" }. Returns full conversation with verification status, tool calls, and skill results.',
      '--- GitHub Version Control (dev/main branching) ---',
      '21. Every successful deploy auto-pushes to a "dev" branch in GitHub (tenant--solution-id) with a date-based version tag (dev-YYYY-MM-DD-NNN). GitHub push is ASYNC — deploy responds immediately, push happens in background.',
      '22. The "main" branch is production. Promote tested dev versions to main via POST /deploy/solutions/:id/promote. This gives you manual control over production releases.',
      '23. GET /deploy/solutions/:id/github/status — check repo existence, latest commit, verify background push completed',
      '24. GET /deploy/solutions/:id/github/log — view commit history',
      '25. GET /deploy/solutions/:id/github/read?path=connectors/my-mcp/server.js — read a file from repo',
      '26. PATCH /deploy/solutions/:id/github/patch — edit files in repo (single or multi-file). Body: { files: [{ path, content }] } or { path, content } for single file',
      '27. POST /deploy/solutions/:id/github/pull-connectors — pull connector source from GitHub repo as mcp_store format (for github-first deploys)',
      '--- Version Management ---',
      '28. GET /deploy/solutions/:id/versions/dev — list all available dev versions (tags) with dates and commit SHAs',
      '29. POST /deploy/solutions/:id/promote — promote latest (or specific) dev version to main. Creates prod-YYYY-MM-DD-NNN tag on main.',
      '30. POST /deploy/solutions/:id/rollback — rollback main to a previous production tag. Body: { tag: "prod-YYYY-MM-DD-001", confirm: true }. DESTRUCTIVE — use with caution.',
      '--- GitHub-First Iteration Loop ---',
      '31. After the first deploy, iterate on connector code via GitHub: PATCH /deploy/solutions/:id/github/patch to edit code → POST /deploy/solution with github:true to redeploy from repo (no inline mcp_store needed)',
      '32. IMPORTANT: Each connector has INDEPENDENT source code. To add a feature to multiple connectors, read and patch EACH connector separately. Use GET /deploy/solutions/:id/connectors/:connectorId/source to read current code before patching.',
    ],
    endpoints: {
      '/spec/enums': {
        method: 'GET',
        description: 'All A-Team enum values in a flat lookup (phases, data types, classifications, tones, etc.)',
      },
      '/spec/skill': {
        method: 'GET',
        description: 'Complete A-Team skill specification: schema, validation rules, system tools, agent guide, and template',
      },
      '/spec/solution': {
        method: 'GET',
        description: 'Complete A-Team solution specification: multi-skill architecture, grant economy, handoffs, routing, security contracts, agent guide, and template',
      },
      '/spec/workflows': {
        method: 'GET',
        description: 'Builder workflows — the step-by-step state machines for building skills and solutions. Use this to guide users through the build process.',
      },
      '/spec/mobile-connector': {
        method: 'GET',
        description: 'Mobile connector specification — build functional connectors (background services) for ateam-mobile. Access device capabilities via Native Bridge SDK.',
      },
      '/spec/ui-plugins': {
        method: 'GET',
        description: 'UI Plugins specification — build interactive dashboards for web (iframe) and mobile (React Native). Covers render modes, plugin SDK, bundle pipeline, and deployment.',
      },
      '/spec/multi-user-connector': {
        method: 'GET',
        description: 'Multi-user connector guide — how to build connectors that isolate data per user (actor). Covers HTTP vs stdio transport, actor context propagation, and complete code examples.',
      },
      '/spec/platform-connectors': {
        method: 'GET',
        description: 'Platform connector catalog — live tool schemas for all built-in connectors (memory, browser, gmail, whatsapp, etc.). Includes inter-connector calling pattern with complete code example.',
      },
      '/spec/sdk': {
        method: 'GET',
        description: '@ateam/sdk runtime API reference — platform, context, memory, progress, log, llm modules. Used by custom connectors and skill code to access platform capabilities.',
      },
      '/spec/examples': {
        method: 'GET',
        description: 'Index of complete, runnable examples (skill, connector, connector-ui, solution)',
      },
      '/spec/examples/skill': {
        method: 'GET',
        description: 'Complete "Order Support Agent" skill that passes all 5 validation stages',
      },
      '/spec/examples/connector': {
        method: 'GET',
        description: 'Standard stdio MCP connector for order management',
      },
      '/spec/examples/connector-ui': {
        method: 'GET',
        description: 'UI-capable connector with dashboard plugins (ui_capable: true)',
      },
      '/spec/examples/solution': {
        method: 'GET',
        description: 'Full "E-Commerce Customer Service" solution — 3 skills, grants, handoffs, routing',
      },
    },
    also_available: {
      'POST /validate/skill': 'Validate a single skill definition (5-stage pipeline)',
      'POST /validate/solution': 'Validate a solution (cross-skill contracts + LLM quality scoring)',
      'POST /deploy/mcp-store/:connectorId': 'Pre-upload large connector source files (e.g., dist bundles). They are auto-merged into the next POST /deploy/solution. Body: { files: [{ path, content }] }',
      'GET /deploy/mcp-store': 'List all pre-staged connector files',
      'DELETE /deploy/mcp-store/:connectorId': 'Remove pre-staged files for a connector',
      'POST /deploy/connector': 'Deploy a connector via Skill Builder → A-Team Core',
      'POST /deploy/skill': 'Deploy a single skill via Skill Builder (requires solution_id)',
      'POST /deploy/solution': 'Deploy a full solution via Skill Builder → A-Team Core (identity + connectors + skills). No slug or Python MCP code needed.',
      'GET /deploy/solutions': 'List all solutions stored in the Skill Builder',
      'GET /deploy/status/:solutionId': 'Get aggregated deploy status — skills, connectors, A-Team Core health',
      'DELETE /deploy/solutions/:solutionId': 'Remove a solution from the Skill Builder',
      'GET /deploy/solutions/:solutionId/definition': 'Read back the full solution definition (identity, grants, handoffs, routing)',
      'GET /deploy/solutions/:solutionId/skills': 'List skills in a solution (summaries with original and internal IDs)',
      'GET /deploy/solutions/:solutionId/skills/:skillId': 'Read back a full skill definition (accepts original or internal skill ID)',
      'PATCH /deploy/solutions/:solutionId': 'Update solution definition incrementally (grants, handoffs, routing, identity)',
      'PATCH /deploy/solutions/:solutionId/skills/:skillId': 'Update a skill incrementally (tools, intents, policy, engine — accepts original or internal ID)',
      'POST /deploy/solutions/:solutionId/skills/:skillId/redeploy': 'Re-deploy a single skill after PATCH — regenerates MCP server and pushes to A-Team Core',
      'DELETE /deploy/solutions/:solutionId/skills/:skillId': 'Remove a single skill from a solution (accepts original or internal ID)',
      'DELETE /deploy/solutions/:solutionId/connectors/:connectorId': 'Remove a connector from a solution — stops + deletes from Core, removes from solution definition (grants, platform_connectors), removes from skill connectors arrays, and cleans mcp-store files',
      'GET /deploy/solutions/:solutionId/validate': 'Re-validate solution from stored state (structural + cross-skill checks)',
      'GET /deploy/solutions/:solutionId/skills/:skillId/validate': 'Re-validate a single skill from stored state',
      'GET /deploy/solutions/:solutionId/connectors/health': 'Connector health — status, discovered tools, errors from A-Team Core',
      'GET /deploy/solutions/:solutionId/skills/:skillId/conversation': 'Skill conversation history — returns chat messages, optional ?limit=N',
      'GET /deploy/solutions/:solutionId/health': 'Live health check — cross-checks definition vs A-Team Core (skills deployed, connectors connected, issues)',
      'POST /deploy/solutions/:solutionId/chat': 'Send a message to the Solution Bot — returns AI response with state updates and suggested focus',
      'POST /deploy/solutions/:solutionId/redeploy': 'Re-deploy ALL skills at once — regenerates MCP servers and pushes to A-Team Core',
      'POST /deploy/solutions/:solutionId/skills': 'Add a new skill to an existing solution — creates, links, and updates solution topology',
      'GET /deploy/solutions/:solutionId/export': 'Export solution as a JSON bundle — compatible with POST /deploy/solution for re-import',
      // Developer Tools
      'GET /deploy/solutions/:solutionId/logs': 'Execution logs — recent jobs with step traces, tool calls, errors, timing. Query: ?skill_id=X&limit=10&job_id=X',
      'POST /deploy/solutions/:solutionId/skills/:skillId/test': 'Test a skill — sync (wait for result) or async (Body: { message, async: true } returns job_id immediately)',
      'POST /deploy/solutions/:solutionId/skills/:skillId/test-pipeline': 'Test decision pipeline only — runs intent detection + first planner iteration WITHOUT executing tools. Returns intent classification, planned action, and timing. Body: { message }',
      'GET /deploy/solutions/:solutionId/skills/:skillId/test/:jobId': 'Poll async test progress — iteration, steps, status, result, elapsed_ms',
      'DELETE /deploy/solutions/:solutionId/skills/:skillId/test/:jobId': 'Abort a running test',
      'GET /deploy/solutions/:solutionId/metrics': 'Execution metrics — timing, bottlenecks, tool stats, signals. Query: ?job_id=X or ?skill_id=X',
      'GET /deploy/solutions/:solutionId/connectors/:connectorId/source': 'Connector source code — read the MCP server files',
      'GET /deploy/solutions/:solutionId/diff': 'Diff Builder vs Core — shows undeployed, orphaned, or changed skills. Query: ?skill_id=X',
      // GitHub Version Control (dev/main branching)
      'GET /deploy/solutions/:solutionId/github/status': 'GitHub repo status — exists, latest commit, URL. Use to verify async background push completed.',
      'GET /deploy/solutions/:solutionId/github/log': 'GitHub commit history — recent commits with message, author, date',
      'GET /deploy/solutions/:solutionId/github/read': 'Read a file from GitHub repo — query: ?path=connectors/my-mcp/server.js',
      'POST /deploy/solutions/:solutionId/github/push': 'Force-push current solution state to GitHub (normally auto-pushed on deploy)',
      'PATCH /deploy/solutions/:solutionId/github/patch': 'Edit files in GitHub repo — single file { path, content } or multi-file { files: [{ path, content }] }',
      'POST /deploy/solutions/:solutionId/github/pull': 'Pull full solution from GitHub and re-deploy (full round-trip)',
      'POST /deploy/solutions/:solutionId/github/pull-connectors': 'Pull ONLY connector source files from GitHub as mcp_store format — used by github-first deploys',
      // Version Management (dev/main promotion)
      'GET /deploy/solutions/:solutionId/versions/dev': 'List all dev versions — tags with dates, counters, and commit SHAs',
      'POST /deploy/solutions/:solutionId/promote': 'Promote dev → main (production). Body: { tag?: "dev-2026-03-11-005" } — omit tag to promote latest. Creates prod-YYYY-MM-DD-NNN tag.',
      'POST /deploy/solutions/:solutionId/rollback': 'Rollback main to previous production tag. Body: { tag: "prod-YYYY-MM-DD-001", confirm: true }. DESTRUCTIVE.',
      'GET /health': 'Health check',
    },
    deploy_guide: {
      _note: 'All deploy routes proxy through the Skill Builder backend, which stores everything (visible in Skill Builder UI), auto-generates Python MCP servers from skill tool definitions, and pushes to A-Team Core.',
      'POST /deploy/solution': {
        description: 'Deploy a complete solution — the recommended way to deploy. The Skill Builder handles slug generation, MCP server creation, and A-Team Core registration.',
        body: {
          solution: {
            _note: 'Solution architecture — identity, grants, handoffs, routing',
            id: 'ecom-customer-service',
            name: 'E-Commerce Customer Service',
            description: '...',
            identity: { actor_types: ['...'], default_actor_type: '...' },
            skills: [{ id: 'skill-id', name: '...', role: 'gateway|worker' }],
            grants: ['...'],
            handoffs: ['...'],
            routing: {},
          },
          skills: [
            {
              _note: 'Full skill definitions — same format as POST /validate/skill',
              id: 'order-support',
              name: 'Order Support Agent',
              tools: ['... tool definitions with inputs, outputs, source ...'],
              role: '...',
              connectors: ['orders-mcp'],
            },
          ],
          connectors: [
            {
              _note: 'Connector metadata — how to connect to MCP servers',
              id: 'orders-mcp',
              name: 'Orders MCP',
              transport: 'stdio',
              command: 'node',
              args: ['/mcp-store/orders-mcp/server.js'],
            },
          ],
          mcp_store: {
            _note: 'Optional but RECOMMENDED for stdio connectors: connector source code files. Key = connector id, value = { path: content } map. Without mcp_store, stdio connectors will fail to start if the server code is not pre-installed on A-Team Core. The deploy response includes validation_warnings if connectors are missing code.',
            'orders-mcp': [{ path: 'server.js', content: '...' }, { path: 'package.json', content: '...' }],
          },
        },
      },
      'POST /deploy/connector': {
        description: 'Deploy a single connector. Registers it in the Skill Builder catalog and connects it in A-Team Core.',
        body: { connector: { id: 'orders-mcp', name: 'Orders MCP', transport: 'stdio', command: 'node', args: [] } },
      },
      'POST /deploy/skill': {
        description: 'Deploy a single skill into an existing solution. Requires solution_id.',
        body: { skill: { id: 'order-support', name: 'Order Support Agent', tools: ['...'] }, solution_id: '<existing-solution-id>' },
      },
      'PATCH /deploy/solutions/:solutionId/skills/:skillId': {
        description: 'Update a deployed skill incrementally. Accepts original skill ID or internal ID. Supports dot notation for scalar fields, and _push/_delete/_update/_rename for array fields.',
        body: {
          updates: {
            _note: 'All operations are optional. Combine as many as needed.',
            'problem.statement': 'New problem statement (dot notation for scalar fields)',
            'tools_push': { name: 'new-tool', description: 'A new tool', inputs: ['...'], output: {}, source: {}, policy: {}, security: {} },
            'tools_update': { name: 'existing-tool', description: 'Updated description' },
            'tools_delete': 'tool-to-remove',
            'tools_rename': { from: 'old-name', to: 'new-name' },
            'intents.supported_push': { id: 'new-intent', description: '...', examples: ['...'] },
            'policy.guardrails.always_push': 'New guardrail rule',
            'engine.temperature': 0.5,
          },
        },
        protected_arrays: ['tools', 'meta_tools', 'intents.supported', 'policy.guardrails.always', 'policy.guardrails.never'],
        protected_note: 'These arrays cannot be replaced directly — use _push/_delete/_update instead to prevent accidental data loss.',
      },
      'PATCH /deploy/solutions/:solutionId': {
        description: 'Update a deployed solution incrementally. Supports dot notation and _push/_delete/_update for arrays.',
        body: {
          state_update: {
            _note: 'All operations are optional.',
            'phase': 'DEPLOYED',
            'identity.actor_types_push': { key: 'new-role', label: 'New Role', description: '...' },
            'grants_push': { key: 'ns.grant', description: '...', issued_by: ['skill-a'], consumed_by: ['skill-b'], issued_via: 'grant_mapping' },
            'handoffs_push': { id: 'a-to-b', from: 'skill-a', to: 'skill-b', trigger: '...', grants_passed: ['ns.grant'], mechanism: 'handoff-controller-mcp' },
            'routing.api': { default_skill: 'skill-a', description: 'API routing' },
          },
        },
      },
      'POST /deploy/solutions/:solutionId/redeploy': {
        description: 'Re-deploy ALL skills in a solution at once. Iterates every linked skill, regenerates MCP servers, pushes to A-Team Core.',
        body: { _note: 'No body required. Just POST with empty body.' },
        returns: {
          ok: true,
          solution_id: 'solution-id',
          deployed: 2,
          failed: 0,
          total: 2,
          skills: [{ skill_id: 'skill-1', ok: true, skillSlug: '...', mcpUri: '...' }],
        },
      },
      'POST /deploy/solutions/:solutionId/skills': {
        description: 'Add a new skill to an existing deployed solution. Creates the skill, populates it with the provided definition, and links it to the solution.',
        body: {
          skill: {
            id: 'new-skill-id',
            name: 'New Skill',
            description: 'What this skill does',
            role: 'worker',
            _note: 'Full skill definition — same format as in POST /deploy/solution skills array',
          },
        },
        returns: {
          ok: true,
          skill_id: 'new-skill-id',
          internal_id: 'dom_xxx',
        },
      },
      'GET /deploy/solutions/:solutionId/export': {
        description: 'Export solution as a JSON bundle. Returns solution + all skill definitions + connector metadata in a format compatible with POST /deploy/solution for re-import.',
        returns: {
          solution: { id: '...', name: '...', identity: {}, skills: [], grants: [], handoffs: [], routing: {} },
          skills: ['full skill definitions'],
          connectors: ['connector metadata'],
          exported_at: 'ISO timestamp',
        },
      },
      'POST /deploy/solutions/:solutionId/skills/:skillId/redeploy': {
        description: 'Re-deploy a single skill after PATCH updates. Reads stored definition, regenerates MCP server, pushes to A-Team Core. Accepts original or internal skill ID.',
        body: { _note: 'No body required — reads from stored state. Just POST with empty body.' },
        returns: {
          ok: true,
          skill_id: 'original-skill-id',
          internal_id: 'dom_xxx (if different from skill_id)',
          status: 'deployed',
          skillSlug: 'the-slug-used',
          mcpUri: 'tcp://localhost:PORT',
          message: 'Skill deployed successfully',
        },
        typical_workflow: [
          '1. PATCH /deploy/solutions/:id/skills/:skillId — update tools, policy, etc.',
          '2. POST /deploy/solutions/:id/skills/:skillId/redeploy — push changes to A-Team Core',
          '3. GET /deploy/status/:id — verify new status',
        ],
      },
    },
    id_remapping_guide: {
      _note: 'ID remapping is now AUTOMATIC. After deploying skills, the pipeline auto-remaps original IDs to internal dom_xxx IDs in grants, handoffs, routing, and security_contracts. You do NOT need to PATCH manually.',
      how_it_works: 'When POST /deploy/solution deploys skills, internal IDs (e.g., dom_abc123) are assigned. The deploy pipeline then automatically deep-replaces all original IDs in the solution definition (grants, handoffs, routing, security_contracts) with internal IDs.',
      what_you_get: 'The deploy response includes import.skills[] with both originalId and id (internal). The health check (GET /deploy/solutions/:id/health) accepts both original and internal IDs.',
      manual_override: 'If you need to manually update IDs (e.g., after adding a new skill), use PATCH /deploy/solutions/:id with the remapped references.',
      example_response_fragment: {
        'import.skills[0]': { id: 'dom_04f014ac', originalId: 'identity-assurance', name: 'Identity Assurance Manager', status: 'imported' },
        'import.skills[1]': { id: 'dom_492a7855', originalId: 'support-tier-1', name: 'Customer Support Tier 1', status: 'imported' },
      },
      tip: 'Use human-readable IDs (e.g., identity-assurance) in your source files. The deploy pipeline handles remapping automatically.',
    },
  };
}

function buildEnums() {
  return {
    description: 'All A-Team enum values. Use these when building skill and solution YAML files.',
    enums: {
      // Phases
      phase: VALID_PHASES,
      phase_labels: PHASE_LABELS,

      // Data types
      data_type: VALID_DATA_TYPES,

      // Communication style
      tone: ['formal', 'casual', 'technical', 'warm'],
      verbosity: ['concise', 'balanced', 'detailed'],

      // Tool configuration
      tool_policy_allowed: ['always', 'conditional', 'never'],
      tool_id_status: ['temporary', 'permanent'],
      tool_source_type: ['mcp_bridge', 'builtin', 'custom'],

      // Mock configuration
      mock_mode: ['examples', 'llm', 'hybrid'],
      mock_status: ['untested', 'tested', 'skipped'],

      // Triggers
      trigger_type: VALID_TRIGGER_TYPES,
      trigger_scope: VALID_TRIGGER_SCOPES,

      // Security
      security_classification: VALID_CLASSIFICATIONS,
      risk_level: VALID_RISK_LEVELS,
      access_policy_effect: VALID_EFFECTS,
      high_risk_classifications: HIGH_RISK_CLASSIFICATIONS,

      // Intent handling
      out_of_domain_action: ['redirect', 'reject', 'escalate'],
      policy_condition_action: ['allow', 'deny', 'escalate', 'require_approval'],

      // Workflow
      workflow_deviation: ['warn', 'block', 'ask_user'],

      // Engine
      autonomy_level: ['autonomous', 'supervised', 'restricted'],
      critic_strictness: ['low', 'medium', 'high'],
      reflection_depth: ['shallow', 'medium', 'deep'],

      // Solution-level
      skill_role_in_solution: ['gateway', 'worker', 'orchestrator', 'approval'],
      handoff_mechanism: ['handoff-controller-mcp', 'internal-message'],
      grant_issued_via: ['grant_mapping', 'handoff', 'platform'],

      // Actors & channels
      actor_type: ['external_user', 'skill_builder', 'adas_builder', 'agent', 'service'],
      actor_status: ['active', 'pending', 'inactive'],
      channel_type: ['api', 'slack', 'email', 'webhook'],
      email_routing_mode: ['dedicated_mailbox', 'plus_addressing'],
      slack_routing_mode: ['mention_based', 'channel_per_skill'],

      // Meta tools
      meta_tool_status: ['pending', 'approved', 'rejected'],

      // Quality scoring
      quality_grade: Object.keys(GRADE_THRESHOLDS),

      // System tools
      system_tool_prefixes: SYSTEM_TOOL_PREFIXES,
    },
  };
}

function buildSkillSpec() {
  return {
    spec_version: '1.0.0',
    description: 'Complete A-Team skill definition specification. A skill is an autonomous AI agent with tools, policies, and workflows.',

    auto_expand: {
      description: 'You can send a minimal skill definition (just id, name, problem, tools, and optionally guardrails). The platform auto-expands missing fields transparently during validation and deployment. Only define intents, workflows, scenarios, and role explicitly when you need custom logic.',
      minimal_required: ['id', 'name', 'problem', 'tools'],
      auto_generated: ['scenarios', 'intents', 'role', 'engine', 'policy.workflows', 'entities', 'access_policy'],
      rule: 'If default planner behavior works — do not define extra blocks. Complexity is opt-in.',
    },

    schema: {
      // ── Metadata ──
      id: { type: 'string', required: true, description: 'Unique skill identifier (e.g., "identity-assurance")' },
      name: { type: 'string', required: true, description: 'Human-readable skill name' },
      description: { type: 'string', required: false, description: 'What this skill does' },
      version: { type: 'string', required: false, description: 'Semantic version (e.g., "1.0.0")' },
      phase: { type: 'enum', required: true, values: VALID_PHASES, description: 'Current development phase' },
      created_at: { type: 'string', required: false, description: 'ISO 8601 timestamp' },
      updated_at: { type: 'string', required: false, description: 'ISO 8601 timestamp' },
      ui_capable: { type: 'boolean', required: false, description: 'Whether this skill serves UI plugins' },

      // ── Connectors ──
      connectors: {
        type: 'string[]', required: false,
        description: 'List of MCP connector IDs this skill depends on (e.g., ["orders-mcp", "fulfillment-mcp"])',
      },

      // ── Problem ──
      problem: {
        type: 'object', required: true,
        description: 'The problem this skill solves',
        fields: {
          statement: { type: 'string', required: true, description: 'Problem statement (minimum 10 characters)' },
          context: { type: 'string', required: false, description: 'Additional context about the problem domain' },
          goals: { type: 'string[]', required: false, description: 'What the skill aims to achieve' },
        },
      },

      // ── Scenarios ──
      scenarios: {
        type: 'array', required: true, min_items: 1,
        auto_expandable: true,
        description: 'Concrete use cases that demonstrate the skill in action. Auto-generated from tools if omitted when sent to validate or deploy.',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique scenario ID' },
          title: { type: 'string', required: true, description: 'Short scenario title' },
          description: { type: 'string', required: false, description: 'Detailed scenario description' },
          steps: { type: 'string[]', required: true, description: 'Ordered list of steps' },
          expected_outcome: { type: 'string', required: false, description: 'What should happen after the scenario completes' },
        },
      },

      // ── Role ──
      role: {
        type: 'object', required: true,
        auto_expandable: true,
        description: 'The agent persona and behavioral constraints. Auto-generated from problem + tools + guardrails if omitted when sent to validate or deploy.',
        fields: {
          name: { type: 'string', required: true, description: 'Role name (e.g., "Identity Assurance Manager")' },
          persona: { type: 'string', required: true, description: 'Detailed persona description — how the agent should behave' },
          goals: { type: 'string[]', required: false, description: 'What the agent tries to achieve' },
          limitations: { type: 'string[]', required: false, description: 'What the agent must NOT do' },
          communication_style: {
            type: 'object', required: false,
            fields: {
              tone: { type: 'enum', values: ['formal', 'casual', 'technical', 'warm'], description: 'Communication tone' },
              verbosity: { type: 'enum', values: ['concise', 'balanced', 'detailed'], description: 'Response detail level' },
            },
          },
        },
      },

      // ── Glossary ──
      glossary: {
        type: 'object', required: false,
        description: 'Domain-specific term definitions (key-value pairs)',
      },

      // ── Intents ──
      intents: {
        type: 'object', required: true,
        auto_expandable: true,
        description: 'User intent classification configuration. Auto-generated from tool names and descriptions if omitted when sent to validate or deploy. Only define explicitly when you need custom intent examples, entities, or disambiguation.',
        fields: {
          supported: {
            type: 'array', required: true,
            description: 'List of intents the skill can handle',
            item_schema: {
              id: { type: 'string', required: true, description: 'Unique intent ID' },
              description: { type: 'string', required: true, description: 'What this intent means' },
              examples: { type: 'string[]', required: true, description: 'Example user messages that match this intent' },
              maps_to_workflow: { type: 'string', required: false, description: 'Workflow ID to execute when this intent is detected' },
              entities: {
                type: 'array', required: false,
                description: 'Entities to extract from user message',
                item_schema: {
                  name: { type: 'string', required: true },
                  type: { type: 'enum', values: VALID_DATA_TYPES },
                  required: { type: 'boolean', required: false },
                  extract_from: { type: 'enum', values: ['message', 'context'] },
                },
              },
              guardrails: {
                type: 'object', required: false,
                fields: {
                  pre_conditions: { type: 'string[]' },
                  rate_limit: {
                    type: 'object',
                    fields: {
                      max_per_session: { type: 'number' },
                      cooldown_seconds: { type: 'number' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          thresholds: {
            type: 'object', required: false,
            description: 'Confidence thresholds for intent matching',
            fields: {
              accept: { type: 'number', description: 'Confidence to proceed (default: 0.8)', default: 0.8 },
              clarify: { type: 'number', description: 'Confidence to ask for clarification (default: 0.5)', default: 0.5 },
              reject: { type: 'number', description: 'Confidence below which to reject (default: 0.3)', default: 0.3 },
            },
          },
          out_of_domain: {
            type: 'object', required: false,
            description: 'What to do when intent does not match this skill',
            fields: {
              action: { type: 'enum', values: ['redirect', 'reject', 'escalate'] },
              message: { type: 'string', description: 'Message to show user' },
              suggest_domains: { type: 'string[]', description: 'Other skill IDs that might handle this' },
            },
          },
        },
      },

      // ── Tools ──
      tools: {
        type: 'array', required: true, min_items: 1,
        description: 'Available actions this skill can perform via MCP connectors',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique tool ID (e.g., "tool-orders-get")' },
          id_status: { type: 'enum', values: ['temporary', 'permanent'], description: 'Whether this ID is provisional or finalized' },
          name: { type: 'string', required: true, description: 'Tool name matching MCP tool (e.g., "orders.order.get"). Supports wildcard: "connector-id:*" grants access to ALL tools from that connector (e.g., "mobile-device-mcp:*"). You can mix wildcards and individual tools in the same skill.' },
          description: { type: 'string', required: true, description: 'What this tool does' },
          inputs: {
            type: 'array', required: true,
            description: 'Tool input parameters',
            item_schema: {
              name: { type: 'string', required: true },
              type: { type: 'enum', values: VALID_DATA_TYPES, required: true },
              required: { type: 'boolean', required: false },
              description: { type: 'string', required: true },
              default: { type: 'any', required: false },
              enum: { type: 'string[]', required: false, description: 'Allowed values' },
            },
          },
          output: {
            type: 'object', required: true,
            fields: {
              type: { type: 'enum', values: VALID_DATA_TYPES },
              description: { type: 'string', required: true },
              schema: { type: 'object', required: false, description: 'JSON Schema for output structure' },
            },
          },
          source: {
            type: 'object', required: false,
            description: 'Where this tool comes from',
            fields: {
              type: { type: 'enum', values: ['mcp_bridge', 'builtin', 'custom'] },
              connection_id: { type: 'string', description: 'Connector ID for mcp_bridge tools' },
              mcp_tool: { type: 'string', description: 'Tool name on the MCP server' },
            },
          },
          policy: {
            type: 'object', required: false,
            description: 'Tool-level access policy',
            fields: {
              allowed: { type: 'enum', values: ['always', 'conditional', 'never'] },
              conditions: {
                type: 'array', required: false,
                item_schema: {
                  when: { type: 'string', description: 'Condition expression (e.g., "amount > 500")' },
                  action: { type: 'enum', values: ['allow', 'deny', 'escalate', 'require_approval'] },
                  message: { type: 'string', required: false },
                },
              },
              requires_approval: { type: 'enum', values: ['always', 'conditional', 'never'], required: false },
              rate_limit: { type: 'string', required: false, description: 'e.g., "100/minute"' },
            },
          },
          script_cache: {
            type: 'object', required: false,
            description:
              'Opt-in for script-level JIT shortcuts (Level 2). When a fat tool interacts with a flaky external system — DOM scraping, version-rotating APIs, brittle HTML — setting `enabled: true` turns the tool into a first-class dispatchable function. The planner calls it directly like any other tool; the platform bakes the Python implementation on first call, caches it, and replays on subsequent calls. The LLM regenerates only when a cached run fails. ' +
              'ENABLE THIS when: the tool implementation is inherently unstable (browser automation, web scraping, screen reading, third-party API whose shape rotates). ' +
              'DO NOT enable for: pure-compute tools, deterministic API calls, MCP-bridged tools with stable schemas — they do not need caching.',
            fields: {
              enabled: {
                type: 'boolean', required: true,
                description: 'Turn script caching on for this tool. Default: false. When true, the Core synthesizes a dispatcher for this tool — the planner can call it directly, no run_python_script boilerplate required.',
              },
              invalidate_on: {
                type: 'string[]', required: false,
                description: 'Which failure classes trigger cache invalidation. Defaults to ["execution","domain_break"]. "logical" is ALWAYS excluded (a bad password is a user problem, not a script problem — the cache should survive it).',
                enum: ['execution', 'domain_break'],
              },
              max_age_days: {
                type: 'number', required: false,
                description: 'TTL in days. Cached scripts auto-expire this long after their last successful use (refreshed on every ok hit). Default: 30. Clamped to (0, 365].',
                default: 30,
              },
            },
            failure_class_contract_AUTOMATIC: {
              description:
                'The Python the baker generates MUST emit a failure_class field. The baker\'s system prompt enforces this automatically — you (the solution author) do NOT need to write the contract into the tool description or persona. The classes are:',
              classes: {
                ok: 'Success. Platform refreshes cache TTL.',
                logical: 'External system gave a valid NO (invalid credentials, rate limited, moderation). Cache is PRESERVED.',
                domain_break: 'Script assumption was wrong (selector null, shape changed). Cache is INVALIDATED, rebaked next call.',
              },
              auto_classified_by_platform: 'Python tracebacks, non-zero exits, timeouts → classified as execution automatically.',
              default_when_missing: 'ok:false without failure_class → treated as domain_break (conservative).',
              solution_author_responsibility: 'NONE. The baker enforces this contract. You just write the tool description.',
            },
            planner_awareness_AUTOMATIC: {
              description:
                'At Level 2, the planner calls the tool DIRECTLY: linkedin.status({}). It does NOT need to know about run_python_script, tool_name, script_cache, or failure_class. The Core intercepts the call, resolves the synthetic dispatcher, and handles everything. ' +
                'Your skill persona does NOT need any rules about tool_name or run_python_script routing. The only thing the persona needs is the normal "when to use this tool" kind of guidance.',
            },
            when_to_use: [
              'Browser automation (DOM scraping, Playwright clicks, headless Chromium)',
              'Third-party APIs whose response shape changes between versions',
              'HTML parsing where the structure of the page rotates',
              'Any fat tool where you watched the LLM rewrite the same Python five times last week',
            ],
            when_NOT_to_use: [
              'Deterministic compute — math, data transforms, JSON reshaping',
              'Tools that are already MCP-bridged with a stable schema',
              'Tools that run for milliseconds — caching overhead is not worth it',
              'Tools whose OUTPUT is supposed to depend on args you do not count as part of the shape',
            ],
            example_config_MINIMAL: {
              enabled: true,
            },
            example_config_FULL: {
              enabled: true,
              invalidate_on: ['execution', 'domain_break'],
              max_age_days: 30,
            },
            design_doc: 'Docs/WIP/SCRIPT-LEVEL-JIT-SHORTCUTS.md in ai-dev-assistant repo.',
          },
          script_hint: {
            type: 'string', required: false,
            description:
              'OPTIONAL Python snippet shown to the baker as a "what you think the implementation should look like" seed. Relevant only when script_cache.enabled is true. ' +
              'The baker uses the hint as a strong starting point but is NOT bound by it — if a selector is wrong or a step unnecessary, the baker will deviate. A good hint dramatically speeds the first bake and reduces LLM creativity; a bad hint is harmless (it gets thrown away on first failure). ' +
              'WHEN TO PROVIDE: if you know the site has a specific login button with a specific selector, put it in the hint. If you don\'t know the DOM, omit it entirely — the baker will figure it out from the tool description alone. ' +
              'FORMAT: raw Python source as a multi-line string. Use adas_call_tool(), adas_emit_progress(), adas_output_json() like you would in run_python_script directly. No imports needed (json, time, re are available). The baker will rewrite as needed — you do NOT have to emit failure_class; the baker handles that.\n\n' +
              '⚠️ ANTI-PATTERN (seen in the wild): do NOT write `failure_class: "domain_break"` for a branch where a tool returned `ok: false`. A tool responding with a valid `{ok: false}` payload is `logical` (user cancelled / session expired / rate limit / no UI client attached). Using `domain_break` invalidates the cached script on every legitimate negative outcome, triggering bake_exhausted after 5 retries. Only use `domain_break` when the tool CONTRACT broke (tool not found, schema mismatch, selector returned null).',
            example_when_you_know_the_site:
              '# Hint for a site with known selectors\nimport json\nnav = adas_call_tool(\'web.navigate\', {\'url\': \'https://example.com/account\'})\ncheck = adas_call_tool(\'web.evaluate\', {\'script\': "document.querySelector(\'.user-badge\') ? \'in\' : \'out\'"})\nadas_output_json({\'logged_in\': \'in\' in str(check.get(\'result\', \'\'))})',
            example_when_you_DO_NOT_know_the_site:
              '# Omit script_hint entirely — let the baker discover the DOM on first run.',
            example_with_dataStore_for_session_cookies:
              '# Use platform.dataStore for raw structured data (cookies, tokens).\n# NEVER use memory.store for raw JSON — it normalizes/summarizes.\nimport json\nstored = adas_call_tool(\'platform.dataStore.get\', {\'key\': \'my_session_cookies\'})\ncookies = None\nif stored.get(\'found\') and stored.get(\'value\'):\n    val = stored[\'value\']\n    cookies = json.loads(val) if isinstance(val, str) else val\nif cookies:\n    adas_call_tool(\'web.cookies.set\', {\'cookies\': cookies})\n# ... do work ...\n# Save fresh cookies with 24h TTL\nfresh = adas_call_tool(\'web.cookies.get\', {\'urls\': \'https://example.com\'})\nif fresh.get(\'cookies\'):\n    adas_call_tool(\'platform.dataStore.set\', {\'key\': \'my_session_cookies\', \'value\': json.dumps(fresh[\'cookies\']), \'ttl_seconds\': 86400})  # 24h TTL — caller decides; omit for no expiry',
            best_practice_session_convention: {
              description:
                'BEST PRACTICE: When multiple tools in a skill share session state (cookies, tokens, cached credentials), ' +
                'declare the convention ONCE in problem.context — not in each tool\'s script_hint. ' +
                'The baker reads problem.context when generating scripts for ANY tool, so all tools stay consistent automatically. ' +
                'Without this, updating one tool\'s storage path but forgetting another causes session breaks.',
              example_problem_context:
                '"Session convention: ALL tools in this skill store and restore session cookies from platform.dataStore ' +
                'under key \'my_session_cookies\' (24h TTL). NEVER use memory.recall for cookies — memory-mcp normalizes/summarizes raw JSON. ' +
                'Restore pattern: platform.dataStore.get → json.loads → web.cookies.set. ' +
                'Save pattern: web.cookies.get → json.dumps → platform.dataStore.set with ttl_seconds=86400."',
              why: 'Prevents the class of bug where tool A writes to dataStore but tool B reads from memory.recall — ' +
                'a single line in problem.context keeps every baker-generated script consistent.',
              future: 'This is a solution-level best practice today. A future platform feature may formalize ' +
                'skill-level session config as a dedicated schema field with mechanical enforcement.',
            },
          },
          mock: {
            type: 'object', required: false,
            description: 'Mock configuration for testing without real MCP',
            fields: {
              enabled: { type: 'boolean' },
              mode: { type: 'enum', values: ['examples', 'llm', 'hybrid'] },
              examples: {
                type: 'array',
                item_schema: {
                  id: { type: 'string' },
                  input: { type: 'object' },
                  output: { type: 'any' },
                  description: { type: 'string', required: false },
                },
              },
            },
          },
          mock_status: { type: 'enum', values: ['untested', 'tested', 'skipped'] },
          security: {
            type: 'object', required: true,
            description: 'Tool security metadata',
            fields: {
              classification: {
                type: 'enum', values: VALID_CLASSIFICATIONS, required: true,
                description: 'Security classification. High-risk tools (pii_write, financial, destructive) require access policies.',
              },
              risk: { type: 'enum', values: VALID_RISK_LEVELS, required: false },
              data_owner_field: { type: 'string', required: false, description: 'Input field that identifies data owner (for constrain policies)' },
            },
          },
        },
      },

      // ── Meta Tools ──
      meta_tools: {
        type: 'array', required: false,
        description: 'Auto-generated tool compositions (created by DAL, not manually)',
        item_schema: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          composes: { type: 'string[]', description: 'Tool names this meta tool combines' },
          logic: { type: 'string', description: 'How the tools are combined' },
          status: { type: 'enum', values: ['pending', 'approved', 'rejected'] },
        },
      },

      // ── Bootstrap Tools ──
      bootstrap_tools: {
        type: 'string[]', required: false, max_items: 3,
        description: 'Up to 3 tool names that are always available to the planner (pinned in tool selection). These are NOT auto-executed — they simply guarantee the planner can always see and choose these tools, even when LLM-based tool ranking would otherwise exclude them. Useful for core domain tools like identity lookup or order retrieval that the planner needs on almost every request. Values must be valid tool names from the tools array.',
        example: ['identity.customer.lookup', 'orders.list', 'account.status'],
      },

      // ── Prefetch Tools ──
      prefetch_tools: {
        type: 'string[]', required: false,
        description: 'Tool names to pre-load into the planner context at job start (iteration 0). Unlike bootstrap_tools which PIN tools for every iteration, prefetch_tools loads them ONCE at the start so the planner has their outputs available immediately without needing sys.askForContextAndTools. Use for tools the skill almost always needs on first iteration — e.g., memory.recall, identity.lookup. The tools execute automatically at job start and their results are injected into the planner context.',
        example: ['memory.recall', 'memory.rules.match', 'identity.customer.lookup'],
        vs_bootstrap: 'bootstrap_tools = always VISIBLE to planner (pinned in tool selection). prefetch_tools = automatically EXECUTED at job start (results pre-loaded into context). Use bootstrap for tools the planner should always be able to CHOOSE. Use prefetch for tools whose RESULTS the planner needs from the start.',
      },

      // ── Exclude Bootstrap Tools ──
      exclude_bootstrap_tools: {
        type: 'string[]', required: false,
        description: 'System bootstrap tools to UN-PIN for this skill. By default the platform force-pins 9 system tools (readFile, getCurrentProjectPath, getChatTranscript, sys.callAiWithTools, sys.step, sys.handoffToSkill, run_python_script, sys.askForContextAndTools, sys.finalizePlan). Three are MANDATORY and cannot be excluded: run_python_script, sys.askForContextAndTools, sys.finalizePlan. The remaining 6 CAN be excluded here. Excluded tools are NOT removed — they stay in the tool catalog and the LLM can still select them via tool ranking. They just won\'t be force-pinned. Use this to free up planner token budget for skills that don\'t need certain system tools. If also set at the solution level, both lists are merged (union).',
        excludable_tools: ['readFile', 'getCurrentProjectPath', 'getChatTranscript', 'sys.callAiWithTools', 'sys.step', 'sys.handoffToSkill', 'sys.askSkill', 'sys.findCapability', 'sys.listSkills'],
        mandatory_tools_note: 'These 3 are ALWAYS pinned and CANNOT be excluded: run_python_script, sys.askForContextAndTools, sys.finalizePlan',
        example: ['readFile', 'getCurrentProjectPath', 'getChatTranscript'],
        tip: 'For single-skill solutions, exclude sys.handoffToSkill, sys.askSkill, sys.findCapability, and sys.listSkills to save planner token budget — these are only useful in multi-skill solutions.',
      },

      // ── Triggers ──
      triggers: {
        type: 'array', required: false,
        description: 'Automation triggers that activate this skill periodically or on events. Triggers are the ONLY way a skill can act proactively (without a user message). The trigger-runner service fires them on schedule or in response to events, creating a job where the skill executes the trigger prompt autonomously using all its linked tools. These are STATIC triggers — defined at build time. For DYNAMIC triggers created at runtime by the agent (e.g., user says "remind me at 9 AM"), see sys.trigger system tool in the solution spec dynamic_triggers section.',
        guide: {
          how_it_works: [
            '1. The trigger-runner service checks enabled triggers on their schedule (every) or listens for events (event)',
            '2. When a trigger fires, it creates a new job for the skill with the trigger prompt as the goal',
            '3. The skill executes autonomously — it can use ALL its linked connector tools (read data, send messages, update records)',
            '4. concurrency=1 (default) means only one instance runs at a time — next fire waits for current to finish',
            '5. The trigger prompt should be specific: what to check, what action to take, what to report',
          ],
          scope_guide: {
            mental_model: 'scope controls WHO the trigger runs for. "system" = one job, no user context. "per_actor" = one job PER active user, each with full user context (memory, preferences, identity).',
            system: 'Default. The trigger fires once per schedule. The job runs as the system actor with no user-specific context. Use for global housekeeping: cleanup, aggregation, health checks, system-wide reports.',
            per_actor: 'The trigger fires once per schedule, then fans out — creating a SEPARATE job for each active (non-deactivated) user. Each job runs with that user\'s full actor context: memory.userProfile returns THEIR profile, memory.recall searches THEIR history, connectors receive THEIR actor ID. Use for personalized proactive features: daily briefings, reminders, inbox digests, proactive recommendations.',
            how_fan_out_works: [
              '1. Trigger becomes due (same schedule logic as system scope)',
              '2. Platform loads all active actors (status != deactivated) from the tenant',
              '3. For EACH actor: checks isDue and canStart independently (per-actor state tracking)',
              '4. Creates a separate job per actor with their actorId in both the HTTP header and triggerContext',
              '5. Each job runs in full ALS (AsyncLocalStorage) context — getCurrentActorId() returns the correct user',
              '6. All memory tools, connector calls, and storage queries automatically scope to that actor',
            ],
            concurrency_note: 'With per_actor scope, concurrency is enforced PER ACTOR, not globally. concurrency=1 means each user can have at most 1 running instance of this trigger — other users are unaffected.',
            state_isolation: 'Trigger state (lastRunAt, checkpoint, runningJobIds) is tracked per (skillSlug, triggerId, actorId). Actor A\'s trigger can fire while Actor B\'s is still running.',
          },
          dynamic_triggers_note: 'For triggers created at RUNTIME by the AI agent (not at build time), use the sys.trigger system tool. It supports cron expressions, ISO 8601 intervals, and one-shot datetime schedules. Add sys.trigger to the skill\'s bootstrap_tools to make it available. See solution spec dynamic_triggers section for full documentation.',
          schedule_examples: {
            'PT1M': 'Every 1 minute (use sparingly — only for time-critical monitoring)',
            'PT5M': 'Every 5 minutes (good for polling task boards, inboxes)',
            'PT15M': 'Every 15 minutes (good for circuit-breaker / health checks)',
            'PT1H': 'Every 1 hour',
            'P1D': 'Every 24 hours (good for daily digests, summaries)',
          },
          prompt_tips: [
            'Be explicit about what to check and what action to take — vague prompts produce unreliable results',
            'Name the tools the skill should use (e.g., "call tasks.list to get all tasks")',
            'Define conditions for action vs. doing nothing (e.g., "only notify if status=done AND no NOTIFIED comment")',
            'For notifications: specify the chat_id/email, message format, and when NOT to notify',
            'Use idempotency markers to prevent duplicate notifications (e.g., "add a NOTIFIED comment after sending, skip tasks that already have one")',
          ],
          scope_examples: [
            {
              name: 'System cleanup (scope: system)',
              trigger: { id: 'cleanup-stale-jobs', type: 'schedule', every: 'P1D', scope: 'system', prompt: 'Find and archive jobs older than 30 days' },
              explanation: 'Fires once daily. No user context needed — operates on global data.',
            },
            {
              name: 'Personal daily briefing (scope: per_actor)',
              trigger: { id: 'daily-briefing', type: 'schedule', every: 'P1D', scope: 'per_actor', prompt: 'Prepare a personalized morning briefing: check calendar, unread emails, pending tasks, and recent notifications. Deliver summary via the user\'s preferred channel.' },
              explanation: 'Fires once daily, creates a separate job for each active user. Each job has full access to that user\'s calendar, email, and task data through their actor context.',
            },
            {
              name: 'Proactive check (scope: per_actor)',
              trigger: { id: 'proactive-check', type: 'schedule', every: 'PT5M', scope: 'per_actor', prompt: 'Check for anything that needs the user\'s attention: new messages, upcoming deadlines, anomalies in their data. Only notify if something actionable is found.', concurrency: 1 },
              explanation: 'Fires every 5 minutes per user. concurrency=1 per actor prevents overlap. Each user\'s check runs independently with their own memory and preferences.',
            },
          ],
        },
        runtime_access: {
          overview: 'There are THREE ways to interact with triggers at different levels. Choose the right one for your use case.',
          approaches: [
            {
              name: 'AI Agent (sys.trigger)',
              when: 'The AI agent needs to create/list/delete triggers during a conversation (e.g., user says "remind me at 9 AM")',
              how: 'The sys.trigger system tool is available to all skills. Actions: create, list, update, delete, pause, resume. Supports cron, every (ISO 8601 duration), and once (ISO 8601 datetime) schedules.',
              example: '{ action: "create", trigger_id: "morning-reminder", schedule: "cron:0 9 * * *", prompt: "Check calendar and brief user", timezone: "Asia/Jerusalem" }',
            },
            {
              name: 'UI Plugin (connector proxy tools)',
              when: 'A UI panel needs to display, toggle, or delete triggers (e.g., a "Reminders" panel in the app)',
              how: 'Add trigger management tools to your UI connector (the MCP server). The connector proxies to the trigger-runner HTTP API (http://trigger-runner:3100) and Core backend API. The UI plugin calls these tools via the bridge: mcpCall("triggers.list", {}, "your-ui-connector-id").',
              trigger_runner_api: {
                'GET /triggers': 'List all triggers for the tenant (requires X-ADAS-TENANT header)',
                'POST /triggers/:skillSlug/:triggerId/toggle': 'Toggle pause/resume for a trigger',
                'POST /triggers/toggle-all': 'Pause/resume all triggers (body: { paused: boolean })',
                'POST /reload': 'Force the trigger-runner to reload all trigger definitions',
              },
              connector_tool_example: `server.tool("triggers.list", "List all triggers", {
  _adas_tenant: z.string().optional(),
}, async ({ _adas_tenant }) => {
  const res = await fetch("http://trigger-runner:3100/triggers", {
    headers: { "X-ADAS-TENANT": _adas_tenant }
  });
  return { content: [{ type: "text", text: JSON.stringify(await res.json()) }] };
});`,
              note: 'The platform injects _adas_tenant into every tool call args automatically (via ConnectorManager). Your connector reads it from args, not from environment variables.',
            },
            {
              name: 'Static (skill definition)',
              when: 'Fixed schedules defined at build time that never change (e.g., "check inbox every 5 minutes")',
              how: 'Define triggers[] in the skill YAML. They are deployed with the skill and managed by the trigger-runner automatically.',
            },
          ],
          key_concepts: [
            'Static triggers (skill definition) vs dynamic triggers (sys.trigger at runtime) — both are managed by the same trigger-runner service',
            'trigger-runner is a standalone Docker service (http://trigger-runner:3100) accessible to all connectors on the Docker network',
            'Tenant isolation: always pass X-ADAS-TENANT header — the trigger-runner scopes everything by tenant',
            '_adas_tenant is injected into MCP tool args by ConnectorManager — connectors read tenant from args, not env',
            'After deleting a dynamic trigger from MongoDB, call POST /reload on trigger-runner to pick up the change',
          ],
        },
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique trigger ID within this skill' },
          type: { type: 'enum', values: VALID_TRIGGER_TYPES, required: true, description: '"schedule" for periodic execution, "event" for event-driven activation' },
          scope: { type: 'enum', values: VALID_TRIGGER_SCOPES, required: false, default: 'system', description: '"system" (default) = fires once, runs as system actor with no user context. "per_actor" = fans out to create one job per active user, each with full actor context (memory, preferences, identity). Use per_actor for personalized proactive features like daily briefings, reminders, or inbox checks.' },
          enabled: { type: 'boolean', required: false, default: true },
          concurrency: { type: 'number', required: false, default: 1, description: 'Max parallel jobs. With scope="system", this is global. With scope="per_actor", this is PER USER — each user can have up to this many concurrent instances.' },
          prompt: { type: 'string', required: true, description: 'Goal prompt for the triggered job — this is what the skill will execute when the trigger fires' },
          input: { type: 'object', required: false, description: 'Arbitrary data passed to triggerContext' },
          every: { type: 'string', required: false, description: 'ISO 8601 duration (schedule triggers only, e.g., "PT2M", "PT1H", "P1D")' },
          event: { type: 'string', required: false, description: 'Event type name (event triggers only, e.g., "email.received")' },
          filter: { type: 'object', required: false, description: 'Event data filter (event triggers only)' },
        },
      },

      // ── Policy ──
      policy: {
        type: 'object', required: true,
        description: 'Guardrails, workflows, approval rules, and escalation',
        fields: {
          guardrails: {
            type: 'object', required: true,
            description: 'Hard behavioral constraints',
            fields: {
              never: { type: 'string[]', description: 'Things the agent must NEVER do' },
              always: { type: 'string[]', description: 'Things the agent must ALWAYS do' },
            },
            note: 'Can also be an array of {type: "never"|"always", rule: string} objects',
          },
          workflows: {
            type: 'array', required: false,
            description: 'Named orchestration sequences',
            item_schema: {
              id: { type: 'string', required: true },
              name: { type: 'string', required: true },
              description: { type: 'string', required: false },
              trigger: { type: 'string', description: 'Intent ID that triggers this workflow' },
              steps: { type: 'string[]', required: true, description: 'Ordered list of tool names or system tool names to execute' },
              required: { type: 'boolean', description: 'Must follow this sequence?' },
              on_deviation: { type: 'enum', values: ['warn', 'block', 'ask_user'], description: 'What happens if agent deviates from workflow' },
            },
          },
          approvals: {
            type: 'array', required: false,
            description: 'Manual approval gates for specific tools',
            item_schema: {
              id: { type: 'string', required: true },
              tool_id: { type: 'string', required: true, description: 'Tool that requires approval' },
              conditions: {
                type: 'array',
                item_schema: {
                  when: { type: 'string' },
                  action: { type: 'enum', values: ['allow', 'deny', 'escalate', 'require_approval'] },
                },
              },
              approver: { type: 'string', required: false, description: 'Role or queue' },
            },
          },
          escalation: {
            type: 'object', required: false,
            fields: {
              enabled: { type: 'boolean' },
              conditions: { type: 'string[]' },
              target: { type: 'string', description: 'Skill or queue to escalate to' },
            },
          },
        },
      },

      // ── Engine ──
      engine: {
        type: 'object', required: false,
        auto_expandable: true,
        description: 'AI model and reasoning configuration. Uses sensible defaults (Claude Sonnet, temp 0.3, 10 iterations) if omitted. The most impactful setting is max_iterations — tune it based on your skill\'s complexity.',
        guidance: {
          max_iterations_by_skill_type: {
            'Simple CRUD / lookup': '8-12 iterations',
            'Standard workflows': '15-20 iterations',
            'Code analysis / investigation': '20-30 iterations',
            'Deep research / multi-step orchestration': '30-50 iterations',
          },
          tips: [
            'If jobs frequently hit ENGINE_BUDGET_EXHAUSTED, increase rv2.max_iterations.',
            'The platform default is 16 iterations if not configured. Always set it explicitly for production skills.',
            'Higher limits increase cost but allow the agent to complete complex multi-step tasks.',
          ],
          planner_tool_budget_optimization: {
            _note: 'Advanced optimization — control which tools the planner always sees. Two complementary mechanisms: PIN your important domain tools, UN-PIN system tools you don\'t need.',
            pin_domain_tools: {
              field: 'bootstrap_tools',
              what: 'Up to 3 domain tool names that are ALWAYS visible to the planner, bypassing LLM tool ranking. Use for core tools the skill needs on almost every request.',
              example: 'bootstrap_tools: ["identity.customer.lookup", "orders.list", "account.status"]',
              when_to_use: 'Skills with 3+ tools where some are critical for most requests. Without pinning, tool ranking might deprioritize a key tool on certain queries.',
            },
            unpin_system_tools: {
              field: 'exclude_bootstrap_tools',
              what: 'The platform force-pins 9 system tools into every skill\'s planner. 3 are mandatory (cannot exclude), 6 are excludable to free token budget.',
              mandatory: {
                tools: ['run_python_script', 'sys.askForContextAndTools', 'sys.finalizePlan'],
                note: 'ALWAYS pinned. Cannot be excluded.',
              },
              excludable: {
                tools: ['readFile', 'getCurrentProjectPath', 'getChatTranscript', 'sys.callAiWithTools', 'sys.step', 'sys.handoffToSkill', 'sys.askSkill', 'sys.findCapability', 'sys.listSkills'],
                note: 'Can be un-pinned. They remain in the tool catalog — the LLM can still select them via ranking, they just won\'t be force-pinned.',
              },
              configuration: {
                skill_level: 'Add exclude_bootstrap_tools array to the skill definition.',
                solution_level: 'Add exclude_bootstrap_tools to the solution definition — applies to ALL skills. Both levels merged (union).',
              },
              common_excludes: {
                'readFile + getCurrentProjectPath': 'Most skills don\'t need filesystem access.',
                'getChatTranscript': 'Skills that don\'t review conversation history.',
                'sys.handoffToSkill + sys.askSkill + sys.findCapability + sys.listSkills': 'Single-skill solutions — exclude all multi-agent routing tools to save planner token budget.',
                'sys.step + sys.callAiWithTools': 'Simple skills that don\'t need sub-agent delegation.',
              },
            },
            when_to_optimize: 'Skills with many domain tools (10+) benefit most — pinning key tools + excluding unused system tools maximizes the planner\'s visibility of what matters. Skills with few tools (< 5) don\'t need this.',
            example: 'ateam_patch(solution_id, target="skill", skill_id="my-skill", updates={ bootstrap_tools: ["orders.list", "identity.lookup"], exclude_bootstrap_tools: ["readFile", "getCurrentProjectPath", "getChatTranscript"] })',
          },
        },
        fields: {
          model: { type: 'string', required: false, description: 'LLM model (e.g., "claude-sonnet-4-20250514")' },
          temperature: { type: 'number', required: false, description: 'LLM temperature (0.0-1.0)' },
          max_iterations: { type: 'number', required: false, description: 'Shorthand for rv2.max_iterations. Controls how many tool calls the agent can make per job. Tune based on task complexity.' },
          max_replans: { type: 'number', required: false, description: 'Shorthand for hlr.replanning.max_replans' },
          rv2: {
            type: 'object', description: 'Runtime verification v2 — controls iteration budget, timeouts, and behavior at limits.',
            fields: {
              max_iterations: { type: 'number', description: 'Max tool calls per job (default: 10, platform fallback: 16). Simple lookups need 8-12, investigations need 20-30, deep analysis 30+.' },
              iteration_timeout_ms: { type: 'number', description: 'Timeout per iteration in ms (default: 30000)' },
              allow_parallel_tools: { type: 'boolean', description: 'Allow parallel tool execution (default: false)' },
            },
          },
          hlr: {
            type: 'object', description: 'High-level reasoning',
            fields: {
              enabled: { type: 'boolean', default: true },
              critic: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  check_interval: { type: 'number', description: 'Check every N iterations (default: 3)' },
                  strictness: { type: 'enum', values: ['low', 'medium', 'high'] },
                },
              },
              reflection: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  depth: { type: 'enum', values: ['shallow', 'medium', 'deep'] },
                },
              },
              replanning: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  max_replans: { type: 'number', description: 'Max re-plans (default: 2)' },
                },
              },
            },
          },
          autonomy: {
            type: 'object',
            fields: {
              level: { type: 'enum', values: ['autonomous', 'supervised', 'restricted'] },
            },
          },
          finalization_gate: {
            type: 'object', required: false,
            fields: {
              enabled: { type: 'boolean', description: 'Validate responses before sending (default: true)' },
              max_retries: { type: 'number', description: 'Retry count (0-10, default: 2)' },
            },
          },
          internal_error: {
            type: 'object', required: false, description: 'Internal error handling and RESOLUTION mode',
            fields: {
              enabled: { type: 'boolean', default: true },
              tool_not_found: {
                type: 'object',
                fields: {
                  enter_resolution_after: { type: 'number', description: 'Failures before RESOLUTION mode (default: 1)' },
                  retryable: { type: 'boolean' },
                },
              },
              resolution: {
                type: 'object',
                fields: {
                  max_iterations: { type: 'number' },
                  allowed_capabilities: { type: 'string[]' },
                },
              },
              loop_detection: {
                type: 'object',
                fields: {
                  enabled: { type: 'boolean' },
                  identical_call_threshold: { type: 'number', description: 'Identical calls before flagging (default: 2)' },
                },
              },
            },
          },
        },
      },

      // ── Grant Mappings ──
      grant_mappings: {
        type: 'array', required: false,
        description: 'Auto-issue grants from tool responses. When a tool succeeds, extract values and create grants.',
        item_schema: {
          tool: { type: 'string', required: true, description: 'Tool name that triggers the grant' },
          on_success: { type: 'boolean', description: 'Only issue on successful tool call' },
          grants: {
            type: 'array',
            item_schema: {
              key: { type: 'string', description: 'Grant key (e.g., "ecom.customer_id")' },
              value_from: { type: 'string', description: 'JSON path into tool result (e.g., "$.candidates[0].customer_id")' },
              condition: { type: 'string', required: false, description: 'Condition for issuing (e.g., "$.candidates.length == 1")' },
              ttl_seconds: { type: 'number', required: false },
            },
          },
        },
      },

      // ── Access Policy ──
      access_policy: {
        type: 'object', required: false,
        description: 'Declarative access control rules for tools',
        fields: {
          rules: {
            type: 'array',
            item_schema: {
              tools: { type: 'string[]', description: 'Tool names this rule applies to. Use "*" for all tools.' },
              effect: { type: 'enum', values: VALID_EFFECTS, description: 'allow = permit, deny = block, constrain = inject filter' },
              requires_grants: { type: 'string[]', required: false, description: 'Grants required to match this rule' },
              inject: { type: 'object', required: false, description: 'Values to inject into tool inputs (for constrain)' },
            },
          },
        },
      },

      // ── Response Filters ──
      response_filters: {
        type: 'array', required: false,
        description: 'Strip or mask sensitive fields from tool responses',
        item_schema: {
          tools: { type: 'string[]', description: 'Tool names to filter' },
          strip_fields: { type: 'string[]', description: 'JSON paths to remove entirely' },
          mask_fields: { type: 'string[]', description: 'JSON paths to mask (e.g., replace with "***")' },
          condition: { type: 'string', required: false, description: 'Only apply filter when condition is true' },
        },
      },

      // ── Channels ──
      channels: {
        type: 'array', required: false,
        description: 'Communication channel configuration',
        item_schema: {
          type: { type: 'enum', values: ['api', 'slack', 'email', 'webhook', 'telegram'] },
          enabled: { type: 'boolean' },
          config: { type: 'object', description: 'Channel-specific settings (rate_limit, endpoint, etc.)' },
        },
      },

      // ── Skill Identity ──
      skill_identity: {
        type: 'object', required: false,
        description: 'Who the skill is (independent of channels)',
        fields: {
          actor_ref: { type: 'string', description: 'Reference to CORE actor (e.g., "agent::my-skill")' },
          display_name: { type: 'string' },
          avatar_url: { type: 'string', required: false },
          channel_identities: {
            type: 'object', required: false,
            fields: {
              email: {
                type: 'object',
                fields: {
                  from_name: { type: 'string' },
                  from_email: { type: 'string' },
                  signature: { type: 'string', required: false },
                },
              },
              slack: {
                type: 'object',
                fields: {
                  bot_name: { type: 'string', required: false },
                  bot_icon_url: { type: 'string', required: false },
                },
              },
            },
          },
        },
      },

      // ── Prompt ──
      prompt: {
        type: 'string', required: false,
        description: 'Full system prompt for the skill. Alternative to role.persona for more detailed instructions.',
      },

      // ── Example Conversations ──
      example_conversations: {
        type: 'array', required: false,
        description: 'Few-shot examples for the LLM',
        item_schema: {
          title: { type: 'string' },
          messages: {
            type: 'array',
            item_schema: {
              role: { type: 'enum', values: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
            },
          },
        },
      },
    },

    // ── System Tools ──
    system_tools: {
      description: 'Tools provided by the A-Team runtime — do NOT define these in your tools array',
      prefixes: SYSTEM_TOOL_PREFIXES,
      known_tools: {
        'sys.askUser': 'Pause job execution to request user input; resumes when user responds',
        'sys.finalizePlan': 'Finalize and polish the agent response with persona application',
        'sys.emitUserMessage': 'Send a message to the user mid-workflow (e.g., ask for OTP code)',
        'sys.handoffToSkill': 'Transfer the conversation to another skill (TERMINAL). Built-in, zero config — always available. Args: to_skill (required), grants, summary, original_goal, ttl_seconds. Platform auto-injects channel context.',
        'sys.askSkill': 'Query another skill and wait for the answer (NON-TERMINAL). Creates a sub-job on the target skill, polls for completion, returns the answer. The calling skill continues its plan with the response. Args: to_skill (required), message (required), timeout_seconds (default: 60, max: 120). Returns: { ok, answer, sub_job_id, skill, elapsed_ms }. Use when you need data from another skill\'s domain without fully handing off.',
        'sys.findCapability': 'Search all skills in the solution to find which skill and tools can handle a given request. Uses a prebuilt capability index — zero LLM cost at query time. Args: query (required, natural language e.g. "delete old emails"), top_k (default: 5, max: 10), rebuild (force index rebuild, expensive). Returns: results[{ capability, skill, skillName, tools, intent, confidence, matchScore }], indexMeta. The index auto-rebuilds on skill deploy.',
        'sys.listSkills': 'List all skills in the solution with descriptions, connectors, and supported intents. Zero LLM cost. Returns: { ok, count, skills[{ slug, name, description, connectors, intentCount, intents, toolCount }] }. Use for an overview of available skills before routing decisions.',
        'sys.focusUiPlugin': 'Bring a UI plugin into focus in the user\'s context panel. Fire-and-forget. Args: plugin_id (required, full plugin ID e.g. "mcp:connector-id:plugin-name"). Use this to show a dashboard or visualization to the user.',
        'sys.trigger': 'Create, list, update, or delete dynamic schedule triggers at runtime. Allows skills to programmatically set up recurring (cron/every) or one-shot (once) triggers. Args: action (required: create|list|update|delete|pause|resume), trigger_id, schedule, prompt, skill_slug, description, input, concurrency, timezone, auto_delete. Cross-skill: a skill can create triggers targeting other skills.',
        'sys.dispatch_skill_job': 'Dispatch a job to another skill (async, non-terminal)',
        'sys.approval.record': 'Record an approval decision',
        'ui.listPlugins': 'List available UI plugins from a connector',
        'ui.getPlugin': 'Get the manifest for a specific UI plugin',
        'cp.admin_api': 'Actor and identity management (CRUD actors, tokens, audit)',
        'cp.fe_api': 'Frontend API proxy for context plugin iframe requests',
        'cp.listContextPlugins': 'List all context plugins from connected connectors',
        'cp.getContextPlugin': 'Get a specific context plugin manifest',
        'platform.dataStore.set': 'Raw key-value store per actor. Store structured data (cookies, tokens, cached API responses) that should NOT go through memory-mcp normalization. Args: key (string, required), value (string or JSON, required), ttl_seconds (optional, auto-expire). Stored in dedicated MongoDB collection "actor_data".',
        'platform.dataStore.get': 'Retrieve raw value by exact key for the current actor. JSON values auto-parsed. Returns { ok, found, value, value_type, expires_at }.',
        'platform.dataStore.delete': 'Delete a key-value pair. Args: key (required).',
        'platform.dataStore.list': 'List stored keys, optionally filtered by prefix. Args: prefix (optional), limit (default 50, max 200). Returns { ok, keys[{key, value_type, updated_at, expires_at}], count }.',
      },
      dataStore_vs_memory: {
        description: 'When to use platform.dataStore vs memory-mcp:',
        'platform.dataStore': 'Machine-facing raw data: session cookies, OAuth tokens, cached API responses, serialized state. Stored verbatim — no normalization, no LLM summarization, no embeddings. Exact key-value. Optional TTL.',
        'memory-mcp': 'User-facing knowledge: facts, preferences, instructions, user model. Smart memory with normalization, deduplication, semantic search, LLM-powered compaction. Visible in the Memories UI panel.',
        rule: 'If the data is for machines to read back exactly → dataStore. If the data is for the agent to reason about or for the user to see → memory.',
      },
      note: 'Any tool name starting with sys., ui., cp., or platform. is recognized as a system tool by the validator',
    },

    // ── Platform Authentication (Generic Login) ──
    platform_authentication: {
      description: 'Generic login mechanism for any website. The user signs in on their own device (native WebView on mobile, iframe on web) — no passwords touch the LLM or the server. Cookies are captured and persisted automatically. Provided by the browser-mcp platform connector.',
      when_to_use: [
        'Any skill that needs the user logged into a website (LinkedIn, Booking, Facebook, etc.)',
        'Works for: username/password, OAuth, SSO/SAML, MFA/2FA, passkeys/biometrics',
        'Exception: Google blocks WebView logins — use dedicated OAuth flow (Linking.openURL) for Google services',
      ],
      flow: [
        '1. Skill calls web.openLoginWebView(url, cookie_domain, success_url_pattern) — returns session_token',
        '2. Platform opens native WebView on the user\'s device with the real login page',
        '3. User signs in using any method (password manager, Face ID, MFA, etc.)',
        '4. When success_url_pattern matches the current URL → cookies captured automatically',
        '5. Cookies stored in platform.dataStore (7-day TTL) + injected into Playwright browser context',
        '6. Subsequent web.navigate calls to that domain are already authenticated',
        '7. On container restart, stored cookies are restored from dataStore into Playwright',
      ],
      tools: {
        'web.openLoginWebView': {
          description: 'Open a native login WebView on the user\'s device. Returns a session_token for correlation.',
          args: {
            url: 'Login URL (e.g. "https://www.linkedin.com/login")',
            cookie_domain: 'Domain to capture cookies for (e.g. "linkedin.com")',
            success_url_pattern: 'Regex — when the URL matches, login is complete (e.g. "linkedin\\\\.com/feed"). If omitted, a "Done" button is shown.',
            timeout_ms: 'Max wait time in ms (default: 300000 = 5 min)',
          },
          returns: '{ ok, session_token, timeout_ms, _ui_command... }',
        },
        'web.awaitLoginWebView': {
          description: 'Block until the user finishes signing in or timeout fires. Pair with web.openLoginWebView.',
          args: { session_token: 'Token returned by web.openLoginWebView' },
          returns: '{ ok, cookies: [...] } on success, { ok: false, error: "login_webview_timeout" } on timeout',
        },
        'web.submitLoginWebView': {
          description: 'Internal callback from the mobile plugin — NOT for skills to call directly. Delivers captured cookies back to the server.',
        },
      },
      skill_pattern: {
        description: 'How skills should handle login:',
        do: [
          'Check login status BEFORE opening login (e.g. call your *.status tool first)',
          'Call web.openLoginWebView → web.awaitLoginWebView as a pair',
          'Use success_url_pattern for auto-detection when possible',
          'Handle "already signed in" gracefully (success_url matches immediately)',
        ],
        do_not: [
          'Do NOT automate login with web.fill / web.click — that bypasses MFA and leaks passwords to the LLM',
          'Do NOT call web.navigate before web.openLoginWebView for the same site — it shows the Playwright screenshot view unnecessarily',
          'Do NOT hardcode credentials or tokens in skill definitions',
        ],
        example_flow: [
          '// Iteration 1: check status',
          '{ tool: "linkedin.status", args: {} }',
          '// → returns { connected: false }',
          '',
          '// Iteration 2: open login',
          '{ tool: "web.openLoginWebView", args: { url: "https://www.linkedin.com/login", cookie_domain: "linkedin.com", success_url_pattern: "linkedin\\\\.com/feed" } }',
          '// → returns { session_token: "abc123" }',
          '',
          '// Iteration 3: wait for user to finish',
          '{ tool: "web.awaitLoginWebView", args: { session_token: "abc123" } }',
          '// → returns { ok: true, cookies: [...] } — cookies auto-stored in dataStore',
        ],
      },
      cookie_persistence: {
        storage: 'platform.dataStore with key format "auth_cookies:{domain}" (e.g. "auth_cookies:linkedin.com")',
        ttl: '7 days — auto-expires via MongoDB TTL index',
        scope: 'Per actor (user) — each user\'s cookies are isolated',
        restore: 'On new Playwright session, stored cookies are automatically loaded from dataStore and injected into the browser context',
      },
      plugin_bridge: {
        description: 'UI plugins can dismiss themselves after completing their task:',
        react_native: 'bridge.close() — returns user to chat view',
        iframe: 'window.parent.postMessage({ source: "adas-plugin", action: "close" }, "*")',
        behavior: 'Host exits plugins mode. Plugin stays mounted (not destroyed). 10s auto-close on success is recommended UX.',
      },
    },

    // ── Python Helpers (available inside run_python_script) ──
    python_helpers: {
      description: 'Built-in Python functions available in every run_python_script execution. These are injected as a prelude — no imports needed.',
      helpers: {
        'adas_call_tool(name, args, timeout_sec=120)': {
          description: 'Call any ADAS tool from Python via the RPC bridge. Blocks until the tool returns. Returns dict with ok, result, error fields.',
          args: { name: 'Tool name (string)', args: 'Tool arguments (dict, optional)', timeout_sec: 'Max wait time (default: 120)' },
          returns: '{ ok: True/False, result: <tool output>, error: <message if failed> }',
          example: 'result = adas_call_tool("gmail.send", {"to": "alice@example.com", "subject": "Hi", "body": "Hello!"})',
        },
        'adas_emit_progress(message, step=None, total=None, data=None)': {
          description: 'Emit a progress event visible to the user in real-time and stored in the tool result. Uses the same proven RPC bridge as adas_call_tool — guaranteed delivery, zero timing issues. Essential for fat tools (browser automation, multi-step workflows) that run for minutes.',
          args: {
            message: 'Human-readable status string (required). Shown to the user in the UI.',
            step: 'Current step number (optional, int). Displayed as [step/total] in the UI.',
            total: 'Total number of steps (optional, int).',
            data: 'Arbitrary structured data dict (optional). Included in the progress log for the LLM.',
          },
          behavior: [
            'Blocks ~50ms per call (one RPC round-trip). Use between real work, not in tight loops.',
            'Always allowed — bypasses the allowed_tools check. No configuration needed.',
            'Events appear in result._progress[] when the tool returns (enriched result for LLM planning).',
            'Events appear in the UI in real-time via SSE (web) and WebSocket (mobile).',
            'Events are stored on job.state.__live_progress[] for chain-level aggregation.',
            'Watchdog signals (_lastActivityTs, _rpcErrorStreak) feed into the HLR signals system for critic-driven abort decisions.',
          ],
          example: [
            'adas_emit_progress("Restoring session", step=1, total=4)',
            'adas_emit_progress("Scraping reactions", step=2, total=4, data={"url": "https://linkedin.com/notifications"})',
            'adas_emit_progress("Processing 12 reactions", step=3, total=4, data={"count": 12})',
            'adas_emit_progress("Done", step=4, total=4)',
          ],
        },
        'adas_output_json(payload)': {
          description: 'Output a JSON payload with robust markers. Use when expect_json=True in run_python_script. Avoids interference from debug prints to stdout.',
          args: { payload: 'Dict or list to output as JSON' },
          example: 'adas_output_json({"status": "ok", "items": [1, 2, 3]})',
        },
        'sp_get(name, default=None, parse_json=True)': {
          description: 'Read a job scratchpad value. Scratchpads persist across iterations within the same job.',
          args: { name: 'Scratchpad key', default: 'Default value if not found', parse_json: 'Auto-parse JSON strings (default: True)' },
        },
        'sp_set(name, content, mode="set", type="json")': {
          description: 'Write a job scratchpad value. Calls sys.step internally.',
          args: { name: 'Scratchpad key', content: 'Value to store', mode: 'set|append|merge', type: 'json|text' },
        },
        'sp_append(name, content)': { description: 'Append to a text scratchpad. Shorthand for sp_set(name, content, mode="append", type="text").' },
        'sp_merge(name, obj)': { description: 'Merge a dict into a JSON scratchpad. Shorthand for sp_set(name, obj, mode="merge", type="json").' },
        'adas_context': {
          description: 'Dict containing job context — scratchpads, arguments, conversation history. Available as a global variable.',
          fields: { scratchpads: 'Dict of scratchpad name → {content, type, ts}', args: 'Tool arguments passed by the planner' },
        },
      },
    },

    // ── Script-Level JIT Shortcuts (platform feature, Level 2) ──
    script_caching: {
      description:
        'Platform feature for stabilizing fat Python tools that interact with flaky external systems (browser automation, web scraping, version-rotating APIs). ' +
        'At Level 2 (current), opting in transforms a tool into a first-class dispatchable function: the planner calls it directly (linkedin.status({})), the Core synthesizes a dispatcher, the scriptBaker generates Python from the tool description, the platform caches the working script, and subsequent calls replay. The LLM regenerates only when a cached run fails. ' +
        'Result: LinkedIn changes its DOM → first user triggers rebake → every subsequent user gets the updated script automatically, no redeploy.',
      what_the_solution_author_writes: [
        '1. A normal tool definition (name, description, inputs, output).',
        '2. `script_cache: { enabled: true }` on that tool. Defaults for invalidate_on + max_age_days are fine.',
        '3. OPTIONALLY, a `script_hint` field showing the baker what you think the Python should look like (seed, not binding).',
        '4. That\'s it. No run_python_script boilerplate, no Python template in the description, no tool_name arg, no persona rules.',
      ],
      what_happens_automatically: [
        'The planner sees tool X in its toolbox (from skill.tools).',
        'Planner calls X({args}) directly — like any tool.',
        'Core sees no runtime function for X but sees script_cache.enabled on X → synthesizes a dispatcher.',
        'Dispatcher calls runPythonScriptCore with tool_name=X and NO code.',
        'Hook A: cache miss → baker generates Python from tool description + optional script_hint → dry-runs → caches.',
        'Hook A: cache hit → cached script replayed.',
        'Hook B: classify outcome → refresh TTL (ok) / invalidate (domain_break/execution) / preserve (logical).',
        'Planner sees normal tool result. Zero awareness of any of this.',
      ],
      when_to_use:
        'Turn this on for tools whose implementation is inherently unstable — browser automation, DOM scraping, APIs whose shape rotates between versions. ' +
        'Do NOT turn it on for deterministic compute or stable MCP-bridged tools.',
      failure_class_contract_AUTOMATIC: {
        description:
          'Every baked script includes a failure_class field — the baker\'s system prompt enforces it. Solution authors do not need to worry about this.',
        classes: {
          ok: 'Success → refresh TTL, increment hits.',
          logical: 'External system gave a valid NO (bad login, rate limit, moderation). → cache PRESERVED.',
          domain_break: 'Script assumption was wrong (selector null, shape changed). → cache INVALIDATED, rebake.',
          execution: 'Python traceback / non-zero exit / timeout. Platform auto-detects. → cache INVALIDATED, rebake.',
        },
      },
      opt_in_schema: 'See tools[].script_cache and tools[].script_hint in the tools.item_schema above.',
      defaults: {
        BAKER_MAX_ATTEMPTS: 5,
        CACHE_TTL_DAYS: 30,
        default_invalidate_on: ['execution', 'domain_break'],
      },
      design_doc: 'Docs/WIP/SCRIPT-LEVEL-JIT-SHORTCUTS.md in the ai-dev-assistant repo.',
    },

    // ── Validation Rules ──
    validation_rules: {
      description: 'What POST /validate/skill checks (5-stage pipeline)',
      pipeline: [
        {
          stage: 1,
          name: 'Schema Validation',
          description: 'Type checks, required fields, enum values. Catches structural errors.',
          checks: ALL_COVERAGE.filter(c => c.type === 'schema').map(c => `${c.field}: ${c.check}`),
        },
        {
          stage: 2,
          name: 'Reference Resolution',
          description: 'Cross-reference validation: workflow steps reference existing tools, intent mappings are valid, no duplicate IDs.',
          checks: ALL_COVERAGE.filter(c => c.type === 'reference').map(c => `${c.field}: ${c.check}`),
        },
        {
          stage: 3,
          name: 'Completeness Check',
          description: 'Are all required sections filled with meaningful content?',
          checks: ALL_COVERAGE.filter(c => c.type === 'completeness').map(c => `${c.field}: ${c.check}`),
        },
        {
          stage: 4,
          name: 'Security Validation',
          description: 'All tools have classifications, high-risk tools have access policies, response filters are valid.',
          note: `High-risk classifications requiring access policy: ${HIGH_RISK_CLASSIFICATIONS.join(', ')}`,
        },
        {
          stage: 5,
          name: 'Export Readiness',
          description: 'Final gate: no errors, all references resolved, required sections complete.',
        },
      ],
      known_gaps: COVERAGE_GAPS,
    },

    // ── Template ──
    template: {
      description: 'Minimal valid skill definition. Fill placeholders marked with <...>.',
      skill: {
        id: '<unique-skill-id>',
        name: '<Your Skill Name>',
        description: '<What this skill does>',
        version: '0.1.0',
        phase: 'TOOL_DEFINITION',
        connectors: ['<connector-id>'],
        problem: {
          statement: '<Describe the problem this skill solves (min 10 chars)>',
          context: '<Additional context>',
          goals: ['<Goal 1>'],
        },
        scenarios: [
          {
            id: 'scenario-1',
            title: '<Scenario title>',
            description: '<What happens in this scenario>',
            steps: ['<Step 1>', '<Step 2>'],
            expected_outcome: '<What should happen>',
          },
        ],
        role: {
          name: '<Agent Role Name>',
          persona: '<How the agent should behave — detailed persona description>',
          goals: ['<Goal>'],
          limitations: ['<What the agent must NOT do>'],
          communication_style: { tone: 'formal', verbosity: 'balanced' },
        },
        intents: {
          supported: [
            {
              id: 'intent-1',
              description: '<What this intent means>',
              examples: ['<Example user message 1>', '<Example user message 2>'],
            },
          ],
          thresholds: { accept: 0.85, clarify: 0.6, reject: 0.4 },
          out_of_domain: { action: 'redirect', message: '<Not my domain>', suggest_domains: [] },
        },
        tools: [
          {
            id: 'tool-1',
            id_status: 'permanent',
            name: '<connector-prefix>.<tool-name>',
            description: '<What this tool does>',
            inputs: [
              { name: '<param>', type: 'string', required: true, description: '<Param description>' },
            ],
            output: { type: 'object', description: '<What the tool returns>' },
            source: { type: 'mcp_bridge', connection_id: '<connector-id>', mcp_tool: '<tool-name>' },
            policy: { allowed: 'always' },
            mock: {
              enabled: true,
              mode: 'examples',
              examples: [{ id: 'example-1', input: {}, output: {}, description: '<Example description>' }],
            },
            security: { classification: 'public' },
          },
        ],
        policy: {
          guardrails: {
            never: ['<Something the agent must NEVER do>'],
            always: ['<Something the agent must ALWAYS do>'],
          },
          workflows: [],
          approvals: [],
          escalation: { enabled: false, conditions: [], target: '' },
        },
        engine: {
          model: 'claude-sonnet-4-20250514',
          temperature: 0.3,
          rv2: {
            max_iterations: 8,
            iteration_timeout_ms: 30000,
            allow_parallel_tools: false,
          },
          hlr: {
            enabled: true,
            critic: { enabled: false, strictness: 'medium' },
            reflection: { enabled: false, depth: 'shallow' },
          },
          autonomy: { level: 'autonomous' },
        },
        grant_mappings: [
          {
            _note: 'Optional: auto-issue grants from tool responses. Include only if this skill issues grants for other skills.',
            grant_key: '<namespace.grant_name>',
            source_tool: '<tool-name>',
            source_field: '$.result_field',
            condition: '<optional JS expression, e.g. output.verified === true>',
          },
        ],
        access_policy: {
          _note: 'Declarative access control. Use requires_grants for tools that need verified claims.',
          rules: [
            { tools: ['*'], effect: 'allow' },
          ],
        },
        response_filters: [
          {
            _note: 'Optional: strip sensitive fields from tool responses before showing to users.',
            id: 'strip-pii',
            strip_fields: ['<field.path.to.strip>'],
          },
        ],
        triggers: [
          {
            _note: 'Optional: schedule triggers for proactive behavior (notifications, monitoring, periodic checks). Remove if not needed.',
            id: '<trigger-id>',
            type: 'schedule',
            enabled: true,
            concurrency: 1,
            prompt: '<Specific instructions: what to check, which tools to use, when to act, when to skip. Include idempotency logic.>',
            every: 'PT5M',
          },
        ],
      },
    },

    // ── Agent Guide ──
    agent_guide: {
      description: 'Step-by-step instructions for an AI agent building an A-Team skill from scratch.',
      build_order: [
        '1. GET /spec/enums — learn all valid enum values',
        '2. GET /spec/skill — study the schema, validation rules, and system tools',
        '3. GET /spec/examples/skill — see a complete working example that passes validation',
        '4. Define your connectors — what external systems (MCP servers) does your agent need? Write the connector source code (Node.js/Python MCP server) that implements real business logic (database access, API calls, UI dashboards)',
        '5. Build the skill definition following this order: problem → scenarios → role → intents → tools → policy → engine → triggers (optional) → grant_mappings (if issuing grants) → access_policy → response_filters',
        '5b. (Optional) For proactive behavior: add static schedule triggers with specific prompts, OR add sys.trigger to bootstrap_tools so the agent can create dynamic triggers at runtime (cron, interval, or one-shot). If the skill needs to send notifications, link a messaging connector (telegram-mcp, gmail-mcp). See key_concepts.proactive_messaging and solution spec dynamic_triggers for the full pattern.',
        '6. POST /validate/skill with { "skill": <your definition> } — fix all errors before proceeding',
        '7. POST /deploy/solution — deploy everything at once (connectors + skills). The Skill Builder auto-generates Python MCP servers from your skill tool definitions. You do NOT need to write slugs or Python MCP code for skills — only connector implementations.',
        '--- After First Deploy: GitHub Dev/Main Workflow ---',
        '8. Every deploy auto-pushes to "dev" branch in GitHub with a version tag (dev-YYYY-MM-DD-NNN). The push is ASYNC — your deploy response comes back immediately, GitHub push runs in background.',
        '9. To verify the push completed: ateam_github_status(solution_id) — check latest commit on dev branch.',
        '10. To edit connector code: ateam_github_patch with { files: [{ path: "connectors/{id}/server.js", content: "..." }] }',
        '11. To redeploy from GitHub: ateam_build_and_run with github:true — connector code is auto-pulled from repo (no inline mcp_store needed)',
        '12. To edit skill definitions: ateam_patch — definitions live in the Builder, not GitHub',
        '13. To verify: ateam_test_skill or ateam_test_pipeline — test without connector changes too',
        '--- Promoting to Production ---',
        '14. List dev versions: GET /deploy/solutions/:id/versions/dev — see all available tags',
        '15. Promote to production: POST /deploy/solutions/:id/promote — merges dev → main, creates prod-YYYY-MM-DD-NNN tag',
        '16. Rollback if needed: POST /deploy/solutions/:id/rollback with { tag: "prod-...", confirm: true }',
        '17. "main" branch = production. "dev" branch = staging. Last 10 dev versions are kept automatically.',
      ],
      naming_conventions: {
        skill_id: 'lowercase-kebab-case (e.g., "order-support", "identity-assurance")',
        tool_id: 'prefixed with "tool-" (e.g., "tool-orders-get", "tool-customers-search")',
        tool_name: 'connector-prefix.resource.action (e.g., "orders.order.get", "identity.customer.verify")',
        workflow_id: 'descriptive_snake_case (e.g., "order_lookup_flow", "refund_approval_flow")',
        connector_id: 'lowercase-kebab-case, often with -mcp suffix (e.g., "orders-mcp", "identity-mcp")',
        intent_id: 'descriptive_snake_case (e.g., "check_order_status", "request_refund")',
        grant_key: 'namespace.name (e.g., "ecom.customer_id", "ecom.assurance_level")',
      },
      common_mistakes: [
        // ── CONNECTOR MISTAKES (most common, most painful) ──
        'FATAL: Starting a web server (express, fastify, http.createServer) inside a stdio connector — connectors MUST use stdio transport (stdin/stdout JSON-RPC), NOT HTTP. Code with app.listen() will crash with EADDRINUSE. The deploy pipeline now blocks this.',
        'FATAL: Using HttpServerTransport, SSEServerTransport, or StreamableHTTPServerTransport — A-Team ONLY supports StdioServerTransport. These HTTP transports bind to ports and crash.',
        'Using console.log() in a stdio connector — console.log writes to stdout which is the JSON-RPC channel. Use console.error() or process.stderr.write() instead.',
        'Calling process.exit() in connector code — MCP servers must stay alive. Let A-Team manage the lifecycle.',
        'Forgetting "type": "module" in package.json when using @modelcontextprotocol/sdk or ESM imports — the runtime is Node.js 22.x which fully supports ESM, but package.json must declare it.',
        'Defining stdio connectors without providing mcp_store code — if the connector server code is not pre-installed on A-Team Core, include it in the mcp_store field of the deploy payload. Without it, the connector will fail to start.',
        // ── UI CONNECTOR MISTAKES ──
        'FATAL: ui.getPlugin returning wrong manifest format — MUST return { render: { mode: "iframe", iframeUrl: "/ui/<plugin>/index.html" } }. Do NOT invent custom shapes like { plugin: { ui: { component, route } } } or put iframeUrl at the top level. Missing render.iframeUrl is a HARD DEPLOYMENT FAILURE. See GET /spec/examples/connector-ui for correct and wrong examples.',
        'ui.listPlugins returning a bare array instead of { plugins: [...] } — Core expects the wrapper object.',
        // ── SKILL MISTAKES ──
        'Forgetting security.classification on tools — every tool needs one',
        'High-risk tools (pii_write, financial, destructive) without access_policy rules → validation error',
        'Workflow steps referencing tool IDs instead of tool names — steps use tool.name not tool.id',
        'Tool source.connection_id not matching a connector in the skill.connectors array',
        'Intent examples that are too similar to each other — use diverse phrasings',
        'Missing mock examples for tools — needed for testing without real MCP connections',
        'Guardrails that contradict tool capabilities without access_policy to resolve the conflict',
        'Using invalid enum values — always check GET /spec/enums first',
        'Putting only { max_iterations, max_replans } in engine — use the full engine structure with model, temperature, rv2, hlr, and autonomy (see template)',
        'Omitting grant_mappings when a skill issues grants — if your skill verifies identity or produces claims consumed by other skills, add grant_mappings',
        'Trying to write Python MCP server code for skills — the Skill Builder auto-generates it from your tool definitions. Only connector source code (real business logic) needs to be written by you.',
        'Providing slug or mcpServer in deploy requests — these are computed automatically. Just provide skill definitions with tools.',
        // ── TRIGGER & PROACTIVE MESSAGING MISTAKES ──
        'Trigger prompt too vague (e.g., "check for updates") — be explicit about what to check, which tools to use, and what action to take. The skill has no context beyond the prompt.',
        'Missing messaging connector in skill.connectors[] — the skill cannot use send_message or send_email unless the connector (telegram-mcp, gmail-mcp) is linked to the skill',
        'No idempotency in trigger prompt — without markers like "skip if already NOTIFIED", the trigger will re-send the same notification every time it fires',
        'Setting concurrency > 1 for triggers that modify state — concurrent trigger jobs can create race conditions. Use concurrency=1 (default) unless the trigger is read-only',
        'Schedule trigger with very short interval (PT1M) and slow/complex prompt — if execution takes longer than the interval, jobs queue up. Match interval to expected execution time',
        // ── DYNAMIC TRIGGER MISTAKES ──
        'Trying to define sys.trigger in the tools array — sys.trigger is a built-in platform system tool. Just add "sys.trigger" to bootstrap_tools to pin it for the planner.',
        'Forgetting timezone for cron triggers — "cron:0 9 * * *" fires at 9 AM UTC. If the user is in a different timezone, pass timezone: "Asia/Jerusalem" (or appropriate IANA timezone).',
        'Creating one-shot triggers without auto_delete — the trigger stays in the database after firing. Use auto_delete: true (default for once:) to clean up automatically.',
        'Wrong schedule format — must be "cron:<expr>", "every:<duration>", or "once:<datetime>". Missing the type prefix (e.g., just "0 15 * * *" instead of "cron:0 15 * * *") will fail.',
        // ── GITHUB & VERSION CONTROL MISTAKES ──
        'Using github:true on the FIRST deploy — the GitHub repo does not exist yet. The first deploy MUST include mcp_store (inline connector code) to create the repo.',
        'Passing mcp_store AND github:true together — pick one. If github:true, connector code is pulled from GitHub. If mcp_store is provided, it is used directly.',
        'Editing skill definitions via GitHub — skill definitions (intents, tools, policy) live in the Builder, not in connector code. Use ateam_patch for definition changes, ateam_github_patch for connector code changes.',
        'Forgetting to redeploy after ateam_github_patch — patching GitHub only updates the repo. You must call ateam_build_and_run(github:true) to redeploy with the new code.',
        'Assuming GitHub push failed because the deploy response shows github.async=true — the push runs in the background. Use ateam_github_status() to check if it completed.',
        'Pushing directly to main — main is the production branch. All deploys go to dev. Use POST /promote to move tested versions to main.',
        // ── PER-CONNECTOR PATCHING MISTAKES ──
        'CRITICAL: Assuming one connector patch fixes all connectors — each connector has its OWN server.js with independent source code. If home-assistant-mcp has a feature but hue-mcp and tuya-mcp don\'t, you must patch EACH connector separately via ateam_github_patch.',
        'Patching a connector without reading its current code first — always call ateam_get_connector_source(solution_id, connector_id) or ateam_github_read(solution_id, "connectors/<id>/server.js") BEFORE patching. Each connector has different code, tools, and dependencies.',
        'Redeploying the entire solution to fix one connector — use ateam_github_patch to edit the specific connector\'s files, then ateam_build_and_run(github:true) to redeploy. You do NOT need to re-pass skill definitions if only connector code changed.',
        'Ignoring connector status "already_running" or "preserved" — these mean the connector IS running and has discovered tools. Check tool counts in ateam_get_solution(id, "status") before assuming a connector needs changes.',
      ],
      key_concepts: {
        connector_runtime: 'A-Team Core runs connector MCP servers on Node.js 22.x with full ESM support. Recommended: use @modelcontextprotocol/sdk with StdioServerTransport — it is the simplest and most reliable approach. Make sure package.json has "type": "module" and lists @modelcontextprotocol/sdk + zod as dependencies. Alternative: implement raw JSON-RPC over stdio with readline if you prefer zero dependencies. See the connector examples for both patterns.',
        connector_rules: {
          _CRITICAL: 'EVERY connector deployed to A-Team MUST follow these rules. Violations are caught at deploy time and blocked.',
          transport: 'A-Team connectors use STDIO transport — they are spawned as child processes and communicate via stdin/stdout JSON-RPC. There is NO HTTP mode for custom connectors.',
          must_use: 'StdioServerTransport from @modelcontextprotocol/sdk, or raw readline over process.stdin with JSON-RPC responses to process.stdout.',
          must_NOT_use: [
            'express(), fastify(), Koa, Hapi, or any web framework',
            'http.createServer(), https.createServer(), or net.createServer()',
            'app.listen(PORT) or any port binding',
            'HttpServerTransport, SSEServerTransport, StreamableHTTPServerTransport from MCP SDK',
          ],
          stdout_is_sacred: 'stdout is the JSON-RPC communication channel. NEVER write non-JSON-RPC data to stdout. Use console.error() or process.stderr.write() for logging.',
          stay_alive: 'MCP servers must stay alive and continuously process messages. Never call process.exit().',
          validation: 'The deploy pipeline scans connector source code for anti-patterns (web server code, port binding) and BLOCKS deployment if found.',
        },
        per_connector_independence: {
          _CRITICAL: 'Each connector in a solution has its OWN independent source code (server.js, package.json, plugins). Changing one connector does NOT affect others. A solution with 3 connectors (home-assistant-mcp, hue-mcp, tuya-mcp) has 3 separate codebases.',
          repo_structure: 'connectors/{connector-id}/server.js — each connector lives in its own directory under connectors/',
          read_before_patch: 'ALWAYS read current code before patching: ateam_get_connector_source(solution_id, connector_id) or ateam_github_read(solution_id, "connectors/{connector-id}/server.js")',
          patch_independently: 'To add a feature to multiple connectors, patch EACH one separately via ateam_github_patch. Example: to add a "set_brightness" tool to both hue-mcp and tuya-mcp, you need two separate patches — one for connectors/hue-mcp/server.js and one for connectors/tuya-mcp/server.js.',
          check_status: 'Use ateam_get_solution(solution_id, "status") to see which connectors are running and how many tools each has discovered. source: "already_running" or "preserved" means the connector IS active — check its tool_count before assuming it needs changes.',
          redeploy_after_patch: 'After patching connector files via ateam_github_patch, call ateam_build_and_run(github: true) to redeploy. This pulls ALL connector code from GitHub — unchanged connectors are preserved automatically.',
        },
        connector_storage: 'A-Team Core auto-injects a DATA_DIR environment variable into every stdio connector process, pointing to a tenant-scoped, connector-isolated directory. Use process.env.DATA_DIR to store SQLite databases, files, or any persistent data. No configuration needed — just read the env var in your connector code.',
        multi_user_data_isolation: {
          _CRITICAL: 'A-Team is multi-user. Multiple users (actors) share the same tenant. Connectors that store or retrieve per-user data MUST scope it by actorId.',
          headers_passed_to_connectors: {
            'X-ADAS-TENANT': 'Tenant/organization ID. Always present on every tool call.',
            'X-ADAS-ACTOR': 'Actor/user ID. Present when the user is authenticated (which is almost always). This is the user who triggered the current request.',
          },
          how_to_read: {
            stdio: 'Read process.env.ADAS_ACTOR_ID in your tool handler. A-Team Core sets it on every call.',
            http: 'Read req.headers["x-adas-actor"] from the incoming HTTP request.',
          },
          storage_rule: 'Include actorId as part of every storage key, file path, or database query. Example: store at DATA_DIR/actors/{actorId}/data.json, or query WHERE actor_id = ?. See GET /spec/examples/connector for complete code examples with SQLite, JSON files, and external API patterns.',
          tool_schema_rule: 'Tool schemas do NOT include actorId as a parameter. Actor identity flows transparently via headers — the LLM/planner never decides which user to query. This prevents one user from reading another user\'s data.',
          see_full_guide: 'GET /spec/examples/connector → _multi_user_data_isolation section has complete working code examples for every pattern.',
        },
        ui_capable_connectors: {
          _note: 'UI-capable connectors serve dashboard plugins via iframe. They MUST implement ui.listPlugins and ui.getPlugin tools.',
          required_tools: ['ui.listPlugins', 'ui.getPlugin'],
          manifest_contract: 'ui.getPlugin MUST return { id, name, version, render: { mode: "iframe", iframeUrl: "/ui/<plugin>/index.html" } }. The render.iframeUrl field is REQUIRED — missing it is a HARD DEPLOYMENT FAILURE.',
          file_structure: 'Put UI HTML files in ui-dist/<plugin-id>/index.html inside the connector mcp_store. Core serves them at /mcp-ui/<tenant>/<connector-id>/<plugin-id>/index.html. Do NOT put version in the path — version is a metadata field, not a directory.',
          deploying_ui_assets: 'Include ui-dist/ files in mcp_store alongside server code: { "my-connector": [{ path: "server.js", content: "..." }, { path: "ui-dist/my-plugin/index.html", content: "..." }] }. Both deploy and health check verify the HTML asset exists on disk via HTTP HEAD to /mcp-ui — missing files are reported as errors.',
          see_example: 'GET /spec/examples/connector-ui for a complete working example with correct AND wrong response formats.',
        },
        connector_wildcard_tools: {
          description: 'Use "connector-id:*" in a skill\'s tools[] array to grant access to ALL tools from a specific connector, without listing each tool individually. You can mix wildcards with individually-named tools from other connectors.',
          syntax: '"connector-id:*" — e.g., "mobile-device-mcp:*"',
          how_it_works: [
            '1. At runtime, the skill\'s tools[] array acts as a whitelist for connector tools.',
            '2. Tools with names ending in ":*" are treated as connector-level wildcards.',
            '3. The connector ID is extracted (everything before ":*") and ALL tools from that connector pass the whitelist.',
            '4. Individual tool names from other connectors are matched exactly.',
            '5. Core/system tools and UI plugin tools are NOT affected by the whitelist — they are always available.',
          ],
          example_tools_array: [
            '{ name: "mobile-device-mcp:*", id: "tool-mobile-all", description: "All mobile device tools (calendar, contacts, weather, etc.)" }',
            '{ name: "memory.store", id: "tool-memory-store", description: "Store a memory", inputs: [...], output: {...} }',
            '{ name: "memory.recall", id: "tool-memory-recall", description: "Recall memories", inputs: [...], output: {...} }',
          ],
          effect: 'The skill can use ALL tools from mobile-device-mcp (device.calendar.today, device.battery, etc.) plus only memory.store and memory.recall from the memory connector. Other tools from the memory connector are hidden from the planner.',
          validation_notes: [
            'Wildcard tools only need id, name, and description — inputs/output/mock are not required (since the real tool schemas come from the connector at runtime).',
            'Workflow steps and approval rules referencing tools from a wildcard connector produce "info" severity (not "warning") since they cannot be resolved at design time.',
            'The wildcard format must be exactly "connector-id:*" — the connector-id must not contain colons.',
          ],
          use_when: [
            'A connector provides many tools and you want the skill to use ALL of them (e.g., a device connector with 20+ tools).',
            'The connector is under active development and tools are added frequently — wildcards avoid updating the skill definition every time.',
          ],
          do_not_use_when: [
            'You want fine-grained control over which tools from a connector are available to the planner.',
            'The connector has tools that should NOT be accessible to this skill (security/scope reasons).',
          ],
        },
        // ═══════════════════════════════════════════════════════════════
        // TESTING & RUNTIME ANALYSIS
        // ═══════════════════════════════════════════════════════════════
        testing_and_runtime: {
          description: 'Complete guide to testing deployed solutions, monitoring execution, and diagnosing issues. Covers the full lifecycle: pre-deploy checks → functional testing → multi-turn conversations → job monitoring → performance analysis → debugging.',

          // ── 1. PRE-DEPLOY CHECKS ──
          pre_deploy_checks: {
            description: 'Verify the solution is ready before testing.',
            tools: {
              'ateam_get_solution(solution_id, "health")': {
                description: 'Cross-checks Builder definition vs Core state.',
                returns: 'Skills deployed, connectors connected, issues found.',
                use_when: 'After any deploy — confirm everything is running.',
              },
              'ateam_get_solution(solution_id, "connectors_health")': {
                description: 'Connector-level detail.',
                returns: 'Status (connected/disconnected), transport, tool count, errors per connector.',
                use_when: 'Debugging "unknown connector" or 0-tool issues.',
              },
              'ateam_get_solution(solution_id, "status")': {
                description: 'Deploy status overview.',
                returns: 'Which skills are deployed, their MCP ports, tool counts, internal IDs.',
                use_when: 'Verifying skill deployment after build_and_run or redeploy.',
              },
            },
            checklist: [
              '1. ateam_get_solution(id, "health") — all skills deployed? all connectors connected?',
              '2. ateam_get_solution(id, "connectors_health") — any connector with 0 tools?',
              '3. If issues found → fix and redeploy before testing.',
            ],
          },

          // ── 2. CONVERSATION TESTING (RECOMMENDED) ──
          conversation_testing: {
            description: 'The primary testing tool. Sends messages to the solution as a user would — the system auto-routes to the right skill. Supports multi-turn conversations for flows that require confirmations, follow-ups, or handoffs between skills.',
            tool: 'ateam_conversation(solution_id, message, actor_id?, wait?, timeout_ms?)',
            params: {
              solution_id: 'The solution to test',
              message: 'The user message (e.g., "send email to X" or "I confirm")',
              actor_id: 'Optional. Omit for a new conversation. Pass the actor_id from a previous response to continue the thread.',
              wait: 'true (default) = wait for completion. false = return job_id for async polling.',
              timeout_ms: 'Max wait time in ms (default: 60000, max: 300000).',
            },
            returns: {
              job_id: 'Unique job ID for this execution',
              actor_id: 'Actor ID — reuse this to continue the conversation',
              status: 'completed, failed, timeout, running',
              result: 'The skill response text',
              steps: 'Ordered list of tool calls made during execution',
              duration_ms: 'End-to-end execution time',
            },
            multi_turn_flow_async: {
              description: 'Recommended for complex flows. Start job, poll for progress, reply to prompts.',
              steps: [
                '1. r = ateam_conversation(solution_id, "send test email to john@example.com", wait: false)',
                '   → { job_id: "job_abc", actor_id: "test_17...", status: "running" }',
                '',
                '2. Poll: ateam_test_status(solution_id, skill_id, "job_abc")',
                '   → { status: "running", iteration: 3, steps: [...] }',
                '   → { status: "completed", result: "I\'ll send that email. Please confirm." }',
                '',
                '3. Reply: r = ateam_conversation(solution_id, "I confirm", actor_id: "test_17...", wait: false)',
                '   → { job_id: "job_def" (new job), actor_id: "test_17..." (same), status: "running" }',
                '',
                '4. Poll: ateam_test_status(solution_id, skill_id, "job_def")',
                '   → { status: "completed", result: "Email sent!" }',
              ],
            },
            multi_turn_flow_sync: {
              description: 'Simpler for quick tests. Each call blocks until the job completes.',
              steps: [
                '1. r = ateam_conversation(solution_id, "send test email to john@example.com")',
                '   → blocks up to 60s → { job_id, actor_id, status: "completed", result: "Please confirm." }',
                '',
                '2. r = ateam_conversation(solution_id, "I confirm", actor_id: r.actor_id)',
                '   → blocks → { job_id (new), actor_id (same), status: "completed", result: "Email sent!" }',
              ],
              note: 'Sync mode does the polling internally. Use async mode when you need to monitor progress or handle long-running jobs.',
            },
            key_concepts: {
              actor_id: 'The conversation thread. Same actor_id = Core treats messages as a continuation. Each message creates a new job_id but the actor provides context.',
              auto_routing: 'No skill_id needed. The solution\'s routing config (orchestrator, handoff triggers) determines which skill handles the message.',
              test_prefix: 'Auto-generated actor_ids start with "test_" — these are auto-cleaned after 24 hours.',
              custom_actor: 'You can pass your own actor_id (must start with "test_") for reproducible test sessions.',
            },

            example_scenario: {
              title: 'E2E test: "Delete old emails from trash"',
              description: 'A multi-turn test that exercises routing, handoff, confirmation, and follow-up.',
              steps: [
                {
                  step: 1,
                  action: 'Send initial message',
                  call: 'r = ateam_conversation("personal-adas", "delete all emails older than 7 days from my Gmail trash")',
                  response: '{ job_id: "job_abc", actor_id: "test_171...", status: "completed", result: "I found 25 emails in your Gmail Trash older than 7 days. Permanently deleting them is irreversible. Should I proceed?" }',
                  agent_decision: 'The result is a question asking for confirmation. This is NOT a final answer — I need to reply.',
                },
                {
                  step: 2,
                  action: 'Reply with confirmation',
                  call: 'r = ateam_conversation("personal-adas", "yes, delete them", actor_id: "test_171...")',
                  response: '{ job_id: "job_def", actor_id: "test_171...", status: "completed", result: "Done! Permanently deleted 25 emails from Gmail Trash." }',
                  agent_decision: 'The result confirms the action was taken. This is a final answer — test complete.',
                },
                {
                  step: 3,
                  action: 'Verify (optional follow-up in same thread)',
                  call: 'r = ateam_conversation("personal-adas", "how many emails are left in trash now?", actor_id: "test_171...")',
                  response: '{ job_id: "job_ghi", actor_id: "test_171...", status: "completed", result: "Your Gmail Trash is empty." }',
                  agent_decision: 'Verification confirms the deletion worked. Test passed.',
                },
              ],
              what_happened_behind_the_scenes: [
                'Step 1: Core routed to pa-orchestrator → orchestrator handed off to messaging-agent (email management)',
                'Step 1: messaging-agent called gmail.search, found 25 emails, asked for confirmation (per its destructive-action policy)',
                'Step 2: Same actor_id → Core continued the conversation with messaging-agent → agent called gmail.trash to delete',
                'Step 3: Same actor_id → messaging-agent called gmail.search again to verify',
              ],
              key_takeaway: 'The agent (you) decides what\'s a question vs a final answer by reading the result text. The platform just executes and returns results. Multi-turn works by reusing actor_id.',
            },
          },

          // ── 3. TARGETED SKILL TESTING ──
          targeted_testing: {
            description: 'Test a specific skill directly — bypasses routing. Use when you know which skill should handle the message and want to verify it in isolation.',
            tools: {
              'ateam_test_skill(solution_id, skill_id, message, wait?)': {
                description: 'Send a message directly to a specific skill.',
                sync_mode: 'wait=true (default): waits for completion, returns full result with steps.',
                async_mode: 'wait=false: returns job_id immediately. Poll with ateam_test_status.',
                returns: 'job_id, actor_id, skill_slug, status, result, steps, duration_ms.',
                supports_actor_id: 'Pass actor_id in the request body to continue a conversation within this skill.',
              },
              'ateam_test_status(solution_id, skill_id, job_id)': {
                description: 'Poll an async job\'s progress. Hidden tool — not in default list, but callable by name.',
                returns: 'iteration count, tool call steps, status (running/completed/failed), result when done.',
                usage: 'Call every 3-5 seconds after ateam_test_skill(wait:false) until status is completed or failed.',
              },
              'ateam_test_pipeline(solution_id, skill_id, message)': {
                description: 'Test ONLY intent detection + planning — no tool execution. Fast (<2s), no side effects.',
                returns: 'Intent classification (which intent matched, confidence score), first planned action.',
                use_when: 'Debugging routing — "why did the skill pick intent X instead of Y?"',
              },
            },
          },

          // ── 4. CONNECTOR TESTING ──
          connector_testing: {
            description: 'Test individual connector tools in isolation — bypasses skills entirely. Useful for verifying connector code before wiring tools into skills.',
            tool: 'ateam_test_connector(solution_id, connector_id, tool, args?)',
            examples: [
              'ateam_test_connector("my-solution", "home-assistant-mcp", "rooms.list") — list all rooms',
              'ateam_test_connector("my-solution", "gmail-mcp", "gmail.status") — check Gmail connection',
              'ateam_test_connector("my-solution", "memory-mcp", "memory.recall", { query: "user preferences" }) — search memories',
            ],
            use_when: [
              'A skill calls a connector tool and gets an error — test the tool directly to isolate the issue.',
              'After updating connector code — verify the tool works before testing the full skill.',
              'Exploring what a connector returns — understand the data shape before writing skill logic.',
            ],
          },

          // ── 5. DIRECT TOOL TESTING (tooltest protocol) ──
          direct_tool_testing: {
            description: 'Test individual tools directly via chat messages — bypasses the entire LLM pipeline (intent detection, planning, iteration). Sends a special [tooltest] message that executes the tool and returns results through the standard job pipeline (SSE, conversation turn). Works with ANY tool from any connector — generic, not a hardcoded list.',
            syntax: {
              real_mode: '[tooltest] <tool_name> <json_args>',
              mock_mode: '[tooltest:mock] <tool_name> <json_args>',
              description: 'Real mode calls the actual tool. Mock mode verifies the tool exists and returns metadata without calling the real tool.',
            },
            modes: {
              real: {
                prefix: '[tooltest]',
                description: 'Calls the actual tool (core or connector) and returns real results. Requires a real actor with device/data behind the connector.',
                example_messages: [
                  '[tooltest] device.calendar.today {}',
                  '[tooltest] device.weather.forecast {"days":3}',
                  '[tooltest] device.message.send {"to":"Sarah","body":"Running late"}',
                  '[tooltest] device.dnd.set {"enabled":true,"duration_minutes":60}',
                  '[tooltest] sys.focusUiPlugin {"plugin_id":"mcp:personal-assistant-ui-mcp:schedule-panel"}',
                ],
              },
              mock: {
                prefix: '[tooltest:mock]',
                description: 'Verifies tool exists and returns mock metadata (tool name, source connector, description) WITHOUT calling the real tool. Used for CI/CD pipeline validation — tests routing, finalization, conversation turn creation.',
                example_messages: [
                  '[tooltest:mock] device.calendar.today {}',
                  '[tooltest:mock] device.battery {}',
                  '[tooltest:mock] device.weather.current {}',
                ],
                mock_response_format: {
                  found_connector: '{ ok: true, mock: true, tool: "device.calendar.today", source: "connector:mobile-device-mcp", description: "Get today\'s calendar events", args: {} }',
                  found_core: '{ ok: true, mock: true, tool: "sys.focusUiPlugin", source: "core", args: {...} }',
                  not_found: '{ ok: false, mock: true, error: "Tool \\"x\\" not found in core or connectors" }',
                },
              },
            },
            http_api: {
              endpoint: 'POST /api/chat',
              headers: { 'Authorization': 'Bearer <PAT_TOKEN>', 'Content-Type': 'application/json' },
              request_body: '{ "message": "[tooltest] <tool_name> <json_args>", "actorId": "<optional-test-actor-id>" }',
              response: '{ ok: true, id: "<job_id>", jobId: "<job_id>", streamUrl: "/api/stream/<job_id>" }',
              get_result: 'GET /api/jobs/<job_id> — poll until job.done is true (tooltest jobs complete in <3s)',
            },
            actor_id_convention: {
              description: 'One actor per test session. Reuse the same actorId across all turns in that session for conversation continuity. Actor auto-expires in 24h — zero garbage.',
              pattern: {
                start_of_session: 'Generate: test-{timestamp}-{random} (e.g., "test-1711500000-abc123")',
                all_turns_in_session: 'Reuse the same actorId for conversation continuity',
                after_24h: 'Actor auto-expires via MongoDB TTL index — no cleanup needed',
              },
              auto_detection: 'Actors matching test-* or pipeline-test-* are auto-detected by isTestActor() and get a 24h TTL on creation.',
            },
            test_automation_example: {
              description: 'Bash script for CI/CD test automation.',
              steps: [
                '1. Generate actor per session: ACTOR_ID="test-$(date +%s)-$(openssl rand -hex 4)"',
                '2. Send tooltest: curl -s -X POST $BASE_URL/api/chat -H "Authorization: Bearer $PAT" -d \'{"message":"[tooltest:mock] device.battery {}","actorId":"\'$ACTOR_ID\'"}\'',
                '3. Extract job_id from response',
                '4. Wait ~3s (tooltest jobs are fast)',
                '5. Read result: curl -s $BASE_URL/api/jobs/$JOB_ID -H "Authorization: Bearer $PAT"',
                '6. Assert result.ok is true',
              ],
            },
            server_execution_path: [
              'POST /api/chat → server.js: startJob()',
              'jobRunner.js: runWithTenant(tenant, runBody, {actorId})',
              'mainloop.js: regex match on [tooltest] or [tooltest:mock] prefix',
              'REAL: tools[name](args) || connectorManager.callTool(connId, name, args)',
              'MOCK: verify tool exists in core/connectors, return mock metadata',
              'sysFinalizePlan({content, contentType: "markdown"}) → writeConversationTurn(job)',
              'job.done = true',
            ],
            key_properties: [
              'Generic — works with ANY tool from any connector, not a hardcoded list.',
              'Full pipeline — SSE, finalization, conversation turn — same as normal messages.',
              'No LLM — bypasses intent detection, planning, and iteration loops entirely.',
              'Same auth — PAT token or JWT, same as regular chat.',
              'Test actor per session — generate test-* actorId once, reuse for all turns, auto-expires in 24h.',
            ],
          },

          // ── 6. VOICE TESTING ──
          voice_testing: {
            description: 'Simulate multi-turn phone conversations without making a real call. Runs the full voice pipeline.',
            tool: 'ateam_test_voice(solution_id, messages[], phone_number?, skill_slug?, timeout_ms?)',
            flow: 'Sends messages sequentially, simulating a caller. Each turn goes through: session → caller verification → routing → skill execution → response.',
            params: {
              messages: 'Array of user messages in conversation order (e.g., ["hi", "check my appointments", "cancel the 3pm one"])',
              phone_number: 'Optional: simulated caller number. If in the solution\'s known phones list, auto-verified.',
              skill_slug: 'Optional: target a specific skill instead of using voice routing.',
            },
            use_when: 'Testing voice-enabled solutions end-to-end. Verifying caller verification, voice routing, and multi-turn voice flows.',
          },

          // ── 7. EXECUTION LOGS ──
          execution_logs: {
            description: 'Inspect what happened during a job — every tool call, every decision, every error. The primary debugging tool after a test fails or behaves unexpectedly.',
            endpoint: 'GET /deploy/solutions/:id/logs',
            query_params: {
              'job_id': 'Trace for a specific job (from test response)',
              'skill_id': 'Filter to a specific skill\'s jobs',
              'limit': 'Number of recent jobs (default: 10)',
            },
            returns: [
              'job_id, skill_id, status (completed/failed/timeout)',
              'steps[] — ordered execution steps: tool name, arguments, result, duration_ms, errors',
              'total_duration_ms, input message, final response',
            ],
            workflow: [
              '1. Run ateam_conversation or ateam_test_skill — note the job_id',
              '2. GET /deploy/solutions/:id/logs?job_id=<job_id>',
              '3. Inspect: right intent? right tools? any errors? slow steps?',
            ],
          },

          // ── 8. EXECUTION METRICS ──
          execution_metrics: {
            description: 'Aggregate performance data across multiple jobs. Identify slow tools, error patterns, and bottlenecks.',
            endpoint: 'GET /deploy/solutions/:id/metrics',
            query_params: {
              'job_id': 'Metrics for one job',
              'skill_id': 'Aggregated metrics for one skill',
              'limit': 'Number of recent jobs to analyze',
            },
            returns: [
              'Response times (avg/p50/p95)',
              'Tool call frequency and duration',
              'Error rates per tool',
              'Intent distribution',
              'Replan count',
            ],
            use_when: 'Optimizing a slow skill, finding unused tools, or identifying error patterns across many executions.',
          },

          // ── 9. DEBUGGING SCENARIOS ──
          debugging_scenarios: {
            'Wrong skill handles the message': [
              '1. ateam_conversation — note which skill_slug responded',
              '2. ateam_test_pipeline on the orchestrator — check how it classified the intent',
              '3. Fix: update orchestrator intents or handoff triggers with ateam_patch',
            ],
            'Skill gives wrong answer': [
              '1. ateam_test_pipeline — did the right intent match?',
              '2. If wrong intent → ateam_patch to fix intent descriptions/examples',
              '3. If right intent, wrong tools → check logs for tool call sequence',
              '4. If right tools, wrong response → ateam_patch to fix persona/guardrails',
            ],
            'Skill times out': [
              '1. Check logs — which tool took longest?',
              '2. ateam_test_connector — test that tool directly',
              '3. If connector slow → fix connector code',
              '4. If too many iterations → adjust engine.rv2.max_iterations',
            ],
            'Connector tool returns error': [
              '1. ateam_test_connector — isolate the issue',
              '2. ateam_get_connector_source or ateam_github_read — read the code',
              '3. Fix with ateam_github_patch + ateam_upload_connector',
            ],
            'Handoff ping-pong (skills loop)': [
              '1. Check logs — two skills handing off to each other repeatedly',
              '2. One skill lacks the tools it needs (e.g., Gmail tools not connected)',
              '3. Fix: either add the missing connector to the skill, or update the orchestrator to not route there',
            ],
            'Skill asks for confirmation and you need to reply': [
              '1. The skill\'s response IS the completed job result (e.g., "Please confirm")',
              '2. Read the result, then send a new message: ateam_conversation(id, "I confirm", actor_id: previous_actor_id)',
              '3. This creates a new job in the same conversation thread — the skill has context from the previous turn',
            ],
            'UI plugins missing after deploy': [
              '1. ateam_get_solution(id, "connectors_health") — check if the UI connector is running',
              '2. ateam_test_connector(id, connector_id, "ui.listPlugins") — verify plugins are registered',
              '3. If missing: ateam_upload_connector(id, connector_id, github:true) — re-upload with HTML files',
            ],
          },

          // ── TESTING BEST PRACTICES ──
          best_practices: [
            'Always run ateam_get_solution(id, "health") before testing — catch deploy issues early.',
            'Use ateam_conversation for end-to-end tests — it tests routing + skill execution together.',
            'Use ateam_test_pipeline for fast intent debugging — no side effects, <2s response.',
            'Use ateam_test_connector to isolate connector issues — don\'t debug through the skill.',
            'For multi-turn flows (confirmations, follow-ups): always use ateam_conversation with actor_id.',
            'Check logs after failed tests — the steps array shows exactly what happened.',
            'Test actors (test_ prefix) auto-expire after 24h — no cleanup needed.',
          ],
        },

        tool_vs_system_tool: 'Your tools come from MCP connectors. System tools (sys.*, ui.*, cp.*) are provided by the A-Team runtime — do NOT define them in your tools array.',
        grant_economy: 'Grants are verified claims that flow between skills. A skill issues grants via grant_mappings (tool output → grant). Another skill requires grants via access_policy. Security contracts enforce this at the solution level.',
        workflow_steps: 'Workflow steps are tool NAMES (not IDs). Example: ["orders.order.get", "sys.emitUserMessage"]. System tools are valid step targets.',
        access_policy_effects: '"allow" = permit unconditionally, "deny" = block, "constrain" = inject values into tool inputs (e.g., force customer_id from grant). Use "*" in tools array to cover all tools.',
        proactive_messaging: {
          description: 'Skills can send outbound messages (Telegram, email, etc.) proactively via triggers. Two ways to create triggers: (1) static triggers defined in skill YAML (deployed with the skill), (2) dynamic triggers created at runtime by the agent calling sys.trigger (e.g., user says "remind me tomorrow at 9 AM"). This is the ONLY way skills initiate contact — all other skill execution is reactive (triggered by user messages).',
          pattern: [
            '1. Link a messaging connector to the skill (e.g., telegram-mcp, gmail-mcp) — add to skill.connectors[]',
            '2. Define a send tool on the skill (e.g., telegram.send_message) with source.connection_id pointing to the messaging connector',
            '3a. STATIC: Create a schedule trigger in the skill triggers[] array with a prompt and interval (every: "PT5M")',
            '3b. DYNAMIC: The agent calls sys.trigger at runtime to create triggers on demand — supports cron expressions, ISO 8601 intervals, and one-shot datetime schedules. See solution spec dynamic_triggers section for full details.',
            '4. The trigger-runner fires the trigger on schedule → skill checks data → calls send tool if conditions match → skips if nothing to report',
          ],
          example_use_cases: [
            'Notify human PM when a task is stuck (3+ QA failures) — circuit-breaker trigger every 15min',
            'Send task completion summaries — poll trigger checks for status=done every 5min',
            'Daily digest emails — P1D trigger summarizes activity and sends via gmail-mcp',
            'Alert on anomalies — PT5M trigger monitors metrics and sends Telegram on threshold breach',
            '"Remind me tomorrow at 9 AM" — agent calls sys.trigger with once: schedule, fires once and auto-deletes',
            '"Turn on AC every day at 15:00" — agent calls sys.trigger with cron:0 15 * * * schedule',
          ],
          important_notes: [
            'Proactive triggers use the same tools as normal skill execution — no special API needed',
            'The messaging connector MUST be in skill.connectors[] (linked) for the skill to see its tools',
            'Use idempotency: add markers (e.g., comments, flags) to prevent sending the same notification twice',
            'Replies to proactive messages are routed automatically by the platform — no extra config needed',
            'HTTP transport connectors (telegram-mcp, gmail-mcp) run as external services, not spawned by the Builder. Add them to _connectors/state.json with transport: "http" and endpoint.',
          ],
          see_example: 'GET /spec/examples/skill — the Order Support Agent example includes schedule triggers with Telegram notifications',
        },
      },
    },
  };
}

function buildWorkflows() {
  return {
    description: 'Builder workflows — the step-by-step state machines the Skill Builder uses internally. Use these to guide users through building skills and solutions conversationally, replicating the Skill Builder experience.',
    usage: 'When a user wants to build a skill or solution, read this workflow and follow it step by step. At each phase, ask the user the right questions, collect their answers, build the definition incrementally, validate with adas_validate_skill / adas_validate_solution, and deploy with adas_deploy_solution.',

    skill_workflow: {
      description: 'State machine for building a single A-Team skill (autonomous AI agent)',
      phases: [
        {
          id: 'PROBLEM_DISCOVERY',
          order: 1,
          label: 'Problem Discovery',
          goal: 'Understand what problem this skill solves',
          what_to_ask: [
            'What problem should this AI agent solve?',
            'Who are the users? What domain is this in?',
            'What systems or data does it need access to?',
          ],
          what_to_build: {
            'problem.statement': 'Clear problem description (min 10 chars)',
            'problem.context': 'Domain context and background',
            'problem.goals': 'What the skill aims to achieve',
          },
          exit_criteria: 'problem.statement is defined and >= 10 characters',
          tips: [
            'Always suggest a concrete problem statement — don\'t just ask',
            'Include the domain context to help with later phases',
          ],
        },
        {
          id: 'SCENARIO_EXPLORATION',
          order: 2,
          label: 'Scenario Exploration',
          goal: 'Define concrete use cases that demonstrate the skill in action',
          what_to_ask: [
            'What are the most common situations this agent will handle?',
            'Walk me through a typical interaction step by step',
            'What edge cases should the agent handle?',
          ],
          what_to_build: {
            'scenarios[]': 'Array of scenarios, each with id, title, description, steps, expected_outcome',
          },
          exit_criteria: 'At least 1 scenario with title, description, and steps',
          tips: [
            'Suggest 2-3 scenarios based on the problem statement',
            'Each scenario should map to a different user intent',
            'Include both happy path and edge cases',
          ],
        },
        {
          id: 'INTENT_DEFINITION',
          order: 3,
          label: 'Intent Definition',
          goal: 'Define the user intents this skill can handle',
          what_to_ask: [
            'What distinct requests can users make?',
            'For each intent, what are example phrases a user might say?',
            'What should happen when an unrecognized request comes in?',
          ],
          what_to_build: {
            'intents.supported[]': 'Array of intents, each with id, description, and examples (diverse phrasings)',
            'intents.thresholds': 'Confidence thresholds for accept/clarify/reject',
            'intents.out_of_domain': 'What to do with unrecognized requests',
          },
          exit_criteria: 'At least 1 intent with at least 1 example',
          tips: [
            'Derive intents from the scenarios — each scenario usually maps to 1-2 intents',
            'Example phrases should be diverse, not repetitive',
            'Set out_of_domain to redirect for multi-skill solutions',
          ],
        },
        {
          id: 'TOOLS_PROPOSAL',
          order: 4,
          label: 'Tools Proposal',
          goal: 'Propose the tools (actions) this agent needs',
          what_to_ask: [
            'What actions does the agent need to perform?',
            'What data does it need to read or write?',
            'Which external systems does it connect to?',
          ],
          what_to_build: {
            'tools[]': 'Initial tool definitions with name, description — details come in next phase',
            'connectors': 'Which MCP connectors provide these tools',
          },
          exit_criteria: 'At least 1 tool defined',
          tips: [
            'Map each scenario step to a tool',
            'Use naming convention: connector-prefix.resource.action (e.g., orders.order.get)',
            'Don\'t forget system tools (sys.askUser, sys.emitUserMessage, sys.handoffToSkill, sys.askSkill, sys.findCapability, sys.listSkills, sys.focusUiPlugin, sys.trigger) for user interaction, multi-agent routing, UI control, and dynamic trigger management',
          ],
        },
        {
          id: 'TOOL_DEFINITION',
          order: 5,
          label: 'Tool Definition',
          goal: 'Fully define each tool with inputs, outputs, source, and security',
          what_to_ask: [
            'For each tool: what inputs does it need? What does it return?',
            'What security classification? (public, internal, pii_read, pii_write, financial, destructive)',
            'Are there any conditions for when the tool should be blocked or require approval?',
          ],
          what_to_build: {
            'tools[].inputs': 'Input parameters with name, type, required, description',
            'tools[].output': 'Output type and description',
            'tools[].source': 'Source connector and MCP tool name',
            'tools[].security': 'Classification (required) and risk level',
            'tools[].policy': 'Access conditions, approval requirements',
          },
          exit_criteria: 'All tools have inputs defined and output.description',
          tips: [
            'Every tool needs security.classification — this is the most common validation error',
            'High-risk tools (pii_write, financial, destructive) need access_policy rules',
            'If the skill has >= 3 tools, suggest setting bootstrap_tools (up to 3 core tools always available to the planner)',
            'Add mock examples for each tool — needed for testing',
          ],
        },
        {
          id: 'POLICY_DEFINITION',
          order: 6,
          label: 'Policy Definition',
          goal: 'Define guardrails, workflows, and approval rules',
          what_to_ask: [
            'What should this agent NEVER do?',
            'What should it ALWAYS do?',
            'Are there specific sequences of steps that must be followed?',
            'Which actions need human approval?',
          ],
          what_to_build: {
            'policy.guardrails.never': 'Things the agent must never do',
            'policy.guardrails.always': 'Things the agent must always do',
            'policy.workflows': 'Named step sequences triggered by intents',
            'policy.approvals': 'Tools that need human approval',
            'policy.escalation': 'When and where to escalate',
          },
          exit_criteria: 'At least one guardrail (never or always) defined',
          tips: [
            'Guardrails should be specific and actionable',
            'Workflow steps use tool NAMES not IDs',
            'System tools (sys.askUser, sys.emitUserMessage, sys.handoffToSkill, sys.askSkill, sys.findCapability, sys.focusUiPlugin, sys.trigger) are valid workflow steps',
          ],
        },
        {
          id: 'TRIGGERS_SETUP',
          order: 7,
          label: 'Triggers & Proactive Messaging (Optional)',
          goal: 'Set up schedule or event triggers for proactive skill execution — sending notifications, monitoring state, running periodic checks. Two approaches: STATIC triggers (defined here, fixed at deploy) and DYNAMIC triggers (agent creates at runtime via sys.trigger).',
          what_to_ask: [
            'Does this skill need to act proactively (without a user message)?',
            'What should it check, and how often? (e.g., stale tasks every 15min, daily summary)',
            'Should it send notifications (Telegram, email)? To whom (chat_id, email address)?',
            'What conditions should trigger a notification vs. doing nothing?',
            'Should users be able to create triggers dynamically? (e.g., "remind me at 9 AM", "check X every 5 minutes") — if yes, add sys.trigger to bootstrap_tools',
          ],
          what_to_build: {
            'triggers[]': 'STATIC: Schedule or event triggers with specific prompts, intervals, and concurrency settings (fixed at deploy time)',
            'bootstrap_tools': 'DYNAMIC: Add "sys.trigger" to bootstrap_tools if the agent should create triggers at runtime (user-requested schedules, reminders, monitoring)',
            'connectors': 'Add messaging connectors (telegram-mcp, gmail-mcp) to skill.connectors[] if sending notifications',
            'tools': 'Add send tools (telegram.send_message, gmail.send_email) mapped to messaging connectors via source.connection_id',
          },
          exit_criteria: 'Triggers are defined with specific prompts, or explicitly skipped (most skills don\'t need triggers). If dynamic triggers are needed, sys.trigger is in bootstrap_tools.',
          tips: [
            'Most skills do NOT need triggers — only add them for proactive behavior',
            'The trigger prompt is the most important part — it tells the skill exactly what to do when triggered',
            'STATIC vs DYNAMIC: use static triggers for predictable, always-on schedules (e.g., "check orders every 5 min"). Use dynamic (sys.trigger) for user-requested schedules ("remind me tomorrow", "turn on AC at 3 PM daily")',
            'Always include idempotency logic in the prompt (e.g., "skip tasks that already have a NOTIFIED comment")',
            'For Telegram notifications: you need the target chat_id and telegram-mcp connector linked to the skill',
            'For email: you need gmail-mcp connector linked and the target email address',
            'Test the trigger prompt with ateam_test_skill first — send it as a test message to verify the skill does the right thing before enabling the schedule',
            'The proactive_messaging pattern: connector (telegram-mcp) + tool (send_message) + trigger (schedule with prompt) = outbound notifications',
          ],
        },
        {
          id: 'MOCK_TESTING',
          order: 8,
          label: 'Mock Testing',
          goal: 'Add mock data for tools and test scenarios without real backends',
          what_to_ask: [
            'What should each tool return in a typical case?',
            'What error cases should we test?',
          ],
          what_to_build: {
            'tools[].mock': 'Mock configuration with mode and example input/output pairs',
            'tools[].mock_status': 'Set to "tested" or "skipped" for each tool',
          },
          exit_criteria: 'All tools have mock_status != "untested"',
          tips: [
            'Mock examples should cover both success and error cases',
            'Set mock_status to "skipped" for tools that don\'t need mock testing',
          ],
        },
        {
          id: 'READY_TO_EXPORT',
          order: 9,
          label: 'Ready to Export',
          goal: 'Final validation gate — all checks must pass',
          what_to_do: [
            'Run adas_validate_skill to check for errors',
            'Fix any validation errors',
            'Review the complete skill definition',
          ],
          what_to_build: {
            'role': 'Ensure role.name and role.persona are set',
            'engine': 'Set model, temperature, rv2, hlr, autonomy',
            'grant_mappings': 'If this skill issues grants for other skills',
            'access_policy': 'If this skill consumes grants from other skills',
          },
          exit_criteria: 'Validation returns ready_to_export = true with no errors',
          tips: [
            'Use adas_validate_skill to get the full validation report',
            'The engine section needs the full structure (model, temperature, rv2, hlr, autonomy) — not just shortcuts',
          ],
        },
        {
          id: 'EXPORTED',
          order: 10,
          label: 'Exported / Deployed',
          goal: 'Skill is deployed and running',
          what_to_do: [
            'Deploy via adas_deploy_solution (recommended) or adas_deploy_skill',
            'Verify deployment with adas_get_solution (view: "health")',
          ],
        },
        {
          id: 'GITHUB_ITERATION',
          order: 11,
          label: 'GitHub Iteration (Dev/Main Workflow)',
          goal: 'Iterate on connector code using GitHub dev branch, promote tested versions to main (production)',
          what_to_do: [
            'Every deploy auto-pushes to "dev" branch with a version tag (dev-YYYY-MM-DD-NNN). The push is ASYNC — deploy responds immediately.',
            'The "main" branch is production. Only promoted versions go there.',
            'To verify background push: use ateam_github_status(solution_id)',
            'To edit connector code: use ateam_github_patch (edits files in GitHub directly)',
            'To redeploy from GitHub: use ateam_build_and_run with github:true',
            'To update skill definitions: use ateam_patch (definitions live in the Builder, not GitHub)',
            'To test: use ateam_test_skill or ateam_test_pipeline',
          ],
          iteration_loop: [
            '1. Read current connector code → ateam_get_connector_source(solution_id, connector_id) — ALWAYS read before editing',
            '2. Edit connector code → ateam_github_patch({ files: [{ path: "connectors/my-mcp/server.js", content: "..." }] })',
            '3. Redeploy from GitHub → ateam_build_and_run({ solution, skills, github: true }) — auto-pushes new version to dev',
            '4. Test → ateam_test_skill({ message: "test query" })',
            '5. Fix & repeat until working',
            '6. When ready → promote dev to main: POST /deploy/solutions/:id/promote',
          ],
          per_connector_patching: {
            _IMPORTANT: 'Each connector has INDEPENDENT source code. Patching one connector does NOT change others.',
            workflow: [
              '1. Identify which connectors need changes — use ateam_get_solution(solution_id, "status") to see all connectors and their tool counts',
              '2. For EACH connector that needs changes:',
              '   a. Read its current code: ateam_get_connector_source(solution_id, connector_id)',
              '   b. Patch its files: ateam_github_patch({ files: [{ path: "connectors/<connector-id>/server.js", content: "..." }] })',
              '3. After all connectors are patched, redeploy ONCE: ateam_build_and_run({ github: true })',
              '4. Test each connector\'s tools to verify: ateam_test_skill with messages that exercise each connector',
            ],
            example: 'If home-assistant-mcp supports "set_brightness" but hue-mcp and tuya-mcp do not, you need to: (1) read hue-mcp server.js, (2) add set_brightness tool to hue-mcp, (3) read tuya-mcp server.js, (4) add set_brightness tool to tuya-mcp, (5) redeploy once with github:true.',
          },
          version_management: {
            branches: {
              dev: 'Staging — receives every successful deploy automatically. Last 10 versions kept.',
              main: 'Production — only changes via explicit promote. Rollback available.',
            },
            tags: {
              dev: 'dev-YYYY-MM-DD-NNN (e.g., dev-2026-03-11-003) — auto-created on each deploy',
              prod: 'prod-YYYY-MM-DD-NNN (e.g., prod-2026-03-11-001) — created on promote',
            },
            commands: {
              list_versions: 'GET /deploy/solutions/:id/versions/dev',
              promote: 'POST /deploy/solutions/:id/promote — merges dev → main',
              rollback: 'POST /deploy/solutions/:id/rollback — reverts main to previous prod tag (requires confirm:true)',
              verify_push: 'GET /deploy/solutions/:id/github/status — check if background push completed',
            },
          },
          when_to_use_what: {
            'ateam_github_patch': 'Edit connector source code (server.js, utils, package.json, UI assets). Supports search+replace for large files.',
            'ateam_github_write': 'Write a new file to GitHub (one file per call). Use for creating new connector files.',
            'ateam_patch(target:"skill")': 'Edit ANY skill field surgically — problem, role, intents, tools, policy, engine, scenarios, glossary. Supports dot notation and array ops (_push, _delete, _update). Deploys the single skill automatically.',
            'ateam_patch(target:"solution")': 'Edit solution-level fields — linked_skills, platform_connectors, ui_plugins, grants, handoffs.',
            'ateam_upload_connector(github:true)': 'Update connector code from GitHub and restart. Fast — deploys only the one connector, not the whole solution.',
            'ateam_build_and_run(github:true)': 'Full solution redeploy from GitHub. Use for first deploy or when multiple skills+connectors changed. Auto-falls back to async mode if it times out.',
            'ateam_build_and_run(mcp_store)': 'First deploy only — pass connector code inline to create the GitHub repo.',
            'ateam_redeploy(solution_id, skill_id)': 'Re-deploy a single skill without changing its definition. Use after connector changes that affect a skill.',
          },
          large_solution_strategy: {
            description: 'Solutions with 5+ skills may timeout on full build_and_run (Cloudflare 100s limit). Use incremental tools instead.',
            rules: [
              'NEVER use build_and_run for routine changes on large solutions — it deploys everything and may timeout.',
              'For skill definition changes: use ateam_patch(target:"skill", skill_id, updates) — deploys only that skill.',
              'For connector code changes: use ateam_github_patch to edit, then ateam_upload_connector(solution_id, connector_id, github:true) to deploy.',
              'If build_and_run times out, it auto-retries in async mode with polling — no action needed, just wait.',
              'If ateam_patch fails with "not found": skill is missing from Builder storage. Use ateam_github_patch to edit the skill JSON on GitHub (path: skills/<skill-id>/skill.json), then ask the platform operator to deploy.',
            ],
          },
          patch_examples: {
            'Change persona': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "role.persona": "You are a helpful assistant" })',
            'Update problem statement': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "problem.statement": "Help users manage X" })',
            'Add a guardrail': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "policy.guardrails.never_push": ["Never do X"] })',
            'Add a tool': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "tools_push": [{ name:"conn.tool", description:"...", inputs:[], output:{} }] })',
            'Delete a tool': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "tools_delete": ["old_tool_name"] })',
            'Update intent': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "intents.supported_update": [{ id:"i1", description:"new description" }] })',
            'Change engine model': 'ateam_patch(target:"skill", skill_id:"my-skill", updates:{ "engine.model": "claude-sonnet-4-5-20250514" })',
            'Force redeploy': 'ateam_patch(target:"solution", updates:{ "_force_redeploy": true })',
          },
          tips: [
            'The first deploy MUST include mcp_store (inline connector code) — this creates the GitHub repo.',
            'After first deploy, use incremental tools: ateam_patch for skill changes, ateam_upload_connector for connector changes.',
            'For large solutions (5+ skills): NEVER use build_and_run for routine changes. Use ateam_patch and ateam_upload_connector instead.',
            'build_and_run auto-falls back to async mode on timeout — it returns a job_id and polls for completion (up to 10 min).',
            'Each connector has independent source code under connectors/{id}/server.js — read each one separately before patching.',
            'To add a feature across multiple connectors, you must patch each connector\'s server.js individually.',
            'GitHub push is ASYNC — the deploy responds immediately. Use ateam_github_status() to verify the push landed.',
            'Checkpoints: use ateam_github_promote to create safe-* tags before risky changes. Rollback with ateam_github_rollback.',
          ],
        },
      ],
      completeness_fields: [
        'problem — problem.statement >= 10 chars',
        'scenarios — at least 1 scenario with title and description',
        'role — role.name and role.persona defined',
        'intents — at least 1 intent with description and examples',
        'tools — at least 1 tool with name, description, and output',
        'policy — guardrails section with at least 1 never or always rule',
        'engine — model and temperature set',
        'mocks_tested — all tools have mock_status != "untested"',
      ],
    },

    solution_workflow: {
      description: 'State machine for building a multi-skill A-Team solution (the architecture layer that connects skills)',
      note: 'Build each skill individually first using the skill workflow. Then use this workflow to define how skills work together.',
      phases: [
        {
          id: 'SOLUTION_DISCOVERY',
          order: 1,
          label: 'Solution Discovery',
          goal: 'Understand the overall solution shape',
          what_to_ask: [
            'What problem does this multi-agent solution solve?',
            'How many skills/agents will it need?',
            'What types of users interact with it? (customers, admins, operators)',
            'What channels does it serve? (chat, email, API, scheduled tasks)',
            'Is there an identity/security gateway?',
          ],
          what_to_build: {
            'id': 'Solution identifier',
            'name': 'Solution display name',
            'description': 'What this multi-agent solution does',
          },
          exit_criteria: 'Basic solution shape is understood — name, description, rough skill count',
          tips: [
            'Suggest a solution pattern based on the domain (e-commerce, helpdesk, HR)',
            'Most solutions have: gateway (identity) → worker(s) → optional approval skill',
          ],
        },
        {
          id: 'IDENTITY_DESIGN',
          order: 2,
          label: 'Identity Design (Users & Roles)',
          goal: 'Define who uses this solution — user types, admin roles, defaults',
          what_to_ask: [
            'What types of users will interact with this solution?',
            'Which roles should have admin privileges?',
            'What is the default user type for unknown/anonymous users?',
          ],
          what_to_build: {
            'identity.actor_types[]': 'Each with key, label, description',
            'identity.admin_roles': 'Keys that get admin access',
            'identity.default_actor_type': 'Default for new users',
          },
          exit_criteria: 'At least 2 actor types, admin_roles set, default_actor_type set',
          tips: [
            'Always suggest concrete user types with examples — don\'t just ask',
            'Common patterns: customer + admin, patient + doctor, employee + manager',
          ],
        },
        {
          id: 'SKILL_TOPOLOGY',
          order: 3,
          label: 'Skill Topology',
          goal: 'Define each skill with its role in the solution',
          what_to_ask: [
            'Which skill handles the entry point (gateway)?',
            'Which skills do the actual work (workers)?',
            'Do you need an orchestrator or approval skill?',
          ],
          what_to_build: {
            'skills[]': 'Each with id, name, role (gateway/worker/orchestrator/approval), description, entry_channels, connectors',
          },
          exit_criteria: 'At least 2 skills defined with roles',
          tips: [
            'Roles: gateway = entry point + identity, worker = does the work, orchestrator = coordinates, approval = human-in-the-loop',
            'Each skill should have a clear, single responsibility',
          ],
        },
        {
          id: 'GRANT_ECONOMY',
          order: 4,
          label: 'Grant Economy',
          goal: 'Define the verified claims that flow between skills',
          what_to_ask: [
            'What information does each worker skill need from the gateway?',
            'What verified claims should flow between skills? (e.g., customer_id, assurance_level)',
            'How are grants issued? (from tool responses via grant_mapping, or via handoff)',
          ],
          what_to_build: {
            'grants[]': 'Each with key, description, issued_by, consumed_by, issued_via, source_tool, source_field',
          },
          exit_criteria: 'At least 1 grant defined',
          tips: [
            'Grants are the security backbone — they ensure skills only act on verified data',
            'Common grants: customer_id, assurance_level, employee_id, session_token',
            'Use namespace.name format (e.g., ecom.customer_id)',
          ],
        },
        {
          id: 'HANDOFF_DESIGN',
          order: 5,
          label: 'Handoff Design',
          goal: 'Define how conversations transfer between skills and which grants propagate',
          what_to_ask: [
            'When should the gateway hand off to a worker? What triggers it?',
            'Which grants should be passed to the target skill?',
            'Should any grants be revoked after handoff?',
          ],
          what_to_build: {
            'handoffs[]': 'Each with id, from, to, trigger, grants_passed, grants_dropped, mechanism',
          },
          exit_criteria: 'All inter-skill flows have handoff definitions',
          tips: [
            'handoff-controller-mcp = live conversation transfer — the platform provides sys.handoffToSkill as a built-in tool, no connector wiring needed',
            'internal-message = async skill-to-skill (background coordination)',
            'Every handoff needs a unique id',
            'Add sys.handoffToSkill to the skill\'s bootstrap_tools to pin it for the planner — ensures the LLM always sees and can use it',
          ],
        },
        {
          id: 'ROUTING_CONFIG',
          order: 6,
          label: 'Routing Configuration',
          goal: 'Map each channel to its default entry skill',
          what_to_ask: [
            'Which skill should answer Telegram messages?',
            'Which skill should handle emails?',
            'Which skill handles API/webhook calls?',
          ],
          what_to_build: {
            'routing': 'Object mapping channel names to { default_skill, description }',
          },
          exit_criteria: 'All declared channels have routing configured',
          tips: [
            'Usually all channels route to the gateway skill first',
            'API/webhook channels might go directly to an orchestrator',
          ],
        },
        {
          id: 'SECURITY_CONTRACTS',
          order: 7,
          label: 'Security Contracts',
          goal: 'Define cross-skill grant requirements for tools',
          what_to_ask: [
            'Which tools in worker skills need verified grants before they can run?',
            'Which gateway skill provides those grants?',
            'What grant values are required? (e.g., assurance_level must be L1 or L2)',
          ],
          what_to_build: {
            'security_contracts[]': 'Each with name, consumer, provider, requires_grants, required_values, for_tools, validation',
          },
          exit_criteria: 'At least 1 security contract for the main consumer skill',
          tips: [
            'Security contracts formalize the grant economy into enforceable rules',
            'consumer = skill being constrained, provider = skill that issues the grants',
          ],
        },
        {
          id: 'VALIDATION',
          order: 8,
          label: 'Validation',
          goal: 'Run validation and fix any issues',
          what_to_do: [
            'Run adas_validate_solution with the full solution + all skill definitions',
            'Fix any errors (warnings are OK)',
            'Review the complete solution architecture',
          ],
          exit_criteria: 'No validation errors',
          tips: [
            'Common errors: orphan skills, broken handoff chains, missing grant providers',
            'After validation passes, deploy with adas_deploy_solution',
          ],
        },
      ],
    },

    github_workflow: {
      description: 'GitHub-first development workflow — how to iterate on solutions after the first deploy',
      repo_structure: {
        _note: 'Every solution gets a GitHub repo named {tenant}--{solution-id} (e.g., main--ecommerce-solution)',
        layout: {
          'solution.json': 'Full solution definition (identity, grants, handoffs, routing)',
          'skills/{skill-id}/skill.json': 'Individual skill definitions',
          'connectors/{connector-id}/server.js': 'Connector MCP server source code',
          'connectors/{connector-id}/package.json': 'Connector dependencies',
          'connectors/{connector-id}/ui-dist/': 'UI plugin assets (if ui_capable)',
        },
      },
      first_deploy: {
        description: 'The first deploy creates the GitHub repo automatically',
        steps: [
          '1. Build solution + skills + connector code',
          '2. Call ateam_build_and_run with mcp_store containing connector source files',
          '3. On success, the solution is auto-pushed to GitHub (Phase 5 of deploy)',
          '4. The repo is now the source of truth for connector code',
        ],
      },
      iteration_loop: {
        description: 'After the first deploy, iterate using GitHub as the code source',
        code_changes: [
          '1. Edit connector code: ateam_github_patch({ files: [{ path: "connectors/my-mcp/server.js", content: "..." }] })',
          '2. Redeploy: ateam_build_and_run({ solution, skills, github: true })',
          '3. Test: ateam_test_skill({ message: "..." })',
        ],
        definition_changes: [
          '1. Edit skill/solution definitions: ateam_patch({ target: "skill", updates: { ... } })',
          '2. No GitHub needed — definitions live in the Builder, not in connector code',
        ],
      },
      tools_reference: {
        'ateam_github_patch': 'Edit connector files in GitHub repo. Use for server.js, package.json, UI assets.',
        'ateam_github_status': 'Check if repo exists and get latest commit info.',
        'ateam_github_log': 'View commit history to track changes.',
        'ateam_github_read': 'Read a specific file from the repo (e.g., to review current connector code before editing).',
        'ateam_github_promote': 'Promote a dev version to main (production). Move tested version from dev branch with explicit manual control.',
        'ateam_github_list_versions': 'List all available dev versions with dates and commit SHAs. See version history before promoting.',
        'ateam_github_rollback': 'Rollback main to a previous production tag. Revert deployment with confirmation gate. ⚠️ DESTRUCTIVE',
        'ateam_build_and_run(github:true)': 'Deploy pulling connector code from GitHub instead of inline mcp_store.',
      },
    },

    conversation_guide: {
      description: 'How to drive the build conversation as a hosting AI',
      principles: [
        'Follow the phase order — don\'t skip ahead',
        'At each phase, suggest concrete examples based on the domain — never ask bare questions',
        'Build the definition incrementally — add to it after each user response',
        'Validate frequently — run adas_validate_skill or adas_validate_solution after major changes',
        'One topic at a time — complete one phase before moving to the next',
        'Show progress — tell the user which phase they\'re in and what\'s next',
      ],
      opening_message: 'When the user wants to build something, start with: "I\'m an A-Team Solution Architect. I\'ll help you design and deploy a multi-agent AI system. Let\'s start — what problem do you want to solve?"',
      tools_to_use: {
        'adas_get_spec': 'Fetch the full schema when you need field details',
        'adas_get_examples': 'Show the user a working example for reference',
        'adas_validate_skill': 'Validate after completing tools, policy, and engine phases',
        'adas_validate_solution': 'Validate the full solution before deploy',
        'adas_deploy_solution': 'Deploy when validation passes',
        'adas_get_solution': 'Verify deployment health after deploy',
      },
    },
  };
}

function buildSolutionSpec() {
  return {
    spec_version: '1.0.0',
    description: 'Complete A-Team solution definition specification. A solution orchestrates multiple skills into a cohesive multi-agent system with shared grants, handoffs, and routing.',

    schema: {
      // ── Metadata ──
      id: { type: 'string', required: true, description: 'Unique solution identifier' },
      name: { type: 'string', required: true, description: 'Solution display name' },
      version: { type: 'string', required: false, description: 'Semantic version' },
      description: { type: 'string', required: false, description: 'What this multi-agent solution does' },

      // ── Bootstrap Tools (solution-wide) ──
      bootstrap_tools: {
        type: 'string[]', required: false, max_items: 3,
        description: 'Up to 3 tool names that are ALWAYS pinned for the planner across ALL skills in this solution. Merged with each skill\'s own bootstrap_tools (union, deduplicated). Use this to ensure critical tools like memory.userProfile run on every message regardless of which skill handles it. This also suppresses the greeting fast-path — when bootstrap_tools are present, even "hi" goes through the full planner so bootstrap tools execute.',
        example: ['memory.userProfile'],
      },

      // ── Exclude Bootstrap Tools (solution-wide) ──
      exclude_bootstrap_tools: {
        type: 'string[]', required: false,
        description: 'System bootstrap tools to UN-PIN across ALL skills in this solution. By default the platform force-pins system tools for every skill. Three are MANDATORY (run_python_script, sys.askForContextAndTools, sys.finalizePlan) and cannot be excluded. The rest CAN be excluded here. Excluded tools are NOT removed from the tool catalog — the LLM tool finder can still select them. They just won\'t be force-pinned. This applies to ALL skills. Individual skills can add more excludes via their own exclude_bootstrap_tools field (lists are merged).',
        excludable_tools: ['readFile', 'getCurrentProjectPath', 'getChatTranscript', 'sys.callAiWithTools', 'sys.step', 'sys.handoffToSkill', 'sys.askSkill', 'sys.findCapability', 'sys.listSkills'],
        mandatory_tools_note: 'These 3 are ALWAYS pinned and CANNOT be excluded: run_python_script, sys.askForContextAndTools, sys.finalizePlan',
        example: ['readFile', 'getCurrentProjectPath'],
      },

      // ── Identity ──
      identity: {
        type: 'object', required: false,
        description: 'Actor types and access control for the solution',
        fields: {
          actor_types: {
            type: 'array', required: true,
            description: 'Define who can use this solution',
            item_schema: {
              key: { type: 'string', required: true, description: 'Actor type identifier (e.g., "customer", "agent")' },
              label: { type: 'string', required: true, description: 'Display name' },
              description: { type: 'string', required: false },
              default_channel: { type: 'string', required: false, description: 'Default entry channel for this actor type' },
            },
          },
          default_actor_type: { type: 'string', description: 'Default actor type if not specified. Must match an actor_types[].key' },
          admin_roles: { type: 'string[]', description: 'Actor type keys that have admin privileges' },
        },
      },

      // ── Skills ──
      skills: {
        type: 'array', required: true, min_items: 1,
        description: 'The autonomous agents in this solution',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique skill ID (must match the skill definition id)' },
          name: { type: 'string', required: true },
          role: {
            type: 'enum', required: true,
            values: ['gateway', 'worker', 'orchestrator', 'approval'],
            description: 'gateway = entry point (identity/routing), worker = does the work, orchestrator = coordinates, approval = authorizes',
          },
          description: { type: 'string', required: true },
          entry_channels: { type: 'string[]', required: false, description: 'Channels where external actors can reach this skill' },
          connectors: { type: 'string[]', required: false, description: 'MCP connector IDs this skill uses' },
          ui_capable: { type: 'boolean', required: false, description: 'Whether this skill serves UI plugins' },
          prompt: { type: 'string', required: false, description: 'System prompt for this skill in the solution context' },
          example_conversations: {
            type: 'array', required: false,
            item_schema: {
              title: { type: 'string' },
              messages: { type: 'array', item_schema: { role: { type: 'string' }, content: { type: 'string' } } },
            },
          },
        },
      },

      // ── Grants ──
      grants: {
        type: 'array', required: false,
        description: 'Verified claims that flow between skills. The grant economy is the security backbone of the solution.',
        item_schema: {
          key: { type: 'string', required: true, description: 'Grant identifier with namespace (e.g., "ecom.customer_id")' },
          description: { type: 'string', required: true },
          values: { type: 'string[]', required: false, description: 'Allowed values for enum grants (e.g., ["L0", "L1", "L2"])' },
          issued_by: { type: 'string[]', required: true, description: 'Skill IDs that can issue this grant' },
          consumed_by: { type: 'string[]', required: true, description: 'Skill IDs that need this grant' },
          issued_via: { type: 'enum', values: ['grant_mapping', 'handoff', 'platform'] },
          source_tool: { type: 'string', required: false, description: 'Tool whose output creates this grant' },
          source_field: { type: 'string', required: false, description: 'JSON path into tool result (e.g., "$.candidates[0].customer_id")' },
          ttl_seconds: { type: 'number', required: false, description: 'How long the grant lives (omit for permanent)' },
          internal: { type: 'boolean', required: false, description: 'If true, grant is not visible outside issuing skill' },
        },
      },

      // ── Handoffs ──
      handoffs: {
        type: 'array', required: false,
        description: 'Skill-to-skill conversation transfers with grant propagation',
        item_schema: {
          id: { type: 'string', required: true, description: 'Unique handoff ID' },
          from: { type: 'string', required: true, description: 'Source skill ID' },
          to: { type: 'string', required: true, description: 'Destination skill ID' },
          trigger: { type: 'string', required: true, description: 'When this handoff happens (human-readable)' },
          grants_passed: { type: 'string[]', required: true, description: 'Grant keys to transfer to target skill' },
          grants_dropped: { type: 'string[]', required: false, description: 'Grant keys to revoke after handoff' },
          mechanism: {
            type: 'enum', values: ['handoff-controller-mcp', 'internal-message'],
            description: 'handoff-controller-mcp = live conversation transfer, internal-message = async skill-to-skill',
          },
          ttl_seconds: { type: 'number', required: false, description: 'How long the handoff session lives' },
        },
      },

      // ── Routing ──
      routing: {
        type: 'object', required: false,
        description: 'Channel-to-skill routing. Maps each channel to its default entry skill. Users talk to the SOLUTION, not to individual skills — routing determines which skill handles each message.',
        note: 'Each key is a channel name (telegram, email, api, dashboard, etc.). Value is an object with default_skill and description. The "api" channel covers REST API, mobile apps, and web dashboard — always set it for multi-skill solutions.',
        important: 'Clients do NOT need to specify a skillSlug when sending messages. The platform resolves the skill automatically using this priority: 1. Conversation continuity (actor\'s last active skill) → 2. Channel routing (routing.<channel>.default_skill) → 3. Global default (policies.default_skill_slug) → 4. Auto-detect (gateway/orchestrator role → first deployed skill). For single-skill solutions, routing is optional. For multi-skill solutions, always define routing.api.default_skill to set the entry point.',
        example: {
          telegram: { default_skill: '<gateway-skill-id>', description: 'All Telegram messages go to identity verification first' },
          api: { default_skill: '<gateway-skill-id>', description: 'Mobile app, web dashboard, and API calls go to gateway' },
          email: { default_skill: '<gateway-skill-id>', description: 'All emails go to gateway first' },
        },
      },

      // ── Platform Connectors ──
      platform_connectors: {
        type: 'array', required: false,
        description: 'Infrastructure-level MCP connectors the solution needs',
        item_schema: {
          id: { type: 'string', required: true, description: 'Connector ID' },
          required: { type: 'boolean', description: 'Is this connector required for the solution to work?' },
          description: { type: 'string' },
          used_by: { type: 'string[]', required: false, description: 'Which skill IDs use this connector' },
          ui_capable: { type: 'boolean', required: false },
        },
      },

      // ── Memory Engine ──
      // The platform's built-in cognitive memory layer — every solution gets it for free.
      memory_engine: {
        in_one_sentence: 'The memory connector is the user\'s brain — your skills READ from it, the platform WRITES to it, and you focus on doing the actual work.',
        headline: 'Every solution gets a persistent cognitive memory layer for each user — already built, already deployed, already isolated. You don\'t wire it. You don\'t deploy it. You just read from it.',
        what_it_is: 'A long-term per-user brain. Each user has their own private memory island, fully isolated from other users even within the same solution. The platform provides the connector (memory-mcp) ready to use — add memory-mcp to your skill\'s connectors[] array and the read tools are available.',
        why_it_matters: 'Without it, your solution starts every conversation from zero. With it, your solution behaves like a friend who remembers — preferences, facts, routines, taught rules, past situations.',

        memory_types: {
          semantic:   { holds: 'Facts about the user and their world', example: '"Lives in Tel Aviv", "Allergic to peanuts", "Prefers window seats"' },
          procedural: { holds: 'Rules and learned behaviors',          example: '"When user says good morning → turn on lights"' },
          episodic:   { holds: 'Things that happened',                 example: 'Past conversations, completed jobs' },
          working:    { holds: 'Short-lived state with TTL',           example: '"User is running late", "Current plan in progress"' },
          meta:       { holds: 'Provenance / audit trail',             example: 'When/why a memory was stored, who taught it' },
        },

        // ── READ vs WRITE: this is the most important rule ──
        read_vs_write: {
          rule: 'Skills are READ-ONLY consumers. The platform handles ALL writes.',
          why: 'Memory writes happen in two places, neither involves your skill: (1) the engine auto-extracts facts from conversations in the background, (2) the platform\'s teach handler captures explicit "remember that..." / "from now on..." statements as structured rules. Your skill never needs to call a write tool.',
          consequence: 'Don\'t hardcode user knowledge. Don\'t try to "remember things yourself." Don\'t build your own teach skill. Trust the engine — it\'s already learning.',
        },

        // ── READ tools (what your skills should use) ──
        read_tools: {
          'memory.userProfile()': 'Call this at the START of every interaction. One call returns the user\'s name, timezone, preferences, facts, instructions, and active rules. Use it to personalize replies.',
          'memory.recall(query, type?, limit?)': 'Search memories by query. Example: "what did the user tell me about their diet?"',
          'memory.list(type?, limit?, offset?)': 'List all memories of a given type',
          'memory.rules.match(situation)': 'Check if any user-taught rules apply to the current situation. Call this BEFORE taking an action that might conflict with a rule.',
          'memory.rules.count()': 'Count active rules',
          'memory.semantic.search(query)': 'Semantic search across all memories with similarity scoring',
          'memory.summarize(type?)': '"What do you know about this user?" — high-level summary',
          'memory.explain(id)': '"Why is this remembered? Where did it come from?" — provenance trail',
          'memory.audit(filter?)': 'Inspect the memory audit log',
          'context.read(type)': 'Read short-lived working state (situations, plans)',
        },

        write_tools_note: 'Write operations (memory.store, memory.update, memory.delete, memory.userProfile.set, context.store, context.resolve, context.clear) are RESERVED for the platform. Solution skills must NOT call them. They happen automatically via the auto-learning pipeline and the platform\'s teach handler.',

        // ── How auto-learning actually works ──
        how_auto_learning_works: {
          intro: 'The engine listens to every conversation and extracts memorable things in three passes:',
          passes: {
            cheap_pass: {
              when: 'Every interaction',
              cost: 'Free',
              method: 'Regex to catch obvious facts',
              examples: ['"I live in..."', '"my name is..."', '"I\'m allergic to..."'],
            },
            smart_pass: {
              when: 'Daily batch per user',
              cost: 'Cheap (Haiku)',
              method: 'LLM extraction of subtler facts and preferences',
            },
            deep_pass: {
              when: 'Weekly batch per user',
              cost: 'Medium',
              method: 'Pattern detection across history',
              example: '"User always asks about Hebrew news in the morning"',
            },
          },
          tagging: 'Auto-learned memories are tagged source: "auto" with confidence 0.5–0.8 and decay over time. Explicitly taught memories are tagged source: "taught" with confidence 1.0 and don\'t decay. Users can review and correct everything via a dedicated UI.',
        },

        // ── Engine intelligence (you get this for free) ──
        intelligence: [
          'Normalizes input on write — "i prefer dark mode plz" becomes "Prefers dark mode UI"',
          'Deduplicates semantically — repeating yourself doesn\'t create 5 entries',
          'Detects contradictions — "lives in Tel Aviv" + later "moved to Berlin" → old marked superseded, new stored',
          'Recalls semantically — "what does the user like in the morning?" matches even if no memory contains "morning"',
          'Decays stale memories — facts that haven\'t been touched in months get lower priority',
          'Compacts in the background — clusters similar memories into clean summaries',
          'Tracks provenance — every memory has an audit trail: where it came from, why it\'s there, confidence',
        ],

        // ── Skill design rules (do this / don\'t do this) ──
        skill_design_rules: {
          do: [
            'Call memory.userProfile at the START of every interaction — let the engine give you the real picture of who you\'re talking to.',
            'Call memory.rules.match BEFORE taking an action — the user may have taught a behavior that conflicts with what you\'re about to do.',
            'Use memory.recall when you need context-specific facts ("what did the user say about their diet?")',
            'Trust the engine — it learns automatically, you don\'t need to remind it.',
          ],
          dont: [
            'Don\'t hardcode user knowledge — always read it from the engine.',
            'Don\'t try to remember things yourself — auto-extraction is already running.',
            'Don\'t call write tools (memory.store, memory.update, etc.) — they\'re platform-only.',
            'Don\'t build your own teach skill — the platform handles "remember that..." and "from now on...".',
            'Don\'t cache memory results in your skill state — re-read each interaction (the engine may have learned new things since).',
          ],
        },

        // ── Platform guarantees ──
        actor_isolation: 'You don\'t pass an actor ID — the platform injects it automatically based on who\'s chatting. You don\'t pass a tenant — handled too. Memory is per-tenant + per-actor. Cross-user data leaks are impossible by construction.',
        cross_skill: 'The same memory works across every skill in your solution. What one skill learns (via the platform\'s extraction), all skills see.',
        forward_compatibility: 'Your skill calls don\'t change when the engine gets smarter (better embeddings, new dedup strategies, smarter extraction). Same tool names, smarter results.',

        what_you_dont_do: [
          'Set up a database',
          'Design a memory schema',
          'Enforce per-user isolation',
          'Worry about cross-user data leaks',
          'Manage embeddings, vector search, or LLM integration',
          'Implement background compaction or decay logic',
          'Build a "memory review" UI (already exists)',
          'Build a "teach my assistant" skill (platform handles it)',
          'Wire memory tools into every new skill (just add memory-mcp to connectors)',
          'Migrate data when your solution evolves',
          'Optimize cost on the LLM extraction pipeline',
        ],

        when_to_use: [
          'Personalization — adapt behavior to who you\'re talking to',
          'Preferences — remember how the user likes things done',
          'Rules and automations — react to user-taught behaviors',
          'Routine detection — notice patterns and proactively help',
          'Context continuation — pick up where the conversation left off',
          'Reducing repetition — don\'t ask the user the same question twice',
        ],

        when_NOT_to_use: [
          'Application state that belongs in your own database',
          'Tenant-wide configuration (use solution settings instead)',
          'Logs / audit data (use a logging system)',
          'Large blobs (files, images, transcripts — store separately and reference them)',
          'Anything sensitive the user didn\'t intend to share — memory is not a surveillance log',
        ],

        the_promise: 'Every solution on this platform inherits a real, persistent, intelligent memory layer for its users — without writing a single line of memory code. Use it, and your solution feels like it knows the user. Skip it, and you\'re building a goldfish.',

        how_to_enable: 'Add "memory-mcp" to your skill\'s connectors[] array. Then add the READ tools you need to your skill\'s tools[] (e.g. memory.userProfile, memory.recall, memory.rules.match). The platform handles writes, isolation, extraction, and everything else.',
      },

      // ── Platform Connectors Reference ──
      // Tool lists are fetched DYNAMICALLY from Core at startup — always up to date.
      // Call GET /spec/solution to see the live tool inventory.
      platform_connectors_reference: {
        description: 'Pre-built connectors managed at the platform level. These run as Docker containers and are shared across all tenants. Solution developers USE them (add to skill.connectors[]) but do NOT create or modify them. Do NOT include their source code in mcp_store or GitHub — they are platform infrastructure.',
        important: 'Platform connectors cannot be modified via ateam_github_patch or ateam_upload_connector. Changes must be made in the ai-dev-assistant repo and the container restarted.',
        connectors: '_DYNAMIC_', // Replaced at request time by getPlatformConnectors()
      },

      // ── Platform Connector Recipes ──
      // Common multi-connector wiring patterns that solution developers would
      // otherwise have to figure out by reading each connector's catalog entry.
      platform_connector_recipes: {
        _note: 'Copy-paste recipes for wiring platform connectors together at the solution level. Each recipe lists the exact platform_connectors[], skill.connectors[], and skill.tools[] entries needed.',

        document_intelligence: {
          _summary: 'Document search + RAG Q&A over the user\'s cloud-stored files (Dropbox, Google Drive).',
          _when_to_use: 'Your solution needs to answer questions grounded in user documents — contracts, notes, wikis, manuals — that live in a cloud provider. Works for chat-driven Q&A and for tools that need retrieval-augmented context.',

          step_1_solution_platform_connectors: {
            _note: 'Add BOTH to your solution.platform_connectors[]. They are a pair — cloud-docs ingests, docs-index searches.',
            example: [
              { id: 'docs-index-mcp', required: true },
              { id: 'cloud-docs-mcp', required: true },
            ],
          },

          step_2_skill_connectors: {
            _note: 'Add both connector IDs to the skill.connectors[] array of every skill that needs document search.',
            example: ['docs-index-mcp', 'cloud-docs-mcp'],
          },

          step_3_skill_tools: {
            _note: 'Pull the tools the skill actually uses into skill.tools[]. Typical search skill needs ~4 of these. Full catalog: see /spec/platform-connectors.',
            minimum_for_retrieval_skill: [
              'cloud.create_corpus   (one-time setup — creates corpus + auto-wires sync)',
              'docs.search           (top-k chunk retrieval with scores + citations)',
              'docs.answer           (LLM-backed RAG answer — optional if you do your own composition)',
              'docs.corpus.list      (so the skill can discover existing corpora for this user)',
            ],
            optional: [
              'docs.stats            (UI hint: show ingestion progress)',
              'docs.file.get         (fetch full file text when the user clicks a search result)',
              'cloud.list_folder     (browse-before-search UX)',
            ],
          },

          step_4_user_auth_ux: {
            _note: 'Users must authenticate to their cloud provider BEFORE the first search. Plan this into your UX — it\'s a one-time per-actor OAuth redirect, handled by platform.auth.',
            pattern: [
              '1. Skill detects missing connection (cloud.create_corpus returns {ok:false, reason:"not_connected"} or catch the error).',
              '2. Skill responds with a prompt: "I need access to your Dropbox. Tap to connect."',
              '3. Skill calls platform.auth.ensureConnected({service_id:"dropbox"}) — platform handles the OAuth flow + token storage.',
              '4. On return, skill retries cloud.create_corpus. From this point on, the token is persisted and auto-refreshed.',
            ],
            important: 'cloud-docs-mcp NEVER runs its own OAuth. All provider auth is delegated to platform.auth — one shared token store across every connector that needs that provider.',
          },

          step_5_runtime_flow: {
            _note: 'After setup, the skill\'s actual retrieval loop is tiny.',
            example_script_hint: [
              'corpus = cloud.create_corpus({name:"my-docs", service_id:"dropbox", path:"/Contracts"})   // first call only; idempotent',
              'hits   = docs.search({corpus_id: corpus.corpus_id, query: user_question, top_k: 6})',
              '// (optional) answer = docs.answer({corpus_id: corpus.corpus_id, query: user_question})',
              'return compose_reply(hits)',
            ],
            background_sync: 'Every docs.search against a cloud-backed corpus triggers a background refresh (delta sync, cooldown 15 min). The skill does NOT need to call cloud.list_changes or manually re-ingest anything — that\'s the whole point of cloud.create_corpus vs docs.corpus.create.',
          },

          common_mistakes: [
            'Calling docs.corpus.create directly for a cloud source — DO NOT. Use cloud.create_corpus so sync gets wired.',
            'Manually calling cloud.download + docs.ingest.file in a loop — DO NOT. Same reason.',
            'Forgetting to add BOTH connectors to platform_connectors[]. docs-index alone has no source; cloud-docs alone has nothing to search.',
            'Assuming the user is already authenticated. Always handle the "not_connected" case in your skill\'s persona/guardrails.',
            'Creating a new corpus per query instead of reusing one per user+source. Corpora are meant to be long-lived; docs.search is the hot path.',
          ],
        },
      },

      // ── Security Contracts ──
      security_contracts: {
        type: 'array', required: false,
        description: 'Cross-skill grant requirements. Defines which tools require which grants from which providers.',
        item_schema: {
          name: { type: 'string', required: true, description: 'Contract name (human-readable)' },
          consumer: { type: 'string', required: true, description: 'Skill ID that is constrained' },
          requires_grants: { type: 'string[]', required: true, description: 'Grant keys required' },
          required_values: { type: 'object', required: false, description: 'Specific values required (e.g., { "ecom.assurance_level": ["L1", "L2"] })' },
          provider: { type: 'string', required: true, description: 'Skill ID that issues the required grants' },
          for_tools: { type: 'string[]', required: true, description: 'Tool names protected by this contract' },
          validation: { type: 'string', required: false, description: 'Human-readable validation description' },
          response_filter: { type: 'string', required: false, description: 'Named response filter to apply' },
        },
      },

      // ── Voice Channel ──
      voice: {
        type: 'object', required: false,
        description: 'Voice channel configuration. Enables phone/web voice interactions for this solution. On deploy, voice settings are pushed to the voice backend automatically.',
        fields: {
          enabled: { type: 'boolean', required: false, description: 'Master toggle — enable or disable the voice channel for this solution' },
          language: { type: 'string', required: false, description: 'Voice language (e.g., "en", "he", "es"). Default: "en"' },
          persona: {
            type: 'object', required: false,
            description: 'Voice bot persona customization',
            fields: {
              name: { type: 'string', required: false, description: 'Bot name (e.g., "Clinic Assistant", "Fleet Manager")' },
              style: { type: 'string', required: false, description: 'Conversation style (e.g., "professional", "friendly", "concise")' },
            },
          },
          welcome: { type: 'string', required: false, description: 'Welcome message spoken when a caller connects' },
          prompt: {
            type: 'object', required: false,
            description: 'Additional prompt customizations for the voice bot',
            fields: {
              behaviorRules: { type: 'string', required: false, description: 'Custom behavior rules appended to the voice system prompt' },
              informationGathering: { type: 'string', required: false, description: 'Instructions for what information to collect from callers' },
            },
          },
          verification: {
            type: 'object', required: false,
            description: 'Caller verification — require callers to verify identity before accessing skills',
            fields: {
              enabled: { type: 'boolean', required: false, description: 'Enable caller verification. Default: false' },
              method: {
                type: 'enum', required: false,
                values: ['phone_lookup', 'security_question', 'custom_skill'],
                description: 'phone_lookup = auto-verify known phone numbers, security_question = ask a question, custom_skill = delegate to a skill',
              },
              maxAttempts: { type: 'number', required: false, description: 'Max verification attempts before on-failure action (1-10). Default: 3' },
              onFailure: {
                type: 'enum', required: false,
                values: ['hangup', 'continue_limited'],
                description: 'What happens after max failed attempts. hangup = disconnect, continue_limited = allow limited access',
              },
              skipRecentMinutes: { type: 'number', required: false, description: 'Skip verification for recently verified callers (minutes). 0 = always verify. Default: 0' },
              securityQuestion: {
                type: 'object', required: false,
                description: 'Required when method is "security_question"',
                fields: {
                  question: { type: 'string', required: true, description: 'The question to ask (e.g., "What is your company name?")' },
                  answer: { type: 'string', required: true, description: 'Expected answer' },
                  answerMatchMode: {
                    type: 'enum', required: false,
                    values: ['case_insensitive', 'exact', 'contains', 'smart'],
                    description: 'How to compare the caller answer. "smart" uses LLM semantic matching (handles date formats, abbreviations, etc). Default: "smart"',
                  },
                },
              },
              customSkill: {
                type: 'object', required: false,
                description: 'Required when method is "custom_skill"',
                fields: {
                  skillSlug: { type: 'string', required: true, description: 'Skill ID that handles verification (must be a skill in this solution)' },
                },
              },
            },
          },
          knownPhones: {
            type: 'array', required: false,
            description: 'Pre-registered phone numbers for phone_lookup verification',
            item_schema: {
              number: { type: 'string', required: true, description: 'Phone number in E.164 format (e.g., "+14155551234")' },
              label: { type: 'string', required: false, description: 'Human-readable label (e.g., "Support Desk", "Dr. Smith")' },
            },
          },
          skillOverrides: {
            type: 'array', required: false,
            description: 'Per-skill voice configuration overrides (enable/disable specific skills for voice, set order)',
            item_schema: {
              slug: { type: 'string', required: true, description: 'Skill ID to override' },
              enabled: { type: 'boolean', required: false, description: 'Whether this skill is available via voice' },
              order: { type: 'number', required: false, description: 'Display/priority order' },
            },
          },
        },
      },

      // ── UI Plugins (Web + React Native) ──
      //
      // UI Plugins provide RICH INTERACTIVE DASHBOARDS for both web and mobile.
      // The same backend API supports both rendering modes simultaneously.
      //
      // MODES:
      // • mode="iframe"        — Web-only (HTML/JavaScript in <iframe>)
      // • mode="react-native"  — Mobile-only (React Native component)
      // • mode="adaptive"      — Both platforms (different implementations per platform)
      //
      // SHARED CONCEPT: Skills request plugins via tools.ui.present(), which triggers
      // the appropriate rendering based on platform (web gets iframe, mobile gets native component).
      //
      // UNIFIED DEPLOYMENT:
      // Both web (iframe) and React Native plugins are deployed together via ateam_build_and_run.
      // The system auto-validates, auto-uploads, and auto-verifies both types. Skills don't care
      // which rendering mode is used — the skill-plugin contract is identical.
      //
      // PLUGIN BUNDLE SERVING (React Native Only):
      // 1. DURING DEPLOYMENT: ateam_build_and_run stores plugin bundles in Core's mcp-store filesystem
      // 2. IN CORE API: GET /api/ui-plugins/{pluginId}/bundle.js
      //    Returns raw JavaScript bundle (Content-Type: application/javascript)
      // 3. IN MOBILE APP:
      //    - Fetches from bundleUrl (auto-generated by Core during deployment)
      //    - Downloads and caches locally using expo-file-system
      //    - Loads from cache on subsequent visits (no network needed)
      //    - Shows error if remote bundle download fails (no silent fallback)
      // 4. CACHING: 7-day TTL, automatic cleanup of expired bundles
      //
      // EXAMPLE — UNIFIED SOLUTION:
      // {
      //   "ui_plugins": [
      //     {
      //       "id": "mcp:ecommerce-mcp:order-dashboard",
      //       "version": "1.0.0",
      //       "render": {
      //         "mode": "adaptive",
      //         "iframeUrl": "/ui/order-dashboard/1.0.0/index.html",  // ← For web
      //         "reactNative": {
      //           "component": "OrderDashboard",
      //           "bundleUrl": "/api/ui-plugins/mcp:ecommerce-mcp:order-dashboard/bundle.js"  // ← Auto-generated by Core if rn-bundle exists
      //         }
      //       }
      //     }
      //   ]
      // }
      //
      // WEB DEVELOPERS: See docs/UI_PLUGIN_ARCHITECTURE.md for HTML/React patterns
      // MOBILE DEVELOPERS: See docs/REACT_NATIVE_UI_PLUGINS_ARCHITECTURE.md + example-plugins/
      // MOBILE APP HOST: See ateam-mobile/DYNAMIC_PLUGIN_LOADING_INTEGRATION.md for integration details
      //
      ui_plugins: {
        type: 'array', required: false,
        description: 'Interactive UI plugins for web (iframe) and mobile (React Native). Single skill request works on both platforms. Deployed together with auto-validation and auto-verification.',

        // ← This description is VISIBLE in public API (GET /spec/solution)

        key_concepts: {
          'unified_plugin_spec': 'Both web (iframe) and React Native (native) plugins use THE SAME API. Skills request plugins via tools.ui.present() without caring which render mode—the platform handles it automatically.',
          'render_modes': 'mode="iframe" for web-only (HTML in <iframe>), mode="react-native" for mobile-only (React Native component), mode="adaptive" for both platforms (different implementation per platform)',
          'same_backend_apis': 'Both web and mobile plugins use identical skill-plugin APIs: props in, events out. Skills don\'t differentiate between render modes.',
          'unified_deployment': 'Deploy both web and React Native plugins together via ateam_build_and_run. System auto-validates, uploads, tests, and verifies both types. Single verification response.',
          'bundle_serving': 'React Native plugin bundles are served by Core API at GET /api/ui-plugins/{pluginId}/bundle.js. Core auto-detects bundleUrl at runtime by checking if rn-bundle/index.bundle.js exists in the connector\'s mcp-store directory. Connectors declare intent (mode: "adaptive"), Core resolves physical assets. No manual URL configuration needed.',
          'mobile_bundle_flow': '1. ateam_build_and_run uploads connector source + runs npm run build → produces rn-bundle/index.bundle.js 2. Core auto-detects bundle existence at runtime via cp.getContextPlugin 3. Mobile app fetches from /api/ui-plugins/{pluginId}/bundle.js, caches locally (7-day TTL) 4. Next load is instant from cache',
          'developer_guides': 'Web developers: docs/UI_PLUGIN_ARCHITECTURE.md | Mobile developers: docs/REACT_NATIVE_UI_PLUGINS_ARCHITECTURE.md + example-plugins/ | Mobile app host: ateam-mobile/DYNAMIC_PLUGIN_LOADING_INTEGRATION.md',
          'rn_plugin_requirements': {
            summary: 'React Native plugins require: rn-src/index.tsx entry point, package.json with build:rn script, and the build must produce rn-bundle/index.bundle.js. The health check validates all of this.',
            file_structure: {
              'connectors/<id>/rn-src/index.tsx': 'REQUIRED entry point — must export default a plain object with id, type, version, capabilities, and Component fields',
              'connectors/<id>/package.json': 'REQUIRED — must have "build:rn" script that bundles rn-src → rn-bundle/',
              'connectors/<id>/rn-bundle/index.bundle.js': 'BUILD OUTPUT — produced by build:rn, validated by Core on upload',
            },
            minimal_index_tsx: 'import { useApi } from \'@adas/plugin-sdk\';\nexport default {\n  id: \'plugin-name\',\n  type: \'ui\',\n  version: \'1.0.0\',\n  capabilities: { haptics: true },\n  Component({ bridge, native, theme }) {\n    const api = useApi(bridge);\n    return null; // your JSX here\n  },\n};',
            build_rn_script: 'Must produce rn-bundle/index.bundle.js as CommonJS module. Externals: react, react-native, @adas/plugin-sdk (provided by host app via require shim).',
            bundle_format: 'module.exports.default must be a plain object with id, Component, and optional type/version/capabilities fields. Bundle is evaluated via new Function("module","exports","require", code).',
            validation_chain: '1. rn-src/ exists? → YES: run build:rn → rn-bundle/index.bundle.js exists + non-empty + is JS → DEPLOY OK. NO rn-src/: skip RN build (iframe-only OK). rn-src/ exists but no bundle → DEPLOY REJECTED.',
            solution_definition: 'ui_plugins entry must have render.mode="adaptive" + render.reactNative.component matching the default export\'s id field. bundleUrl is auto-injected by Core at runtime.',
            host_app_boundary: {
              summary: 'CRITICAL: Solution builders create plugin source (rn-src/) and bundles (rn-bundle/) ONLY. The mobile host app (ateam-mobile) already provides the full runtime infrastructure. Do NOT build any of these yourself.',
              provided_by_host_app: [
                '@adas/plugin-sdk — useApi(), PluginProps types, bridge protocol. Injected at runtime via require() shim. Do NOT create this package.',
                'PluginLoader (src/components/PluginLoader.tsx) — downloads bundles from Core, renders in WebView with bridge JS',
                'usePluginBridge (src/hooks/usePluginBridge.ts) — postMessage protocol, MCP call proxying, plugin command routing',
                'useRemotePluginBundles (src/hooks/useRemotePluginBundles.ts) — fetches /api/ui-plugins/{id}/bundle.js, caches 7 days',
                'Tab navigation (app/(tabs)/index.tsx) — dynamic tabs from plugin manifest (Chat + plugin panels)',
              ],
              do_NOT_build: [
                'Do NOT create @adas/plugin-sdk as an npm package or local module — the host app provides it at bundle eval time via require shim',
                'Do NOT build a PluginHost or PluginLoader component — already exists and works in ateam-mobile',
                'Do NOT add navigation between chat and plugin screens — already exists as dynamic tabs in ateam-mobile',
                'Do NOT modify ateam-mobile source code — it is a separate project that already handles all plugin rendering',
              ],
              your_job_as_solution_builder: [
                '1. Write plugin source in connectors/<id>/rn-src/index.tsx',
                '2. Add esbuild.config.mjs + package.json with build:rn script',
                '3. Build produces rn-bundle/index.bundle.js (CommonJS, externals: react, react-native, @adas/plugin-sdk)',
                '4. Deploy via ateam_build_and_run — Core serves the bundle at /api/ui-plugins/{pluginId}/bundle.js',
                '5. Mobile app automatically discovers, downloads, caches, and renders your plugin — no host-side changes needed',
              ],
            },
          },
        },

        item_schema: {
          id: { type: 'string', required: true, description: 'Unique plugin identifier. Format: "mcp:<connector-id>:<plugin-name>"' },
          name: { type: 'string', required: true, description: 'Display name (1-100 characters)' },
          version: { type: 'string', required: true, description: 'Semantic version (X.Y.Z format)' },
          description: { type: 'string', required: false, description: 'Brief description (1-500 characters)' },
          type: {
            type: 'enum', required: false,
            values: ['ui', 'service', 'hybrid'],
            description: '"ui" = visual dashboard, "service" = headless/background, "hybrid" = both. Default: "ui"',
          },
          render: {
            type: 'object', required: true,
            description: 'Rendering configuration (polymorphic by mode)',
            polymorphic_by: 'mode',
            fields: {
              mode: {
                type: 'enum', required: true,
                values: ['iframe', 'react-native', 'adaptive'],
                description: '"iframe" = web-only, "react-native" = mobile-only, "adaptive" = both platforms',
              },
              iframeUrl: {
                type: 'string', required: false,
                description: 'Required for mode="iframe" or mode="adaptive". Format: "/ui/{pluginId}/index.html". File MUST exist in connector mcp_store.',
              },
              component: {
                type: 'string', required: false,
                description: 'Required for mode="react-native" or mode="adaptive". Plugin identifier (must match the id field in the default export)',
              },
              external: {
                type: 'boolean', required: false,
                description: 'For iframe only. If true, iframe can be embedded on external domains. Default: false (SAMEORIGIN)',
              },
              reactNative: {
                type: 'object', required: false,
                description: 'For mode="adaptive" only. React Native configuration',
                fields: {
                  component: { type: 'string', required: true, description: 'Plugin identifier (must match the id field in the plugin\'s default export)' },
                  bundleUrl: { type: 'string', required: false, description: 'Auto-generated by Core during deployment. URL to fetch React Native bundle: /api/ui-plugins/{pluginId}/bundle.js. Mobile app caches locally (7-day TTL).' },
                  bundleId: { type: 'string', required: false, description: 'Future: separate bundle identifier' },
                },
              },
            },
          },
          capabilities: {
            type: 'object', required: false,
            description: 'Native device capabilities this plugin requests',
            fields: {
              haptics: { type: 'boolean', required: false, description: 'Vibration/haptic feedback (Android/iOS only)' },
              camera: { type: 'boolean', required: false, description: 'Camera access (native only)' },
              location: { type: 'boolean', required: false, description: 'GPS/location services (native only)' },
              storage: { type: 'boolean', required: false, description: 'Local file system access (native) or localStorage/IndexedDB (web)' },
              notifications: { type: 'boolean', required: false, description: 'Push notifications (native) or browser notifications (web)' },
            },
          },
          channels: {
            type: 'string[]', required: false,
            description: 'Communication channels the plugin listens to. Example: ["order-updates", "payment-status"]',
          },
          commands: {
            type: 'array', required: false,
            description: 'Commands the plugin handles. These become virtual tools visible to the AI planner (e.g., ui.order-dashboard.highlight_order)',
            item_schema: {
              name: { type: 'string', required: true, description: 'Command identifier (lowercase_underscore only)' },
              description: { type: 'string', required: true, description: 'Human-readable description' },
              input_schema: {
                type: 'object', required: false,
                description: 'JSON Schema for command arguments',
                fields: {
                  type: { type: 'string', required: true, description: '"object"' },
                  properties: { type: 'object', required: true, description: 'Field definitions' },
                  required: { type: 'string[]', required: false, description: 'Required field names' },
                  additionalProperties: { type: 'boolean', required: false },
                },
              },
            },
          },
        },
      },
    },

    functional_connectors: {
      type: 'array', required: false,
      description: 'Background services and functional connectors for mobile/native environments. These run client-side without UI, handling device data collection, offline sync, background tasks, etc.',
      item_schema: {
        id: { type: 'string', required: true, pattern: '^[a-z0-9\\-]+$', description: 'Unique connector ID (lowercase, hyphens only). Example: "device-bridge"' },
        name: { type: 'string', required: true, description: 'Display name (1-100 characters)' },
        description: { type: 'string', required: false, description: 'What this connector does (1-500 characters)' },
        module: {
          type: 'string', required: true, pattern: '^@?[a-z0-9\\-]+(/[a-z0-9\\-]+)?$',
          description: 'NPM module path. Examples: "@mobile-pa/device-bridge", "my-connector". Module must be pre-installed in mobile app.',
        },
        type: {
          type: 'enum', required: false,
          values: ['background', 'service'],
          description: '"background" = runs continuously (location tracking, sync), "service" = runs on demand. Default: "background"',
        },
        autoStart: {
          type: 'boolean', required: false,
          description: 'Auto-start when tenant is selected (requires permissions). Default: true',
        },
        permissions: {
          type: 'string[]', required: false,
          description: 'Native capabilities required. Valid values: "calendar", "contacts", "location", "battery", "connectivity", "notifications". Example: ["calendar", "location"]',
        },
        backgroundSync: {
          type: 'boolean', required: false,
          description: 'Enable background task registration (allows sync even when app is backgrounded). Default: false. Requires expo-task-manager.',
        },
        config: {
          type: 'object', required: false,
          description: 'Runtime configuration passed to connector constructor. Keys depend on connector implementation.',
          fields: {
            // Flexible object — no fixed schema
          },
        },
      },
    },

    // ── Models ──
    models: {
      grant_economy: {
        description: 'How verified claims flow between skills in A-Team',
        lifecycle: [
          '1. Skill calls a tool (e.g., identity.candidates.search)',
          '2. Platform checks grant_mapping rules for that tool',
          '3. On match, extract value via source_field JSON path from tool result',
          '4. Grant stored in conversation context with optional TTL',
          '5. On handoff, grants listed in grants_passed propagate to target skill',
          '6. Grants listed in grants_dropped are removed from context',
          '7. Target skill access_policy checks required grants before tool execution — tools that would be denied are hidden from the LLM planner entirely (it cannot see or select them)',
          '8. When grants are acquired (e.g., after identity verification), previously hidden tools become visible automatically on the next iteration',
          '9. Grants expire after ttl_seconds (if set) — expired grants cause tools to become hidden again',
        ],
        key_concepts: {
          grant: 'A verified claim (key-value pair) attached to a conversation',
          grant_mapping: 'Rule that auto-issues a grant when a tool returns successfully',
          access_policy: 'Declarative rules that check grants before allowing tool execution. Two enforcement layers: (1) planner-level — tools with deny effect due to missing grants are removed from the LLM catalog so it cannot even see them, (2) execution-level — tools are blocked at call time as defense-in-depth. Effect "constrain" keeps tools visible but injects args and filters responses.',
          security_contract: 'Cross-skill agreement defining which grants are required for which tools',
        },
      },
      handoff_flow: {
        description: 'How conversations transfer between skills. Handoff is a first-class platform capability — zero configuration needed from builders.',
        mechanisms: {
          'handoff-controller-mcp': 'Live conversation transfer. The skill calls sys.handoffToSkill(to_skill, grants) — a built-in system tool always available to every skill. Platform creates a session and routes subsequent messages to the target skill.',
          'internal-message': 'Async skill-to-skill message. Does not redirect the user conversation. Used for background coordination.',
        },
        grant_propagation: 'On handoff, grants_passed are forwarded to target skill context. grants_dropped are removed. This ensures the target has exactly the grants it needs.',
        system_tool: {
          description: 'sys.handoffToSkill is a built-in platform tool — always available to every skill, no connector wiring needed. Add it to the skill\'s bootstrap_tools to ensure the planner always sees it.',
          name: 'sys.handoffToSkill',
          args: {
            to_skill: { type: 'string', required: true, description: 'Target skill slug to hand off to' },
            grants: { type: 'object', required: false, description: 'Verified grants to pass (e.g., { "ecom.customer_id": "C-123" })' },
            summary: { type: 'string', required: false, description: 'What happened before handoff' },
            original_goal: { type: 'string', required: false, description: 'User\'s original request' },
            ttl_seconds: { type: 'number', required: false, description: 'Session TTL in seconds (default: 3600, max: 86400)' },
          },
          returns: '{ ok, handoff_session_id, status, to_skill, from_skill, grants_passed, expires_at }',
          auto_injected: 'channel_type, channel_id, from_skill, and idempotency_key are auto-injected by the platform from the job context — the skill never needs to provide them.',
          note: 'No connector wiring needed. No mcp_bridge tool definitions. Add sys.handoffToSkill to bootstrap_tools so the planner always has it available. Just define handoffs in the solution and the skill can call sys.handoffToSkill.',
        },
        routing_priority: 'Full routing priority: 1. Explicit skillSlug from caller → 2. Conversation continuity (actor\'s last active skill) → 3. Active handoff session → 4. Per-channel default_skill (routing.<channel>.default_skill) → 5. Global default_skill (policies.default_skill_slug) → 6. Auto-detect from deployed skills (gateway/orchestrator role → first skill). Clients never need to know internal skill slugs — just send the message and the platform routes it.',
      },
      // ── Solution Architecture Decision (CRITICAL) ──
      solution_topology: {
        _CRITICAL: 'This is the FIRST and MOST IMPORTANT decision when designing a multi-skill solution. It determines how messages are routed, which system tools are auto-injected, and what handoff instructions Core adds to each skill\'s persona. Get this right and handoffs work automatically. Get it wrong and skills can\'t collaborate.',
        description: 'Every A-Team solution falls into one of three topologies. Core auto-configures routing, system tool injection, and persona augmentation based on which topology you choose. The solution builder does NOT need to manually configure handoff logic — Core handles it.',
        topologies: {
          single_skill: {
            description: 'One skill handles everything. No routing decisions needed.',
            when_to_use: 'Simple use cases with one domain (e.g., order support, FAQ bot).',
            solution_config: 'Just one entry in skills[]. No orchestrator_skill, no routing needed.',
            auto_behavior: [
              'No multi-agent system tools injected (sys.handoffToSkill, sys.askSkill, sys.findCapability, sys.listSkills are excluded).',
              'Messages go directly to the single skill.',
              'No persona augmentation for routing.',
            ],
            tip: 'Set exclude_bootstrap_tools: ["sys.handoffToSkill", "sys.askSkill", "sys.findCapability", "sys.listSkills"] to save planner token budget.',
          },
          orchestrator_based: {
            description: 'One skill acts as the central router/coordinator. All inbound messages go to the orchestrator first, which decides which worker skill should handle each request.',
            when_to_use: [
              'Complex solutions with 3+ specialized skills (e.g., personal assistant with calendar, email, device management).',
              'When you want centralized control over routing decisions.',
              'When skills have overlapping domains and you need intelligent routing.',
            ],
            solution_config: {
              how_to_activate: 'Set orchestrator_skill: "<orchestrator-skill-id>" at the solution level, OR set routing.<channel>.default_skill to point to an orchestrator-role skill.',
              example: '{ "orchestrator_skill": "pa-orchestrator", "skills": [{ "id": "pa-orchestrator", "role": "orchestrator" }, { "id": "device-manager", "role": "worker" }, { "id": "messaging-agent", "role": "worker" }] }',
            },
            auto_behavior: [
              'Orchestrator skill gets: sys.findCapability, sys.handoffToSkill, sys.askSkill, sys.listSkills auto-injected as bootstrap tools.',
              'Worker skills get: sys.handoffToSkill, sys.askSkill auto-injected (so they can hand back to orchestrator or query siblings).',
              'Core auto-injects routing instructions into each skill\'s persona at runtime — the orchestrator knows to discover and delegate, workers know to hand back when out of scope.',
              'All inbound messages route to the orchestrator first. The orchestrator uses sys.findCapability + sys.handoffToSkill to route to the right worker.',
              'After a worker finishes, subsequent messages from the same actor continue with that worker (conversation continuity) until the session expires or the worker hands back.',
            ],
            pattern: 'User → Orchestrator → sys.findCapability("send email") → messaging-agent found → sys.handoffToSkill("messaging-agent") → Worker handles request → Worker hands back to orchestrator when done or out of scope.',
          },
          symmetric: {
            description: 'No central orchestrator. Each skill can discover capabilities and hand off directly to any other skill. Fully decentralized routing.',
            when_to_use: [
              'Solutions with 2-3 skills of equal importance (no natural "coordinator").',
              'When each skill has a clear, non-overlapping domain.',
              'When you want simpler architecture without a central point.',
            ],
            solution_config: {
              how_to_activate: 'Multiple skills[] but NO orchestrator_skill field. Set routing.<channel>.default_skill to any skill (the entry point, but not a coordinator).',
              example: '{ "skills": [{ "id": "life-manager", "role": "worker" }, { "id": "messaging-agent", "role": "worker" }], "routing": { "api": { "default_skill": "life-manager" } } }',
            },
            auto_behavior: [
              'ALL skills get: sys.findCapability, sys.handoffToSkill, sys.askSkill, sys.listSkills auto-injected as bootstrap tools.',
              'Core auto-injects handoff instructions into each skill\'s persona — every skill knows how to discover capabilities and hand off.',
              'Messages route to the default_skill for that channel. If the default skill can\'t handle the request, it discovers and hands off.',
              'Any skill can hand off to any other skill directly — no orchestrator in the middle.',
            ],
            pattern: 'User → Skill A → "I can\'t handle this" → sys.findCapability("device control") → Skill B found → sys.handoffToSkill("skill-b") → Skill B handles it.',
          },
        },
        what_core_auto_handles: {
          description: 'The solution builder does NOT need to implement any of these manually. Core handles them automatically based on the topology.',
          auto_features: [
            'System tool injection — sys.handoffToSkill, sys.askSkill, sys.findCapability, sys.listSkills are auto-pinned as bootstrap tools based on routing mode.',
            'Persona augmentation — Core injects handoff instructions into each skill\'s prompt context at runtime, telling it when and how to hand off.',
            'Conversation continuity — after a handoff, subsequent messages from the same actor automatically route to the current skill (no manual session tracking).',
            'Handoff session management — sessions are created, tracked, and expired automatically by the platform.',
            'Grant propagation — verified claims (grants) automatically flow between skills during handoffs.',
            'Capability index — pre-built and cached, auto-refreshed when skills are deployed.',
          ],
        },
        what_the_builder_must_do: {
          description: 'The solution builder needs to make ONE architectural decision and define clear skill boundaries.',
          responsibilities: [
            '1. Choose topology: orchestrator-based or symmetric (this is the key decision).',
            '2. Define skills[] with clear roles, domains, and problem statements.',
            '3. Set orchestrator_skill (for orchestrator topology) or omit it (for symmetric).',
            '4. Set routing.<channel>.default_skill to the entry point skill.',
            '5. Define grant_mappings if skills need to share verified claims.',
            '6. Define handoffs[] in the solution to declare which skill-to-skill transfers are allowed.',
            '7. Write skill problem statements and intents with clear domain boundaries — this helps sys.findCapability route accurately.',
          ],
          do_NOT_do: [
            'Do NOT manually write handoff instructions in skill personas — Core injects them automatically.',
            'Do NOT manually manage handoff sessions — the platform handles creation, tracking, and expiry.',
            'Do NOT implement custom routing logic — use orchestrator_skill or routing.default_skill.',
            'Do NOT define sys.handoffToSkill as a regular tool in the skill definition — it\'s a system tool auto-injected by the platform.',
          ],
        },
        decision_guide: {
          question: 'How do I choose between orchestrator-based and symmetric?',
          orchestrator_if: [
            'You have 3+ skills with overlapping domains.',
            'You want a single "brain" that decides where to route.',
            'You need complex routing logic (e.g., verify identity first, then route to the right domain).',
            'You want to add new worker skills without changing existing ones.',
          ],
          symmetric_if: [
            'You have 2-3 skills with clear, non-overlapping domains.',
            'Each skill can independently decide when it\'s out of scope.',
            'You want simpler architecture with fewer moving parts.',
            'No skill needs to coordinate across multiple other skills.',
          ],
        },
      },

      // ── Multi-Agent Routing ──
      multi_agent_routing: {
        description: 'Platform-level system tools for multi-skill collaboration. Any skill can discover capabilities, query other skills, or delegate fully. Only relevant for solutions with 3+ skills — single-skill solutions should exclude these tools.',
        when_to_use: 'Complex solutions where skills need to collaborate, route requests, or query each other\'s domains at runtime.',
        tools: {
          'sys.findCapability': {
            description: 'Search all skills to find which skill and tools can handle a request. Uses a prebuilt capability index — zero LLM cost at query time.',
            args: {
              query: { type: 'string', required: true, description: 'Natural language description (e.g., "delete old emails", "turn off lights")' },
              top_k: { type: 'number', required: false, description: 'Max results (default: 5, max: 10)' },
              rebuild: { type: 'boolean', required: false, description: 'Force rebuild the index (expensive — uses LLM)' },
            },
            returns: '{ ok, query, results[{ capability, skill, skillName, tools, intent, confidence, matchScore }], indexMeta: { totalEntries, skillCount, stale } }',
            cost: 'Zero LLM cost (query). Index build: one fast model call per TTL (~5-15s).',
            how_index_works: [
              'Phase 1 (code, instant): Extracts tokens from all skill definitions — tool names, descriptions, intents, problem statements',
              'Phase 2 (LLM, cheap): Generates synonyms and aliases (e.g., "trash" → "delete", "remove", "clean up")',
              'Stored in MongoDB per tenant with configurable TTL (default: 1 hour)',
              'Auto-rebuilds when stale or when skills are deployed',
              'Query matching is pure keyword intersection — no LLM call',
            ],
          },
          'sys.askSkill': {
            description: 'Query another skill and wait for the answer. Non-terminal — the calling skill continues its plan with the response.',
            args: {
              to_skill: { type: 'string', required: true, description: 'Target skill slug' },
              message: { type: 'string', required: true, description: 'Natural language request for the target skill' },
              timeout_seconds: { type: 'number', required: false, description: 'Max wait time (default: 60, max: 120)' },
            },
            returns: '{ ok, answer, sub_job_id, skill, elapsed_ms }',
            cost: 'Target skill\'s execution cost (LLM + tools). Latency: 2-60s.',
            how_it_works: [
              '1. Creates a sub-job on the target skill with the same actor context',
              '2. Polls for completion (1s intervals) until done or timeout',
              '3. Extracts the answer text from the sub-job result',
              '4. Returns to the calling skill — execution continues',
            ],
            vs_handoff: 'sys.askSkill is non-terminal (calling skill keeps running) and synchronous (waits for answer). sys.handoffToSkill is terminal (calling skill ends) and the target skill takes over the conversation.',
          },
          'sys.listSkills': {
            description: 'List all skills in the solution with descriptions, connectors, and supported intents. Zero LLM cost.',
            args: {},
            returns: '{ ok, count, skills[{ slug, name, description, connectors, intentCount, intents, toolCount }] }',
            cost: 'Zero. Pure metadata lookup.',
          },
        },
        patterns: {
          'discover_then_delegate': {
            description: 'Skill receives a request outside its domain, finds the right skill, and hands off.',
            flow: 'sys.findCapability("delete old emails") → messaging-agent found → sys.handoffToSkill({ to_skill: "messaging-agent" })',
          },
          'discover_then_query': {
            description: 'Skill needs data from another domain but wants to continue its own plan.',
            flow: 'sys.findCapability("calendar events") → life-manager found → sys.askSkill({ to_skill: "life-manager", message: "What\'s on my calendar today?" }) → answer received → continue building response',
          },
          'direct_query': {
            description: 'Skill already knows which skill to ask (no discovery needed).',
            flow: 'sys.askSkill({ to_skill: "messaging-agent", message: "Check for unread emails from GitHub" }) → answer received → use in current plan',
          },
        },
        design_tips: [
          'Design skills with clear domain boundaries — findCapability works best when skills have distinct problem statements and tool sets',
          'Use descriptive intent IDs and tool descriptions — the capability index tokenizes these for search',
          'For single-skill solutions, exclude all routing tools: exclude_bootstrap_tools: ["sys.handoffToSkill", "sys.askSkill", "sys.findCapability", "sys.listSkills"]',
        ],
      },

      dynamic_triggers: {
        description: 'How skills create, manage, and delete triggers at runtime using sys.trigger. This extends static triggers (defined in skill YAML) with dynamic triggers that the AI agent itself can create during conversations.',
        overview: [
          'Static triggers are defined in the skill definition (triggers[]) and deployed with the skill — they are fixed.',
          'Dynamic triggers are created at runtime by the AI agent calling sys.trigger — they are stored in MongoDB and loaded alongside static triggers.',
          'Use dynamic triggers when the user asks for scheduled tasks: "remind me tomorrow at 9 AM", "check my email every 5 minutes", "turn on the AC every day at 15:00".',
          'The trigger-runner service loads both static and dynamic triggers and fires them on their schedules.',
        ],
        system_tool: {
          name: 'sys.trigger',
          description: 'Built-in platform tool — always available to every skill, no connector wiring needed. Add it to bootstrap_tools to ensure the planner always sees it.',
          actions: {
            create: {
              description: 'Create a new dynamic trigger',
              required_args: ['trigger_id', 'schedule', 'prompt'],
              optional_args: ['skill_slug', 'description', 'input', 'concurrency', 'timezone', 'auto_delete'],
              example: 'sys.trigger({ action: "create", trigger_id: "daily-ac-on", schedule: "cron:0 15 * * *", prompt: "Turn on the AC and set to 24 degrees", timezone: "Asia/Jerusalem", description: "Daily AC activation" })',
            },
            list: {
              description: 'List dynamic triggers for a skill',
              optional_args: ['skill_slug'],
              note: 'Defaults to the calling skill. Use skill_slug to list triggers for another skill.',
              example: 'sys.trigger({ action: "list" })',
            },
            update: {
              description: 'Update fields on an existing dynamic trigger',
              required_args: ['trigger_id'],
              optional_args: ['schedule', 'prompt', 'description', 'input', 'concurrency', 'timezone', 'enabled'],
              example: 'sys.trigger({ action: "update", trigger_id: "daily-ac-on", schedule: "cron:0 16 * * *" })',
            },
            delete: {
              description: 'Delete a dynamic trigger',
              required_args: ['trigger_id'],
              example: 'sys.trigger({ action: "delete", trigger_id: "daily-ac-on" })',
            },
            pause: {
              description: 'Disable a trigger without deleting it (sets enabled: false)',
              required_args: ['trigger_id'],
            },
            resume: {
              description: 'Re-enable a paused trigger (sets enabled: true)',
              required_args: ['trigger_id'],
            },
          },
          schedule_format: {
            description: 'The schedule argument uses a type:value format',
            types: {
              'cron:<expr>': 'Standard 5-field cron expression. Example: "cron:0 15 * * *" = every day at 15:00. "cron:*/5 * * * *" = every 5 minutes. "cron:0 9 * * 1-5" = weekdays at 9 AM.',
              'every:<duration>': 'ISO 8601 duration for recurring intervals. Minimum PT1M. Example: "every:PT5M" = every 5 minutes. "every:PT1H" = every hour. "every:P1D" = every day.',
              'once:<datetime>': 'ISO 8601 datetime for one-shot execution. Must be in the future. Example: "once:2026-03-08T09:00:00". Fires once, then auto-deletes if auto_delete is true (default for one-shot).',
            },
          },
          args: {
            trigger_id: { type: 'string', required: true, description: 'Unique trigger ID. Alphanumeric + hyphens, 3-60 chars. Example: "daily-ac-on", "reminder-dentist-mar8"' },
            schedule: { type: 'string', required: true, description: 'Schedule in type:value format. See schedule_format.' },
            prompt: { type: 'string', required: true, description: 'Goal prompt for the triggered job — what the skill will execute when the trigger fires.' },
            skill_slug: { type: 'string', required: false, description: 'Target skill slug. Defaults to the calling skill. Use this for cross-skill triggers (e.g., orchestrator creating triggers for worker skills).' },
            description: { type: 'string', required: false, description: 'Human-readable description of what this trigger does.' },
            input: { type: 'object', required: false, description: 'Arbitrary structured data passed to the trigger context.' },
            concurrency: { type: 'number', required: false, default: 1, description: 'Max parallel jobs. Use 1 for state-modifying triggers.' },
            timezone: { type: 'string', required: false, default: 'UTC', description: 'IANA timezone for cron scheduling. Example: "Asia/Jerusalem", "America/New_York".' },
            auto_delete: { type: 'boolean', required: false, description: 'Delete trigger after execution. Defaults to true for once: schedules, false otherwise.' },
          },
          returns: '{ ok, trigger_id, schedule_type, schedule_value, ... } — action-specific fields',
          limits: {
            max_per_skill: 20,
            min_interval: 'PT1M (every: schedule type)',
            once_must_be_future: 'once: datetime must be in the future',
          },
          cross_skill: {
            description: 'A skill can create triggers that target a different skill by passing skill_slug.',
            example: 'An orchestrator skill can set up monitoring triggers for worker skills: sys.trigger({ action: "create", trigger_id: "check-orders", skill_slug: "order-support", schedule: "every:PT15M", prompt: "Check for stuck orders" })',
            note: 'The trigger fires on the TARGET skill — it creates a job for that skill, not the calling skill.',
          },
          note: 'No connector wiring needed. Add sys.trigger to bootstrap_tools so the planner always has it available. After any mutation (create/update/delete/pause/resume), the platform automatically signals the trigger-runner to reload.',
        },
        use_cases: [
          '"Remind me tomorrow at 9 AM about the dentist" → sys.trigger({ action: "create", trigger_id: "reminder-dentist", schedule: "once:2026-03-08T09:00:00", prompt: "Remind the user about their dentist appointment", auto_delete: true })',
          '"Turn on the AC every day at 15:00" → sys.trigger({ action: "create", trigger_id: "daily-ac-on", schedule: "cron:0 15 * * *", prompt: "Turn on the AC and set temperature to 24", timezone: "Asia/Jerusalem" })',
          '"Check for emails from boss@company.com every 5 minutes" → sys.trigger({ action: "create", trigger_id: "check-boss-emails", schedule: "every:PT5M", prompt: "Check inbox for emails from boss@company.com and notify me of any new ones" })',
          '"Stop the daily AC trigger" → sys.trigger({ action: "delete", trigger_id: "daily-ac-on" })',
          '"Pause my email checks" → sys.trigger({ action: "pause", trigger_id: "check-boss-emails" })',
          '"What triggers do I have?" → sys.trigger({ action: "list" })',
        ],
        important_notes: [
          'Dynamic triggers are persisted in MongoDB — they survive restarts and redeploys.',
          'Static triggers (from skill YAML) and dynamic triggers coexist. If a dynamic trigger has the same key as a static one, the static one takes precedence.',
          'One-shot triggers (once:) fire exactly once. With auto_delete: true (the default for once:), they are automatically cleaned up after execution.',
          'The trigger prompt is critical — it tells the skill exactly what to do. Be specific: name the tools to use, the conditions to check, the actions to take.',
          'Dynamic triggers show in the Triggers UI plugin with a purple "Dynamic" badge and can be managed from there.',
        ],
        common_mistakes: [
          'Vague trigger prompt — "check stuff" is useless. Be explicit: "Call inbox.list to check for unread emails from boss@company.com. If found, send a Telegram notification with the subject and sender."',
          'Forgetting timezone for cron — "cron:0 9 * * *" fires at 9 AM UTC. If the user is in Jerusalem, use timezone: "Asia/Jerusalem".',
          'Creating too many short-interval triggers — max 20 per skill, and short intervals (PT1M) consume resources. Use longer intervals when possible.',
          'Not using auto_delete for one-shot reminders — without it, the trigger stays in the database after firing (harmless but cluttery).',
        ],
      },
      quality_scoring: {
        description: 'How solution quality is assessed via LLM (POST /validate/solution)',
        dimensions: DIMENSION_WEIGHTS,
        grade_thresholds: GRADE_THRESHOLDS,
        note: 'Quality scoring requires LLM API key (ANTHROPIC_API_KEY or OPENAI_API_KEY). If unavailable, structural validation still works.',
      },
      ui_plugins: {
        description: 'How connectors serve interactive dashboards via the built-in UI plugin system',
        overview: 'Connectors marked ui_capable: true can serve HTML/JS dashboards that run in iframes. The platform handles serving, routing, and bridging postMessage calls to connector tools. No custom proxy endpoints or infrastructure setup needed.',
        how_it_works: [
          '1. Set ui_capable: true on the connector in platform_connectors',
          '2. Connector implements ui.listPlugins and ui.getPlugin tools (platform auto-injects these during deploy)',
          '3. Plugin HTML files go in ui-dist/{pluginId}/index.html in the connector\'s mcp_store',
          '4. On deploy, platform auto-discovers plugins via ui.listPlugins',
          '5. Admin web and any integrated frontend renders plugins in iframes via /mcp-ui/{tenant}/{connectorId}/{path}',
          '6. Plugin HTML communicates with connector tools via postMessage protocol (source: "adas-plugin" → PluginHost → ADAS Core → connector)',
        ],
        url_resolution: 'Connector returns iframeUrl: /ui/{pluginId}/index.html → platform transforms to /mcp-ui/{tenant}/{connectorId}/{pluginId}/index.html → served from mcp-store',
        postmessage_protocol: 'See GET /spec/examples/connector-ui for the complete postMessage protocol with code examples (init, mcp-call, mcp-result)',
        cross_connector_calls: 'Plugins can call tools on ANY registered connector, not just their own. Pass the target connectorId in the mcpProxy params.',
        see_example: 'GET /spec/examples/connector-ui — complete working example with postMessage code, tool response formats, wrong-example warnings, and file structure',
        planner_integration: {
          description: 'How plugins expose interactive commands to the AI planner — the planner can call plugin commands as tools and focus plugins in the UI',
          capabilities_commands: [
            'Plugin manifests can declare capabilities.commands[] — an array of named commands the plugin handles.',
            'Each command has: name (string), description (string), input_schema (JSON Schema for args).',
            'Example: { name: "highlight_order", description: "Highlight a specific order in the dashboard", input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } }',
          ],
          virtual_tools: [
            'The platform auto-generates planner-visible virtual tools from capabilities.commands.',
            'Tool naming: ui.{short_id}.{command_name} — e.g. ui.ecom_dash.highlight_order',
            'short_id comes from the skill\'s ui_plugins declaration: ui_plugins: [{ id: "mcp:connector-id:plugin-name", short_id: "ecom_dash" }]',
            'These virtual tools are auto-pinned for the planner — the LLM always sees them and can call them.',
          ],
          how_commands_execute: [
            '1. Planner calls the virtual tool (e.g. ui.ecom_dash.highlight_order({ order_id: "O-123" }))',
            '2. Backend emits SSE plugin_command event to the connected frontend',
            '3. Frontend auto-switches the context panel to the target plugin (focus)',
            '4. Plugin iframe receives the command via postMessage',
            '5. Plugin executes the command and POSTs the result back',
            '6. Backend unblocks the tool call with the result — job continues',
          ],
          focus_plugin: {
            description: 'Use sys.focusUiPlugin to bring a plugin into focus without sending a command.',
            usage: 'sys.focusUiPlugin({ plugin_id: "mcp:connector-id:plugin-name" })',
            note: 'Fire-and-forget — does not wait for the plugin to respond. Use this when you want to show a dashboard to the user without triggering a specific command. Plugin commands (capabilities.commands) auto-focus the plugin as a side effect.',
          },
          skill_declaration: [
            'To use UI plugin commands, the skill must declare the plugin in its ui_plugins array:',
            'ui_plugins: [{ id: "mcp:connector-id:plugin-name", short_id: "ecom_dash" }]',
            'The short_id is used for virtual tool naming (ui.{short_id}.{command_name}).',
            'If short_id is omitted, it defaults to the last segment of the plugin ID with hyphens replaced by underscores.',
          ],
        },
        mobile_compatibility: {
          description: 'CRITICAL: Mobile apps do NOT relay mcpProxy calls from plugin iframes. Plugins that depend on live MCP calls will timeout on mobile.',
          root_cause: [
            'The A-Team mobile app renders plugin iframes but does NOT support the postMessage → mcpProxy relay that the web PluginHost provides.',
            'Any postMessage mcp-call from an iframe will timeout silently on mobile — the mobile PluginHost either lacks this relay or has a broken path for it.',
            'This means: plugins that require live MCP data to render will show blank/loading states forever on mobile.',
          ],
          required_pattern: [
            '1. EMBED DEFAULT DATA directly in the plugin HTML — hardcoded sample/default values that render immediately on load.',
            '2. Render the UI immediately using embedded data — the plugin must be visually complete without any MCP calls.',
            '3. SILENTLY attempt live MCP calls in the background (try/catch, no error UI on failure).',
            '4. If live data arrives (desktop/web), upgrade the UI with real data. If it fails (mobile), the user still sees the embedded default view.',
            '5. NEVER block rendering on MCP calls. NEVER show error states for failed mcpProxy calls.',
          ],
          why_this_works: 'Desktop/web gets live data upgrade. Mobile renders immediately with embedded defaults. No errors either way. This is the same pattern used by all working mobile plugins (e.g., GPT-clinic).',
          anti_patterns: [
            'WRONG: Show a loading spinner and wait for mcpProxy to return data before rendering.',
            'WRONG: Display error messages when mcpProxy calls fail.',
            'WRONG: Make the entire UI conditional on receiving an init message from the host.',
            'WRONG: Assume postMessage relay will work on all platforms.',
          ],
          code_example: `// CORRECT: Embed defaults, render immediately, upgrade silently
const DEFAULT_DATA = { orders: 42, revenue: "$12,340", status: "healthy" };
let data = DEFAULT_DATA;
renderDashboard(data); // Render immediately with defaults

// Silently try live data in background
async function tryLiveData() {
  try {
    const live = await mcpCall("analytics.orders.summary", {}, "orders-mcp");
    if (live) { data = live; renderDashboard(data); } // Upgrade UI
  } catch { /* Silent — mobile will hit this, that's OK */ }
}
if (hostReady) tryLiveData();`,
          validation: 'The solution validator checks ui-dist/ HTML files for this pattern and warns if mcpProxy calls are made without embedded fallback data.',
          see_example: 'GET /spec/examples/connector-ui — _mobile_compatibility section',
        },
      },
    },

    // ── Validation Rules ──
    validation_rules: {
      description: 'What POST /validate/solution checks',
      checks: [
        { name: 'identity_actor_types', description: 'Actor types are defined', severity: 'warning' },
        { name: 'identity_admin_roles', description: 'Admin roles are defined when actor types exist', severity: 'warning' },
        { name: 'identity_default_type_valid', description: 'Default actor type matches a defined actor type', severity: 'error' },
        { name: 'grant_provider_exists', description: 'Every grant issuer is a skill in the solution', severity: 'error' },
        { name: 'grant_consumer_exists', description: 'Every grant consumer is a skill in the solution', severity: 'error' },
        { name: 'grant_provider_missing', description: 'Consumed grants have at least one issuer', severity: 'error' },
        { name: 'handoff_from_exists', description: 'Handoff source skill exists in the solution', severity: 'error' },
        { name: 'handoff_to_exists', description: 'Handoff target skill exists in the solution', severity: 'error' },
        { name: 'contract_consumer_exists', description: 'Security contract consumer/provider skills exist', severity: 'error' },
        { name: 'no_orphan_skills', description: 'Every skill is reachable via routing or handoffs', severity: 'warning' },
        { name: 'no_circular_handoffs', description: 'No infinite loops in handoff chains', severity: 'error' },
        { name: 'voice_enabled_type', description: 'voice.enabled must be a boolean', severity: 'error' },
        { name: 'voice_verification_method', description: 'voice.verification.method must be phone_lookup, security_question, or custom_skill', severity: 'error' },
        { name: 'voice_verification_on_failure', description: 'voice.verification.onFailure must be hangup or continue_limited', severity: 'error' },
        { name: 'voice_security_question', description: 'Security question and answer required when method is security_question', severity: 'error' },
        { name: 'voice_custom_skill', description: 'customSkill.skillSlug required when method is custom_skill', severity: 'error' },
        { name: 'voice_max_attempts', description: 'voice.verification.maxAttempts must be 1-10', severity: 'error' },
        { name: 'voice_routing', description: 'Voice enabled but no routing.voice defined', severity: 'warning' },
        { name: 'voice_custom_skill_exists', description: 'customSkill.skillSlug must reference a skill in this solution', severity: 'warning' },
        { name: 'voice_skill_override_exists', description: 'skillOverrides slugs must reference skills in this solution', severity: 'warning' },
        { name: 'ui_connector_mobile_compat', description: 'UI plugin HTML makes mcpProxy calls without embedded fallback data — will timeout on mobile', severity: 'warning' },
      ],
    },

    // ── Template ──
    template: {
      description: 'Minimal valid solution definition. Fill placeholders marked with <...>.',
      solution: {
        id: '<solution-id>',
        name: '<Solution Name>',
        version: '0.1.0',
        description: '<What this multi-agent solution does>',
        identity: {
          actor_types: [
            { key: 'end_user', label: 'End User', description: '<Who uses this solution>' },
          ],
          default_actor_type: 'end_user',
          admin_roles: [],
        },
        skills: [
          {
            id: '<gateway-skill-id>',
            name: '<Gateway Skill>',
            role: 'gateway',
            description: '<Entry point skill — identity verification or routing>',
            entry_channels: ['telegram', 'email'],
            connectors: ['<connector-id>'],
          },
          {
            id: '<worker-skill-id>',
            name: '<Worker Skill>',
            role: 'worker',
            description: '<Skill that does the actual work>',
            connectors: ['<connector-id>'],
          },
        ],
        grants: [
          {
            key: '<namespace.grant_name>',
            description: '<What this grant represents>',
            issued_by: ['<gateway-skill-id>'],
            consumed_by: ['<worker-skill-id>'],
            issued_via: 'grant_mapping',
            source_tool: '<tool-name>',
            source_field: '$.result.field',
          },
        ],
        handoffs: [
          {
            id: 'gateway-to-worker',
            from: '<gateway-skill-id>',
            to: '<worker-skill-id>',
            trigger: '<When to transfer>',
            grants_passed: ['<namespace.grant_name>'],
            grants_dropped: [],
            mechanism: 'handoff-controller-mcp',
          },
        ],
        routing: {
          api: { default_skill: '<gateway-skill-id>', description: 'Mobile app, web dashboard, and API calls' },
          telegram: { default_skill: '<gateway-skill-id>', description: 'All messages go to gateway first' },
          email: { default_skill: '<gateway-skill-id>', description: 'All emails go to gateway first' },
        },
        platform_connectors: [
          {
            id: '<connector-id>',
            name: '<Connector Name>',
            description: '<What this connector does>',
          },
        ],
        security_contracts: [
          {
            name: '<Contract name — human-readable>',
            consumer: '<worker-skill-id>',
            provider: '<gateway-skill-id>',
            requires_grants: ['<namespace.grant_name>'],
            required_values: { '<namespace.assurance_level>': ['L1'] },
            for_tools: ['<tool-name-1>', '<tool-name-2>'],
            validation: '<Human-readable explanation of what this contract enforces>',
          },
        ],
        // ── Voice Channel (optional) ──
        voice: {
          enabled: true,
          language: 'en',
          persona: { name: '<Bot Name>', style: 'professional' },
          welcome: '<Welcome message for callers>',
          verification: {
            enabled: true,
            method: 'security_question',
            securityQuestion: {
              question: '<Verification question>',
              answer: '<Expected answer>',
              answerMatchMode: 'smart',
            },
            maxAttempts: 3,
            onFailure: 'hangup',
          },
        },
      },
    },

    // ── Agent Guide ──
    agent_guide: {
      description: 'Step-by-step instructions for an AI agent building a multi-skill A-Team solution.',
      build_order: [
        '1. Build each skill individually first — each must pass POST /validate/skill',
        '2. Write connector source code — real MCP server implementations (Node.js/Python) with business logic, database access, UI dashboards',
        '3. Define identity: who uses this solution? Create actor_types (customer, agent, admin, etc.)',
        '4. Map the grant economy: what verified claims flow between skills? (e.g., customer_id, assurance_level)',
        '5. Define handoffs: how do conversations transfer between skills? What grants propagate?',
        '6. Set up routing: which skill answers which channel? (telegram, email, api). IMPORTANT for multi-skill solutions: always set routing.api.default_skill to define the entry point for mobile/web/API clients. Without it, clients would need to specify skillSlug manually.',
        '7. Add security contracts: which grants protect which tools across skill boundaries?',
        '8. (Optional) Add UI plugins: set ui_capable: true on platform_connectors, write plugin HTML in ui-dist/{pluginId}/, include in mcp_store. See GET /spec/examples/connector-ui for the full pattern.',
        '9. (Optional) Configure voice channel: add a voice{} block to the solution with persona, welcome message, verification settings, and known phones',
        '10. POST /validate/solution with { "solution": <def>, "skills": [<skill1>, <skill2>] }',
        '11. POST /deploy/solution with { solution, skills, connectors, mcp_store } — the Skill Builder imports everything, auto-generates Python MCP servers from skill tool definitions, and deploys to A-Team Core. If voice{} is present, voice config is pushed to the voice backend automatically. No slug or Python MCP code needed for skills.',
      ],
      naming_conventions: {
        solution_id: 'lowercase-kebab-case (e.g., "ecom-customer-service")',
        grant_key: 'namespace.name (e.g., "ecom.customer_id", "hr.employee_id")',
        handoff_id: 'descriptive from-to (e.g., "identity-to-orders", "orders-to-returns")',
      },
      common_mistakes: [
        'Grant consumed_by referencing skills not in this solution → validation error',
        'Missing handoff path between grant provider and consumer — grants only flow via handoffs',
        'Multi-skill solution without routing.api.default_skill — mobile/web clients won\'t know which skill to talk to. Always define the entry point for the "api" channel.',
        'Orphan skills not reachable via routing or handoffs → validation warning',
        'Circular handoff chains (A → B → A) → validation error',
        'Routing target skills that do not exist in the solution → validation error',
        'Forgetting to declare handoff-controller-mcp as a platform connector — still needed in the solution definition, but skills do NOT need it in their connectors list',
        'Security contract provider/consumer referencing non-existent skills',
        'Using "grants_propagated" instead of "grants_passed" in handoffs — the correct field name is grants_passed',
        'Using { tool, skill } in security_contracts instead of { name, consumer, provider, for_tools } — see the template and example for the correct schema',
        'Missing "id" field on handoffs — every handoff needs a unique id',
        'Deploying directly to A-Team Core instead of through the Skill Builder — always use POST /deploy/solution which routes through the Skill Builder for proper storage and MCP generation',
        'Writing Python MCP server code for skills — only connector implementations need real code. Skill MCP servers are auto-generated from tool definitions.',
        'Assuming one connector patch applies to all connectors — each connector (e.g., home-assistant-mcp, hue-mcp, tuya-mcp) has its OWN server.js. You must read and patch EACH connector independently. Use ateam_get_connector_source to read, ateam_github_patch to edit, then ateam_build_and_run(github:true) to redeploy.',
        'Defining stdio connectors without providing mcp_store code — if the connector server code is not pre-installed on A-Team Core, include it in the mcp_store field of the deploy payload. Without it, the connector will fail to start.',
        'Forgetting "type": "module" in package.json when using ESM imports or @modelcontextprotocol/sdk — Node.js 22.x supports ESM fully but needs the package.json declaration.',
        'Setting ui_capable: true but forgetting to implement ui.listPlugins and ui.getPlugin tools in the connector — both are required for plugin discovery',
        'Plugin iframeUrl must use /ui/ prefix (e.g., /ui/my-dashboard/1.0.0/index.html) — platform transforms this to /mcp-ui/ at serving time. Using /mcp-ui/ directly in the connector will break.',
        'Plugin HTML files must be in ui-dist/{pluginId}/ inside the connector mcp_store — not in a root-level directory',
        'Plugin HTML that depends on mcpProxy calls to render — mobile apps do NOT relay mcpProxy from iframes. Always embed default data in the HTML and render immediately. Try live MCP calls silently in the background. See GET /spec/examples/connector-ui → _mobile_compatibility.',
        'Building custom proxy endpoints to serve plugins or call connector tools — the platform provides /mcp-ui/ serving and /api/connectors/:id/call out of the box',
        'Manually remapping skill IDs after deploy — ID remapping is now automatic. The deploy pipeline deep-replaces original IDs with internal dom_xxx IDs in grants, handoffs, routing, and security_contracts.',
        'Setting voice.verification.method to "security_question" but omitting securityQuestion.question or securityQuestion.answer → validation error',
        'Setting voice.verification.method to "custom_skill" but using a skillSlug not in the solution → validation warning',
        'Forgetting to add routing.voice when voice.enabled is true → validation warning',
        'Using voice.knownPhones without E.164 format — always include "+" country code (e.g., "+14155551234")',
        'Trying to manually wire handoff.transfer as a connector tool — use sys.handoffToSkill instead, it is a built-in platform tool always available to every skill. No connectors list, no mcp_bridge needed. Add sys.handoffToSkill to the skill\'s bootstrap_tools to pin it for the planner.',
        'Expecting tools to fail at runtime when grants are missing — since platform v1.4, denied tools are completely hidden from the LLM planner. The LLM cannot see, select, or attempt to use them. Design your skill knowing that grant-protected tools will appear/disappear dynamically as grants are acquired.',
        'Trying to create @adas/plugin-sdk, PluginHost, PluginLoader, or plugin navigation — the mobile host app (ateam-mobile) already provides ALL of this infrastructure. Your job is ONLY to create plugin source (rn-src/), build bundles (rn-bundle/), and deploy. The host app downloads and renders your bundles automatically.',
      ],
      key_concepts: {
        skill_roles: 'gateway = entry point (identity/routing), worker = does the work, orchestrator = coordinates multiple workers, approval = authorizes actions',
        grant_lifecycle: '1. Skill calls tool → 2. grant_mapping extracts value from result → 3. Grant stored in conversation → 4. On handoff, grants_passed propagate → 5. Target skill access_policy checks grants — denied tools are HIDDEN from the LLM (it cannot see or select them), constrained tools remain visible with modified args/response → 6. When grants are acquired, hidden tools become visible on the next iteration → 7. Grants expire after ttl_seconds',
        handoff_mechanisms: '"handoff-controller-mcp" = live conversation transfer. The skill calls sys.handoffToSkill(to_skill, grants) — a built-in platform tool, no connector wiring needed. Platform auto-injects channel context and creates a routing session. Subsequent messages are routed to the target skill. "internal-message" = async skill-to-skill (background coordination, no user redirect).',
        multi_agent_routing: 'For multi-skill solutions (3+ skills): sys.findCapability(query) discovers which skill handles a request (zero LLM cost). sys.askSkill(to_skill, message) queries another skill and waits for the answer (non-terminal). sys.listSkills() lists all skills with their intents and tools. sys.handoffToSkill(to_skill) transfers the conversation entirely (terminal). Single-skill solutions should exclude these tools via exclude_bootstrap_tools.',
        security_contracts: 'Cross-skill agreements: "skill X cannot use tools Y and Z unless skill W has issued grants A and B". Enforced at the solution level.',
        voice_channel: 'Optional voice channel configuration. Enables phone/web voice interactions for the solution. Supports caller verification (phone lookup, security question, or custom skill), persona customization, and per-skill voice overrides. On deploy, voice settings are automatically pushed to the voice backend — no manual voice setup needed.',
        ui_plugins: {
          overview: 'UI plugins are interactive dashboards served by ui_capable connectors. They communicate with connector tools and become part of the solution\'s conversational experience.',
          modes: {
            iframe: 'Web-only. HTML+JavaScript in ui-dist/{pluginId}/index.html. Uses postMessage protocol to call connector tools. Served at /mcp-ui/{tenant}/{connectorId}/...',
            react_native: 'Mobile-only. React Native component exported as a plain object with id and Component fields. Uses useApi(bridge).call() hook to invoke connector tools. Compiled into ateam-mobile app.',
            adaptive: 'Both platforms. Declare both iframe and react-native configs. Platform routes automatically based on client platform.',
          },
          capabilities: 'declare.capabilities for native features (haptics, camera, location, storage, notifications). Web-based iframes ignore native capabilities.',
          commands: 'plugins can define commands[] which become virtual tools visible to the AI planner. Example: { name: "highlight_order", description: "Highlight order in dashboard", input_schema: {...} } becomes tool ui.plugin-id.highlight_order that the planner can call.',
          deployment: 'Plugin files must be in connector mcp_store under ui-dist/{pluginId}/index.html. Platform serves at /mcp-ui/{tenant}/{connectorId}/{iframeUrl}.',
          protocol_web: 'postMessage protocol (web/iframe only). Plugin sends: { source: "adas-plugin", pluginId: "...", message: { type: "tool.call", toolName: "...", args: {...}, correlationId: "..." } }. Receives: { source: "adas-host", message: { type: "tool.response", payload: { correlationId: "...", result: {...} } } }',
          protocol_mobile: 'Plugin SDK protocol (React Native). Use const api = useApi(bridge); await api.call(toolName, args). Result is auto-unwrapped. Errors throw exceptions. 15-second timeout.',
          focus: 'Use sys.focusUiPlugin(plugin_id, args?) to bring a plugin into user focus. AI planner can call this system tool to show the UI at key moments in the conversation.',
          validation: 'See docs/UI_PLUGIN_MANIFEST_SCHEMA.md for complete validation rules, error messages, and examples. Use GET /spec/solution.ui_plugins_manifest_validation_schema for programmatic validation.',
        },
      },
    },
  };
}

/**
 * Mobile Connector specification
 * Enables AI agents to build functional connectors (background services) for mobile-pa
 */
function buildMobileConnectorSpec() {
  return {
    service: '@adas/mobile-connector-builder',
    version: '1.0.0',
    description: 'Build functional connectors (background services) for the mobile-pa solution. Connectors run in ateam-mobile app at runtime and access device capabilities via the Native Bridge SDK.',

    overview: {
      what_is_a_connector: 'A pure JavaScript module that runs in ateam-mobile app. Zero React Native, zero native modules. Uses ONLY bridge.* APIs to access device capabilities (calendar, location, contacts, battery, network, notifications, sms, maps, http, storage, permissions, device, log).',
      when_to_build: 'Build when mobile-pa needs a background service that collects device data, syncs to cloud, polls for actions, or manages device state independently of UI.',
      examples: 'device-bridge (collect & sync), battery-monitor, connectivity-tracker, notification-processor',
      execution_model: 'Pure JavaScript in sandboxed scope — connector only sees bridge + config, no access to React Native or globals',
    },

    connector_interface: {
      description: 'Every connector must export this interface',
      required_fields: ['id', 'name', 'version', 'onStart'],
      optional_hooks: ['onSync', 'onForeground', 'onAction', 'onStop'],
    },

    bridge_apis: {
      description: '13 namespaces for device capabilities. All async, pure JS.',
      available: ['calendar', 'contacts', 'location', 'battery', 'network', 'notifications', 'sms', 'maps', 'http', 'storage', 'permissions', 'device', 'log'],
      details: 'See MOBILE_CONNECTOR_DEVELOPER_GUIDE.md for complete API reference with examples',
    },

    declaration: {
      description: 'Declare connector in mobile-pa solution.json',
      example_fields: {
        id: 'device-bridge',
        type: 'service',
        package: '@mobile-pa/device-bridge',
        capabilities: ['calendar', 'contacts', 'location', 'battery', 'connectivity', 'notifications'],
        config_keys: ['relay_url', 'device_id', 'api_key'],
        sync_interval: 60000,
      },
    },

    build_deploy_cycle: {
      step_1: 'Build: npm run build:connector — compile to dist/connector.js',
      step_2: 'Publish: npm publish — push @mobile-pa/your-connector to npm',
      step_3: 'Declare: Add to solution.json functional_connectors[]',
      step_4: 'Deploy: Solution deploy triggers Builder API endpoint',
      step_5: 'Load: Mobile app discovers connectors, loads at runtime',
    },

    references: {
      public_guide: 'MOBILE_CONNECTOR_DEVELOPER_GUIDE.md — Quick start for AI agents (573 lines)',
      full_spec: 'mobile/NATIVE_BRIDGE_SDK_SPEC.md — Complete specification (936 lines)',
      working_example: 'mobile/packages/device-bridge/src/dynamic-connector.ts — Real connector (412 lines)',
      bridge_types: 'ateam-mobile/src/bridge/types.ts — TypeScript interfaces',
      runtime: 'ateam-mobile/src/runtime/connector-runtime.ts — Sandbox and execution',
    },

    learning_path: [
      '1. Read this spec (/spec/mobile-connector)',
      '2. Read MOBILE_CONNECTOR_DEVELOPER_GUIDE.md for quick reference and patterns',
      '3. Study mobile/packages/device-bridge/src/dynamic-connector.ts for working example',
      '4. Build your connector using bridge.* APIs only',
      '5. Test with mobile app on device (or simulator)',
      '6. Declare in solution.json and deploy',
    ],
  };
}

/**
 * UI Plugins specification
 * Complete guide for building interactive UI plugins for web (iframe) and mobile (React Native).
 */
function buildUIPluginsSpec() {
  return {
    service: '@adas/ui-plugins',
    version: '1.0.0',
    description: 'Build interactive UI plugins for A-Team solutions. Plugins are visual dashboards that skills can present to users. Supports web (iframe), mobile (React Native), or both (adaptive mode).',

    overview: {
      what_is_a_plugin: 'A UI plugin is an interactive dashboard served by a ui_capable connector. It communicates with connector MCP tools and becomes part of the solution\'s conversational experience. Skills present plugins via sys.focusUiPlugin().',
      render_modes: {
        iframe: 'Web-only. HTML+JavaScript served from connector\'s ui-dist/ folder. Uses postMessage protocol to call MCP tools.',
        'react-native': 'Mobile-only. React Native component bundled as a downloadable .js file. Uses plain object default export with id and Component fields, plus useApi() hook. Renders natively in ateam-mobile app.',
        adaptive: 'Both platforms. Connector declares BOTH iframe and react-native configs. Platform auto-selects based on client: web gets iframe, mobile gets native RN component.',
      },
      unified_api: 'Both web and RN plugins use the SAME backend APIs. Skills request plugins via sys.focusUiPlugin() without caring which render mode — the platform handles routing automatically.',
    },

    manifest_schema: {
      description: 'Plugin manifest returned by connector\'s ui.getPlugin tool. This is what the platform reads to discover and load plugins.',
      fields: {
        id: { type: 'string', required: true, description: 'Unique plugin identifier. Format: "mcp:<connector-id>:<plugin-name>"' },
        name: { type: 'string', required: true, description: 'Display name (1-100 characters)' },
        version: { type: 'string', required: true, description: 'Semantic version (X.Y.Z)' },
        description: { type: 'string', required: false, description: 'Brief description (1-500 characters)' },
        type: {
          type: 'enum', required: false,
          values: ['ui', 'service', 'hybrid'],
          description: '"ui" = visual dashboard, "service" = headless, "hybrid" = both. Default: "ui"',
        },
        render: {
          type: 'object', required: true,
          description: 'Rendering configuration — polymorphic by mode',
          fields: {
            mode: {
              type: 'enum', required: true,
              values: ['iframe', 'react-native', 'adaptive'],
              description: '"iframe" = web-only, "react-native" = mobile-only, "adaptive" = both platforms',
            },
            iframeUrl: {
              type: 'string', required: false,
              description: 'Required for mode="iframe" or "adaptive". Format: "/ui/{pluginId}/index.html". File must exist in connector mcp_store under ui-dist/.',
            },
            component: {
              type: 'string', required: false,
              description: 'Required for mode="react-native" or "adaptive". Plugin identifier — must match the id field in the plugin\'s default export',
            },
            reactNative: {
              type: 'object', required: false,
              description: 'For mode="adaptive" only. React Native configuration.',
              fields: {
                component: { type: 'string', required: true, description: 'Plugin identifier matching the id field in the plugin\'s default export' },
                bundleUrl: { type: 'string', required: false, description: 'Auto-generated by Core during deployment. URL: /api/ui-plugins/{pluginId}/bundle.js' },
              },
            },
          },
        },
        capabilities: {
          type: 'object', required: false,
          description:
            'Native device capabilities this plugin requests (mobile only). ' +
            'All native capabilities ship pre-installed in the ateam-mobile platform app — ' +
            'declaring a flag here gates the JS API access (`native.<cap>.*`). ' +
            'Adding a NEW native capability beyond this list requires a platform mobile-app rebuild ' +
            'and is not a solution-level change.',
          architectural_rule:
            'Every capability below is pre-installed in ateam-mobile via packages/device-bridge. ' +
            'Solutions consume them as plain JS through native.<cap>.*. No solution should ever ' +
            'require mobile rebuild to use any of these. If a solution needs a capability NOT listed, ' +
            'it must be added to the platform first (mobile v2+ release) — never in solution code.',
          fields: {
            haptics:     { type: 'boolean', description: 'Vibration/haptic feedback (selection, impact, notification)' },
            camera:      { type: 'boolean', description: 'Camera access (photo, video, scanBarcode, pickImage)' },
            location:    { type: 'boolean', description: 'GPS/location services (getCurrent, watchPosition)' },
            offline:     { type: 'boolean', description: 'Local storage (KV + sqlite)' },
            biometrics:  { type: 'boolean', description: '[legacy stub — prefer biometricsV2]' },
            biometricsV2:{ type: 'boolean', description: 'Face ID / Touch ID / fingerprint — native.biometricsV2.authenticate({reason})' },
            notifications:{type: 'boolean', description: 'Local + push notifications' },
            fileSystem:  { type: 'boolean', description: 'Document picker + read/write' },
            cookies:     { type: 'boolean', description: 'Read/clear platform cookie jar — used by login-webview flows (see browser-mcp:login-webview plugin). native.cookies.get(url) returns HttpOnly cookies too.' },
            webview:     { type: 'boolean', description: 'Plugin renders a native WebView component (react-native-webview). Typically paired with cookies for login flows.' },
            sharing:     { type: 'boolean', description: 'Native share sheet — native.sharing.shareFile(uri). Hand content off to any installed app (Mail, Messages, Files, etc.)' },
            scanner:     { type: 'boolean', description: 'QR / barcode scanner — camera-based. native.scanner.requestPermissions() then plugin mounts BarCodeScanner component.' },
            nfc:         { type: 'boolean', description: 'NFC tag read — native.nfc.readOnce(timeoutMs). iOS requires entitlement in app provisioning, Android requires NFC permission. Use for physical-world triggers, pairing, loyalty cards.' },
          },
          failure_mode_when_undeclared:
            'Calling native.<cap>.* without declaring the capability flag logs a warning and returns silently. Plugins MUST declare every capability they use.',
        },
        commands: {
          type: 'array', required: false,
          description: 'Commands the plugin handles. Each becomes a virtual tool: ui.{short_id}.{command_name}',
          item_schema: {
            name: { type: 'string', required: true, description: 'Command identifier (lowercase_underscore)' },
            description: { type: 'string', required: true, description: 'What this command does' },
            input_schema: { type: 'object', required: false, description: 'JSON Schema for command arguments' },
          },
        },
      },
    },

    react_native_plugin_guide: {
      description: 'Complete guide for building React Native UI plugins that render natively in ateam-mobile.',

      scope_of_responsibility: {
        summary: 'IMPORTANT: You (the solution builder) create plugin SOURCE CODE and BUNDLES only. The mobile host app (ateam-mobile) already provides the full runtime infrastructure — plugin SDK, loader, bridge, navigation. Do NOT build any host-side components.',
        what_you_build: [
          'connectors/<id>/rn-src/index.tsx — your plugin component',
          'connectors/<id>/esbuild.config.mjs — build config',
          'connectors/<id>/package.json — with build:rn script',
          'Build output: connectors/<id>/rn-bundle/index.bundle.js',
        ],
        what_the_host_app_already_provides: [
          '@adas/plugin-sdk — useApi() hook, PluginProps types, bridge protocol. Provided at runtime via require() shim — do NOT create this package.',
          'PluginLoader — downloads bundles from Core API, evaluates them, renders in WebView with injected bridge JS',
          'usePluginBridge — full postMessage bridge: MCP call proxying, plugin command routing, init handshake',
          'useRemotePluginBundles — fetches /api/ui-plugins/{id}/bundle.js, caches locally for 7 days',
          'Dynamic tab navigation — auto-creates tabs from plugin manifest (Chat tab + one tab per plugin)',
        ],
        do_NOT_build: [
          '@adas/plugin-sdk as a local or npm package',
          'PluginHost or PluginLoader component',
          'Navigation between chat and plugin screens',
          'Any modifications to the ateam-mobile source code',
        ],
      },

      plugin_sdk: {
        description: 'The Plugin SDK provides API calls, theme tokens, and RN primitives. Plugins import useApi from @adas/plugin-sdk and export a plain object as default. NOTE: @adas/plugin-sdk is provided by the mobile host app at runtime — do NOT create it yourself.',
        export_pattern: 'export default { id: "my-plugin", type: "ui", version: "1.0.0", Component: MyComponent } — plain object, no registration call needed.',
        api_calls: 'const api = useApi(bridge); const result = await api.call("toolName", { args }). 15-second timeout, auto-unwrapped results.',
        available_exports: [
          'useApi — hook for calling connector MCP tools',
          'View, Text, ScrollView, FlatList, Pressable, TouchableOpacity, TextInput, Image, ActivityIndicator, Modal, Switch, StyleSheet, Animated, Platform, RefreshControl — RN primitives',
          'Card, Badge, TabBar, ListItem, SearchBar, EmptyState, ErrorState, LoadingState, ActionButton — pre-built UI components',
        ],
        props: {
          bridge: 'Communication bridge to host app — pass to useApi()',
          native: 'Native capabilities object — native.haptics.selection(), native.haptics.impact("medium")',
          theme: 'Theme tokens from host — { colors: { background, surface, text, ... }, spacing, borderRadius, ... }',
        },
      },

      component_template: `import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useApi } from '@adas/plugin-sdk';

function MyDashboard({ bridge, native, theme }) {
  const api = useApi(bridge);
  const [data, setData] = useState([]);

  useEffect(() => {
    api.call('myConnector.listItems', {}).then(setData);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList data={data} renderItem={({ item }) => (
        <Text style={{ color: theme.colors.text }}>{item.name}</Text>
      )} />
    </View>
  );
}

export default {
  id: 'my-dashboard',
  type: 'ui',
  version: '1.0.0',
  capabilities: { haptics: true },
  Component: MyDashboard,
};`,

      bundle_build_pipeline: {
        description: 'How to build and deploy React Native plugin bundles. The mobile app downloads compiled bundles from Core API.',
        overview: [
          '1. Write your RN component in rn-src/index.tsx (in the connector directory)',
          '2. Add esbuild config to compile it to rn-bundle/index.bundle.js (CommonJS format)',
          '3. Add "build" script to package.json',
          '4. Deploy via ateam_build_and_run — Core auto-runs npm install + npm run build',
          '5. Core serves the bundle at /api/ui-plugins/{pluginId}/bundle.js',
          '6. Mobile app downloads, caches (7-day TTL), and renders natively',
        ],

        esbuild_config: {
          description: 'Create esbuild.config.mjs in your connector directory:',
          file: `import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['rn-src/index.tsx'],
  bundle: true,
  outfile: 'rn-bundle/index.bundle.js',
  format: 'cjs',
  platform: 'neutral',
  target: 'es2015',
  external: ['react', 'react-native', '@adas/plugin-sdk'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  minify: false,
});`,
          critical_rules: [
            'target MUST be "es2015" — mobile runtime evaluates bundles via new Function() which CANNOT handle async/await syntax. es2015 downlevels async/await to generators. The deploy validator rejects bundles containing async/await.',
            'format MUST be "cjs" (CommonJS) — mobile app evaluates via module.exports',
            'external MUST include react, react-native, @adas/plugin-sdk — host app provides these at runtime',
            'jsx MUST be "transform" with classic React.createElement — most compatible with mobile eval',
            'platform MUST be "neutral" — not node, not browser',
            'outfile MUST be rn-bundle/index.bundle.js — Core serves from this exact path',
          ],
        },

        package_json: {
          description: 'Your connector package.json needs build scripts and esbuild as a dev dependency.',
          example: {
            scripts: {
              build: 'npm run build:rn',
              'build:rn': 'for f in my-panel another-panel; do esbuild rn-src/$f.tsx --bundle --format=cjs --platform=neutral --outfile=rn-bundle/$f.bundle.js --external:react --external:react-native --external:@adas/plugin-sdk --target=es2016; done && esbuild rn-src/index.tsx --bundle --format=cjs --platform=neutral --outfile=rn-bundle/index.bundle.js --external:react --external:react-native --external:@adas/plugin-sdk --target=es2016',
            },
            devDependencies: { esbuild: '^0.27.0' },
          },
          note: 'Core auto-runs "npm install" then "npm run build" during deployment. The build:rn script compiles each panel individually (for per-plugin bundles) plus an index.tsx barrel export (combined bundle). Replace "my-panel another-panel" with your actual panel names.',
        },

        plugin_sdk_note: {
          description: '@adas/plugin-sdk is NOT published on npm. It is provided by the mobile host app at runtime through a require shim. Your esbuild config must declare it as external. The SDK exports useApi (for MCP tool calls) and PluginProps type (for TypeScript). You import it normally in source code — the host app resolves it at runtime.',
        },

        index_tsx_template: {
          description: 'rn-src/index.tsx — barrel export that re-exports all panels. This produces the combined index.bundle.js served by Core.',
          code: `// rn-src/index.tsx — barrel export for all RN plugins
export { default as MyPanel } from './my-panel';
export { default as AnotherPanel } from './another-panel';

// Default export = first panel (used by single-plugin connectors)
export { default } from './my-panel';`,
        },


        connector_manifest: {
          description: 'Your connector\'s ui.getPlugin tool must return the correct render config:',
          iframe_only: '{ render: { mode: "iframe", iframeUrl: "/ui/my-plugin/1.0.0/index.html" } }',
          native_only: '{ render: { mode: "react-native", component: "my-plugin" } }',
          adaptive_both: '{ render: { mode: "adaptive", iframe: { iframeUrl: "/ui/my-plugin/1.0.0/index.html" }, reactNative: { component: "my-plugin" } } }',
          note: 'bundleUrl is auto-generated by Core — do NOT hardcode it in the manifest.',
        },

        mobile_loading_flow: [
          '1. Mobile app fetches plugin list from GET /api/solutions/{id}/ui-plugins',
          '2. Checks pre-bundled registry (instant, <100ms)',
          '3. Falls back to bundleUrl — downloads the .js bundle',
          '4. Caches locally on device (7-day TTL)',
          '5. Evaluates via CommonJS module wrapper',
          '6. Renders the component with { bridge, native, theme } props',
          'Next load: serves from disk cache (<200ms)',
        ],
      },
    },

    iframe_plugin_guide: {
      description: 'Guide for building web-only iframe plugins.',
      protocol: 'postMessage protocol. Plugin sends: { source: "adas-plugin", pluginId, message: { type: "tool.call", toolName, args, correlationId } }. Receives: { source: "adas-host", message: { type: "tool.response", payload: { correlationId, result } } }',
      file_location: 'Place HTML/JS files in connector mcp_store at ui-dist/{pluginId}/index.html',
      serving: 'Core serves at /mcp-ui/{tenant}/{connectorId}/{iframeUrl}',
      see_example: 'GET /spec/examples/ui-plugin-iframe — complete working HTML+JS example',
    },

    deployment: {
      description: 'Deploy plugins as part of your connector via ateam_build_and_run.',
      steps: [
        '1. Include plugin source files in mcp_store (ui-dist/ for iframe, rn-src/ for React Native)',
        '2. Include esbuild.config.mjs and package.json with build script (for RN plugins)',
        '3. Call ateam_build_and_run with mcp_store containing all connector files',
        '4. Core auto-runs npm install + npm run build → produces rn-bundle/index.bundle.js',
        '5. Connector starts → ui.listPlugins returns manifest → Core discovers and registers plugins',
        '6. For iframe: verify asset accessible at /mcp-ui/{tenant}/{connectorId}/...',
        '7. For RN: verify bundle accessible at /api/ui-plugins/{pluginId}/bundle.js',
      ],
      validation: 'System auto-validates plugin manifests on deploy. Errors are returned in the deploy response.',
    },

    examples: {
      iframe: 'GET /spec/examples/ui-plugin-iframe — Complete HTML+JS task board plugin',
      react_native: 'GET /spec/examples/ui-plugin-native — Complete RN plugin with plain object export',
      connector_with_ui: 'GET /spec/examples/connector-ui — Connector that serves UI plugins',
    },

    learning_path: [
      '1. Read this spec (/spec/ui-plugins) for overview and schema',
      '2. Choose render mode: iframe (web-only), react-native (mobile-only), or adaptive (both)',
      '3. Study the relevant example (GET /spec/examples/ui-plugin-iframe or /spec/examples/ui-plugin-native)',
      '4. Build your plugin and connector',
      '5. Deploy via ateam_build_and_run with mcp_store',
      '6. Test: iframe loads in web UI, RN bundle loads in mobile app',
    ],
  };
}

/**
 * Multi-User Connector specification
 * Complete guide for building connectors that isolate data per user (actor).
 */
function buildMultiUserConnectorSpec() {
  return {
    service: '@adas/multi-user-connector',
    version: '1.0.0',
    description: 'Build connectors that isolate data per user (actor). A-Team is multi-tenant AND multi-user — multiple users share the same tenant. Any connector that stores, retrieves, or manages per-user data MUST scope it by actor ID.',

    overview: {
      problem: 'A-Team solutions serve multiple users within a tenant. Without actor scoping, User A sees User B\'s memories, preferences, and private data. Every stateful connector must isolate data per actor.',
      how_it_works: 'A-Team Core automatically propagates the current user\'s identity (actor ID) to connectors. The mechanism differs by transport: HTTP connectors receive it as a request header, stdio connectors receive it as an injected tool argument. The connector reads the actor ID and scopes all data operations accordingly.',
      actor_identity: {
        what_is_actor_id: 'A unique identifier for each user within a tenant. Format: opaque string (e.g., "user_abc123"). Assigned by A-Team Core during authentication.',
        what_is_tenant: 'The organization/deployment scope. Multiple actors belong to one tenant. Connectors receive both actor_id and tenant_id.',
        propagation: 'Core injects actor context automatically — the LLM never sees or sends actor IDs. The LLM calls tools normally (e.g., memory.store({ type: "fact", content: "..." })), and Core enriches the call with actor identity before it reaches the connector.',
      },
      transport_comparison: {
        http: {
          mechanism: 'HTTP headers injected by Core\'s connectorManager',
          actor_header: 'x-adas-actor',
          tenant_header: 'x-adas-tenant',
          how_to_read: 'Read from request headers or AsyncLocalStorage (ALS) context set by middleware',
        },
        stdio: {
          mechanism: 'Tool arguments injected by Core\'s _callToolStdio()',
          actor_field: '_adas_actor',
          tenant_field: '_adas_tenant',
          how_to_read: 'Read from the tool\'s args object: args._adas_actor',
          critical_gotcha: 'MCP SDK uses zod.safeParse() which STRIPS unknown fields. You MUST declare _adas_actor in every tool\'s zod schema or it will be silently dropped.',
        },
      },
    },

    stdio_connector_guide: {
      description: 'Complete guide for building multi-user stdio MCP connectors (the most common type).',

      step_1_actor_field_pattern: {
        description: 'Define a shared ACTOR_FIELD constant and a helper function. Spread ACTOR_FIELD into every tool\'s zod schema.',
        code: `import { z } from "zod";

// ── Actor context (injected by A-Team Core — invisible to LLM) ──
const ACTOR_FIELD = {
  _adas_actor: z.string().optional().describe("Internal: actor ID injected by Core"),
};

function getActorId(args) {
  return args?._adas_actor || "default";
}`,
        why_default: 'Falling back to "default" ensures the connector works during development/testing when no actor is injected. In production, Core always injects the real actor ID.',
      },

      step_2_declare_in_every_tool: {
        description: 'Every tool that touches per-user data MUST include ...ACTOR_FIELD in its zod schema. This is NOT optional — without it, zod strips the field silently.',
        example: `server.tool(
  "memory.store",
  "Store a memory for the current user",
  {
    type: z.enum(["preference", "fact", "instruction"]).describe("Memory type"),
    content: z.string().describe("The memory content"),
    tags: z.string().optional().describe("Comma-separated tags"),
    ...ACTOR_FIELD,  // ← CRITICAL: without this, _adas_actor is stripped by zod
  },
  async (args) => {
    const actorId = getActorId(args);
    // Use actorId to scope the INSERT
    db.prepare("INSERT INTO memories (id, actor_id, type, content, tags) VALUES (?, ?, ?, ?, ?)")
      .run(generateId(), actorId, args.type, args.content, args.tags || "");
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  }
);`,
        critical_warning: 'If you forget ...ACTOR_FIELD on even ONE tool, that tool will not receive the actor ID and will fall back to "default", causing data leakage between users.',
      },

      step_3_scope_all_queries: {
        description: 'Every SQL query (or data operation) must include actor_id in WHERE clauses.',
        examples: {
          insert: 'INSERT INTO memories (id, actor_id, type, content) VALUES (@id, @actor_id, @type, @content)',
          select: 'SELECT * FROM memories WHERE actor_id = @actor_id ORDER BY updated_at DESC LIMIT @limit',
          update: 'UPDATE memories SET content = @content WHERE id = @id AND actor_id = @actor_id',
          delete: 'DELETE FROM memories WHERE id = @id AND actor_id = @actor_id',
          count: 'SELECT COUNT(*) as count FROM memories WHERE actor_id = @actor_id',
          search: 'SELECT * FROM memories WHERE actor_id = @actor_id AND content LIKE @query',
        },
        rule: 'NEVER query without actor_id in the WHERE clause. Even admin/list operations must be actor-scoped unless explicitly designed as tenant-wide.',
      },

      step_4_database_schema: {
        description: 'Add actor_id column to every table that holds per-user data.',
        create_table: `CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL DEFAULT 'default',
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '',
  context TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast per-actor queries
CREATE INDEX IF NOT EXISTS idx_memories_actor ON memories(actor_id);
CREATE INDEX IF NOT EXISTS idx_memories_actor_type ON memories(actor_id, type);`,
        migration: {
          description: 'For existing databases that need the actor_id column added:',
          code: `// Safe migration — adds column if not exists, backfills with 'default'
try {
  db.prepare("SELECT actor_id FROM memories LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE memories ADD COLUMN actor_id TEXT NOT NULL DEFAULT 'default'").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_actor ON memories(actor_id)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_actor_type ON memories(actor_id, type)").run();
}`,
          note: 'Existing rows get actor_id="default" and won\'t appear for real authenticated users. This is intentional — test data stays isolated.',
        },
      },
    },

    http_connector_guide: {
      description: 'Guide for multi-user HTTP connectors. Less common but used for connectors that need to serve web requests directly.',
      mechanism: 'Core\'s connectorManager injects x-adas-actor and x-adas-tenant as HTTP headers on every request to the connector.',
      reading_actor: {
        from_header: 'const actorId = req.headers["x-adas-actor"] || "default";',
        from_als: 'If using AsyncLocalStorage middleware: const actorId = getCurrentActorId();',
      },
      note: 'HTTP connectors do NOT have the zod stripping issue — headers flow outside the tool schema. But you still MUST scope all data operations by actor ID.',
    },

    complete_example: {
      description: 'Minimal but complete multi-user stdio connector example — a per-user note store.',
      code: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { z } from "zod";

// ── Actor context ──
const ACTOR_FIELD = {
  _adas_actor: z.string().optional().describe("Internal: actor ID injected by Core"),
};
function getActorId(args) {
  return args?._adas_actor || "default";
}

// ── Database ──
const DATA_DIR = process.env.DATA_DIR || ".";
const db = new Database(\`\${DATA_DIR}/notes.db\`);
db.pragma("journal_mode = WAL");

db.exec(\`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notes_actor ON notes(actor_id);
\`);

// ── MCP Server ──
const server = new McpServer({ name: "notes-mcp", version: "1.0.0" });

server.tool(
  "notes.add",
  "Add a new note",
  {
    title: z.string().describe("Note title"),
    body: z.string().optional().describe("Note body"),
    ...ACTOR_FIELD,
  },
  async (args) => {
    const actorId = getActorId(args);
    const id = randomUUID();
    db.prepare("INSERT INTO notes (id, actor_id, title, body) VALUES (?, ?, ?, ?)")
      .run(id, actorId, args.title, args.body || "");
    return { content: [{ type: "text", text: JSON.stringify({ id, title: args.title }) }] };
  }
);

server.tool(
  "notes.list",
  "List all notes for the current user",
  {
    limit: z.number().optional().default(20).describe("Max notes to return"),
    ...ACTOR_FIELD,
  },
  async (args) => {
    const actorId = getActorId(args);
    const notes = db.prepare(
      "SELECT * FROM notes WHERE actor_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(actorId, args.limit);
    return { content: [{ type: "text", text: JSON.stringify({ notes, total: notes.length }) }] };
  }
);

server.tool(
  "notes.delete",
  "Delete a note by ID",
  {
    id: z.string().describe("Note ID to delete"),
    ...ACTOR_FIELD,
  },
  async (args) => {
    const actorId = getActorId(args);
    const result = db.prepare("DELETE FROM notes WHERE id = ? AND actor_id = ?")
      .run(args.id, actorId);
    return { content: [{ type: "text", text: JSON.stringify({ deleted: result.changes > 0 }) }] };
  }
);

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);`,
    },

    common_mistakes: [
      {
        mistake: 'Forgetting ...ACTOR_FIELD in one tool\'s zod schema',
        consequence: '_adas_actor silently stripped → tool uses "default" actor → data shared across all users',
        fix: 'Add ...ACTOR_FIELD to EVERY tool schema. Use grep to verify: every server.tool() call should have ...ACTOR_FIELD.',
      },
      {
        mistake: 'Not including actor_id in WHERE clause for UPDATE/DELETE',
        consequence: 'User A can modify/delete User B\'s data if they guess the ID',
        fix: 'Always include "AND actor_id = @actor_id" in UPDATE and DELETE queries.',
      },
      {
        mistake: 'Using a global in-memory cache without actor scoping',
        consequence: 'Cached data from one user leaks to another',
        fix: 'Key all caches by actor_id: cache[actorId] = { ... }',
      },
      {
        mistake: 'Hardcoding actor_id instead of reading from args',
        consequence: 'All users share the same data',
        fix: 'Always use getActorId(args) — never hardcode.',
      },
      {
        mistake: 'Assuming _adas_actor is always present',
        consequence: 'Crashes when running in test/dev without Core injection',
        fix: 'Default to "default": args?._adas_actor || "default"',
      },
    ],

    testing: {
      with_ateam_test_skill: {
        description: 'ateam_test_skill uses isolated test databases. To verify multi-user isolation, test with two different messages that simulate different actors.',
        note: 'ateam_test_skill injects a test actor ID automatically. Your connector will receive _adas_actor in args if the schema declares it.',
      },
      manual_testing: {
        description: 'For local development, you can simulate actor injection by passing _adas_actor directly:',
        example: '{ "tool": "notes.list", "args": { "limit": 10, "_adas_actor": "test-user-1" } }',
      },
    },

    checklist: [
      '☐ ACTOR_FIELD constant defined with z.string().optional()',
      '☐ getActorId() helper function returns args._adas_actor || "default"',
      '☐ ...ACTOR_FIELD spread into EVERY tool\'s zod schema',
      '☐ actor_id column added to ALL per-user tables (NOT NULL DEFAULT "default")',
      '☐ Index on actor_id column for query performance',
      '☐ Every SELECT includes WHERE actor_id = ?',
      '☐ Every UPDATE includes WHERE ... AND actor_id = ?',
      '☐ Every DELETE includes WHERE ... AND actor_id = ?',
      '☐ Every INSERT includes actor_id value from getActorId()',
      '☐ Migration logic for existing databases (ALTER TABLE + backfill)',
      '☐ Tested with ateam_test_skill to verify tool execution',
    ],

    learning_path: [
      '1. Read this spec (/spec/multi-user-connector) for the full pattern',
      '2. Understand the zod stripping gotcha — this is the #1 source of bugs',
      '3. Copy the ACTOR_FIELD + getActorId() pattern into your connector',
      '4. Add actor_id column to your database schema',
      '5. Scope every query by actor_id',
      '6. Test with ateam_test_skill',
      '7. Deploy via ateam_github_patch + ateam_build_and_run(github: true)',
    ],
  };
}
