import express from "express";
import cors from "cors";

import chatRouter from "./routes/chat.js";
import projectsRouter from "./routes/projects.js";
import mockRouter from "./routes/mock.js";
import exportRouter from "./routes/export.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

  res.json({
    ok: true,
    service: "adas_mcp_toolbox_builder-backend",
    llmProvider: provider,
    hasApiKey
  });
});

// Routes
app.use("/api/projects", projectsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/mock", mockRouter);
app.use("/api/export", exportRouter);

// Error handler
app.use((err, req, res, _next) => {
  log.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(port, "0.0.0.0", () => {
  log.info(`Backend listening on http://0.0.0.0:${port}`);
  log.info(`LLM Provider: ${process.env.LLM_PROVIDER || "anthropic"}`);
  log.info(`Memory Path: ${process.env.MEMORY_PATH || "/memory"}`);
});
