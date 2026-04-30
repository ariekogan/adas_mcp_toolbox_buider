import express from "express";
import cors from "cors";
import multer from "multer";
import { fork } from "child_process";
import path from "path";

import chatRouter from "./routes/chat.js";
import templatesRouter from "./routes/templates.js";
import mockRouter from "./routes/mock.js";
import exportRouter from "./routes/export.js";
import validateRouter from "./routes/validate.js";
import connectorsRouter from "./routes/connectors.js";
import actorsRouter from "./routes/actors.js";
import tenantRouter from "./routes/tenant.js";
import importRouter from "./routes/import.js";
import deployRouter from "./routes/deploy.js";
import solutionsRouter from "./routes/solutions.js";
import agentApiRouter from "./routes/agentApi.js";
import settingsRouter from "./routes/settings.js";
import gitsyncRouter from "./routes/gitsync.js";
import { attachTenant } from "./middleware/attachTenant.js";
import { isSearchAvailable } from "./services/webSearch.js";
import { warmCoreSettings } from "./services/llm/adapter.js";
import mcpManager from "./services/mcpConnector.js";
import connectorState from "./store/connectorState.js";
import { registerImportedConnector } from "./routes/connectors.js";
import { syncAllTenantsFromGitHub, getDriftLog, getLastSyncAt } from "./services/gitSyncBootstrap.js";
import { describeGitSyncState } from "./services/gitSync.js";
import { refreshTenantCache } from "./utils/tenantContext.js";

const app = express();

// CORS allowlist (round 019 H1). CORS_ALLOWED_ORIGINS env =
// comma-separated origins (e.g. "https://builder.ateam-ai.com,http://localhost:3312").
// Unset OR "*" preserves the old wildcard behavior for backcompat with dev.
// Same pattern as Core round 008 #26 and admin-backend round 018.
const CORS_ALLOWED_LIST = String(process.env.CORS_ALLOWED_ORIGINS || "*")
  .split(",").map(s => s.trim()).filter(Boolean);
const CORS_ALLOW_ANY = CORS_ALLOWED_LIST.includes("*");

app.use(cors({
  origin: (origin, cb) => {
    if (CORS_ALLOW_ANY) return cb(null, true);
    if (!origin) return cb(null, true); // same-origin / curl / server-to-server
    if (CORS_ALLOWED_LIST.includes(origin)) return cb(null, true);
    return cb(null, false); // browser will block; no ACAO header sent
  },
  exposedHeaders: ["X-ADAS-TENANT"],
  allowedHeaders: ["Content-Type", "X-ADAS-TENANT", "Authorization"],
}));
app.use(express.json({ limit: "10mb" }));

// In-memory rate limit (round 019 H2). Sliding window per IP.
// Backed by a Map; fail-open on store errors. Same shape as Core round 006.
const _rlStore = new Map();
function rateLimit({ key, windowMs, max }) {
  return (req, res, next) => {
    try {
      const ip = req.headers["cf-connecting-ip"]
        || (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
        || req.ip
        || req.socket?.remoteAddress
        || "unknown";
      const fullKey = `${key}:${ip}`;
      const now = Date.now();
      const cutoff = now - windowMs;
      const arr = (_rlStore.get(fullKey) || []).filter(t => t >= cutoff);
      if (arr.length >= max) {
        res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
        return res.status(429).json({
          ok: false,
          error: "Too many requests",
          retryAfterSeconds: Math.ceil(windowMs / 1000),
        });
      }
      arr.push(now);
      _rlStore.set(fullKey, arr);
      res.setHeader("X-RateLimit-Remaining", String(max - arr.length));
      next();
    } catch (err) {
      console.error(`[rateLimit:${key}] check failed:`, err.message);
      next(); // fail-open
    }
  };
}

// Multi-Tenant: Attach tenant from X-ADAS-TENANT header
app.use(attachTenant);

// Configure multer for file uploads (text files only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.txt', '.csv', '.json', '.md', '.eml', '.log'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only text-based files are allowed (.txt, .csv, .json, .md, .eml, .log)'));
    }
  }
});
app.locals.upload = upload;

const port = Number(process.env.PORT || 4000);
const logLevel = process.env.LOG_LEVEL || "info";

// Simple logger
const log = {
  debug: (...args) => logLevel === "debug" && console.log("[DEBUG]", ...args),
  info: (...args) => ["debug", "info"].includes(logLevel) && console.log("[INFO]", ...args),
  warn: (...args) => ["debug", "info", "warn"].includes(logLevel) && console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
};

// Make logger available to routes
app.locals.log = log;

// Health check
app.get("/api/health", (_req, res) => {
  const provider = process.env.LLM_PROVIDER || "openai";
  const hasApiKey = provider === "anthropic"
    ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.OPENAI_API_KEY;
  const searchProvider = process.env.SEARCH_PROVIDER || "duckduckgo";

  res.json({
    ok: true,
    service: "adas_mcp_toolbox_builder-backend",
    llmProvider: provider,
    hasApiKey,
    webSearch: {
      available: isSearchAvailable(),
      provider: searchProvider
    }
  });
});

// gitSync diagnostic — current write-coupling mode + GH reachability + last
// boot-sync per tenant + per-tenant drift counts. Operator-facing (no auth
// guard required since it leaks no tenant data, only counts and modes).
//
// describeGitSyncState() lives on the runtime gitSync module; getDriftLog()
// + getLastSyncAt() come from gitSyncBootstrap. Combined response gives a
// single-call diagnostic for "is gitSync working in this deployment?"
app.get("/api/health/gitsync", async (_req, res) => {
  let state;
  try {
    state = describeGitSyncState();
  } catch (err) {
    // describeGitSyncState calls getCurrentTenantOrNull which is safe outside
    // ALS. Anything else throwing here is unexpected — surface it but keep
    // returning the rest.
    state = { error: err.message };
  }
  const driftLog = getDriftLog();
  const tenantSummary = {};
  for (const [tenant, entry] of Object.entries(driftLog)) {
    tenantSummary[tenant] = {
      last_sync_at: getLastSyncAt(tenant),
      drifts: (entry.drifts || []).reduce((acc, d) => acc + (Array.isArray(d.drifts) ? d.drifts.length : 0), 0),
      actions: entry.actions || {},
    };
  }
  // GH read cache stats — hit rate is the leading indicator of whether
  // we're going to hit the 5000/hour rate limit again.
  let readCache = null;
  try {
    const ghMod = await import('@adas/skill-validator/src/services/githubService.js');
    if (typeof ghMod.getReadCacheStats === 'function') readCache = ghMod.getReadCacheStats();
  } catch { /* older validator without cache stats */ }
  res.json({
    ok: true,
    gitsync: state,
    boot_sync: {
      tenants_synced: Object.keys(tenantSummary).length,
      per_tenant: tenantSummary,
    },
    ...(readCache && { gh_read_cache: readCache }),
  });
});

// Tenant list proxy — forwards to ADAS Core for the frontend tenant selector
const ADAS_CORE_URL = process.env.ADAS_CORE_URL || process.env.ADAS_API_URL || "http://ai-dev-assistant-backend-1:4000";
app.get("/api/tenants/list", async (req, res) => {
  // If no auth, return empty tenant list (frontend will show login screen)
  if (!req.auth) {
    return res.json({ ok: true, tenants: [] });
  }
  try {
    // Forward Authorization header so Core can scope to user's tenants
    const proxyHeaders = {};
    if (req.headers.authorization) {
      proxyHeaders['Authorization'] = req.headers.authorization;
    }
    const upstream = await fetch(`${ADAS_CORE_URL}/api/tenants/list`, { headers: proxyHeaders });
    const json = await upstream.json();
    res.json(json);
  } catch (err) {
    // Fallback: return cached tenants from tenantContext
    const { getValidTenants } = await import("./utils/tenantContext.js");
    res.json({ ok: true, tenants: getValidTenants().map(id => ({ id, name: id })) });
  }
});

// Auth guard: require JWT or PAT for all API routes (except health + tenant list above)
const IS_DEV = process.env.NODE_ENV === "development" || process.env.SB_AUTH_SKIP === "true";
app.use("/api", (req, res, next) => {
  if (IS_DEV) return next(); // Dev mode: allow unauthenticated access (X-ADAS-TENANT fallback)
  if (req.auth) return next(); // Authenticated via JWT or PAT
  res.status(401).json({ ok: false, error: "Authentication required" });
});

// Pre-warm ADAS Core settings cache (async, non-blocking — for LLM key resolution)
app.use("/api", (req, res, next) => { warmCoreSettings().then(next, next); });

// Routes
// Note: skills routes are now mounted under /api/solutions/:solutionId/skills (via solutionsRouter)
app.use("/api/templates", templatesRouter);
app.use("/api/chat", chatRouter);
app.use("/api/mock", mockRouter);
app.use("/api/export", exportRouter);
app.use("/api/validate", validateRouter);
app.use("/api/connectors", connectorsRouter);
app.use("/api/actors", actorsRouter);
app.use("/api/tenant", tenantRouter);
app.use("/api/import", importRouter);
// Deploy is expensive (filesystem writes, Core API calls, ~300s timeout) —
// 5 deploys/10min/IP keeps abuse + path-traversal payload brute-force in check.
app.use("/api/deploy", rateLimit({ key: "deploy", windowMs: 10 * 60 * 1000, max: 5 }), deployRouter);
app.use("/api/solutions", solutionsRouter);
app.use("/api/agent-api", agentApiRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/gitsync", gitsyncRouter);

// Error handler
app.use((err, req, res, _next) => {
  log.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

const server = app.listen(port, "0.0.0.0", () => {
  // Deploy can take 3+ minutes (validation + Core deploy + GitHub push + MCP code upload)
  server.timeout = 300_000;        // 5 min — max time for a request to complete
  server.keepAliveTimeout = 120_000; // 2 min — keep connections alive between requests
  server.headersTimeout = 305_000;  // slightly above timeout to prevent race
  log.info(`Backend listening on http://0.0.0.0:${port} (timeout: 300s)`);
  log.info(`LLM Provider: ${process.env.LLM_PROVIDER || "openai"}`);
  log.info(`Memory Path: ${process.env.MEMORY_PATH || "/memory"}`);
  log.info(`Tenant: ${process.env.SB_TENANT || "main"}`);

  // Start the skill-validator (External Agent API) on port 3200
  const validatorPath = path.resolve('/packages/skill-validator/src/server.js');
  const validatorProc = fork(validatorPath, [], {
    env: { ...process.env, VALIDATOR_PORT: '3200' },
    stdio: 'inherit',
  });
  validatorProc.on('error', (err) => log.error('[Validator] Failed to start:', err.message));
  validatorProc.on('exit', (code) => {
    if (code !== 0) log.warn(`[Validator] Exited with code ${code}`);
  });

  // Auto-reconnect saved connectors (fire-and-forget, non-blocking)
  (async () => {
    try {
      await connectorState.init();
      const connectors = await connectorState.getReconnectableConnectors();

      if (connectors.length === 0) {
        log.info('[Startup] No saved connectors to reconnect');
        return;
      }

      log.info(`[Startup] Reconnecting ${connectors.length} saved connector(s)...`);

      for (const conn of connectors) {
        try {
          log.info(`[Startup] Reconnecting: ${conn.name} (${conn.id})`);
          await mcpManager.connect({
            id: conn.id,
            command: conn.command,
            args: conn.args,
            env: conn.env,
            name: conn.name
          });
          // Also register in imported catalog so getAllPrebuiltConnectors() finds it
          // during skill redeploy (deploySkillToADAS uses this catalog).
          registerImportedConnector(conn.id, {
            name: conn.name,
            transport: 'stdio',
            command: conn.command,
            args: conn.args || [],
            env: conn.env || {},
            category: 'custom',
            layer: 'tenant',
          });
          log.info(`[Startup] Reconnected: ${conn.name} (${conn.id})`);
        } catch (err) {
          log.warn(`[Startup] Failed to reconnect ${conn.id}: ${err.message}`);
          // Don't remove - user may want to retry manually or credentials may need refresh
        }
      }
    } catch (err) {
      log.error('[Startup] Connector reconnection failed:', err.message);
    }
  })();

  // F3 — boot-time GitHub → Builder FS reconciliation (fire-and-forget, non-blocking).
  // See /Users/arie/.claude/plans/peaceful-dazzling-dijkstra.md (PR-2).
  (async () => {
    try {
      // Ensure the tenant cache is populated BEFORE asking gitSync to enumerate tenants.
      // tenantContext starts its own periodic refresh on import, but the first call
      // may not have resolved yet when we hit this block.
      await refreshTenantCache();
      await syncAllTenantsFromGitHub({ log });
    } catch (err) {
      log.error('[Startup] GitSync bootstrap failed:', err.message);
    }
  })();
});
