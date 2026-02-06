import express from "express";
import cors from "cors";
import multer from "multer";

import chatRouter from "./routes/chat.js";
import templatesRouter from "./routes/templates.js";
import mockRouter from "./routes/mock.js";
import exportRouter from "./routes/export.js";
import validateRouter from "./routes/validate.js";
import connectorsRouter from "./routes/connectors.js";
import actorsRouter from "./routes/actors.js";
import tenantRouter from "./routes/tenant.js";
import importRouter from "./routes/import.js";
import solutionsRouter from "./routes/solutions.js";
import { attachTenant } from "./middleware/attachTenant.js";
import { isSearchAvailable } from "./services/webSearch.js";
import mcpManager from "./services/mcpConnector.js";
import connectorState from "./store/connectorState.js";

const app = express();

app.use(cors({
  exposedHeaders: ["X-ADAS-TENANT"],
  allowedHeaders: ["Content-Type", "X-ADAS-TENANT"],
}));
app.use(express.json({ limit: "10mb" }));

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
  const provider = process.env.LLM_PROVIDER || "anthropic";
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
app.use("/api/solutions", solutionsRouter);

// Error handler
app.use((err, req, res, _next) => {
  log.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(port, "0.0.0.0", () => {
  log.info(`Backend listening on http://0.0.0.0:${port}`);
  log.info(`LLM Provider: ${process.env.LLM_PROVIDER || "anthropic"}`);
  log.info(`Memory Path: ${process.env.MEMORY_PATH || "/memory"}`);
  log.info(`Tenant: ${process.env.SB_TENANT || "main"}`);

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
});
