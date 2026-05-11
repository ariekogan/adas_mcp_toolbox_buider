#!/usr/bin/env node
/**
 * run-strip-regression.mjs
 *
 * Drives a fixed set of conversations against the deployed mobile-pa
 * solution and verifies routing / tools / style match expectations.
 *
 * Used by:
 *   - Phase orchestrator (strip-phase.mjs) before/after every phase
 *   - Ad-hoc validation by hand
 *
 * Usage:
 *   node apps/backend/scripts/run-strip-regression.mjs [options]
 *
 * Options:
 *   --suite <path>         Path to YAML suite (default: docs/strip-regression-suite.yaml)
 *   --solution <id>        Solution id (default: from suite file)
 *   --tenant <id>          Tenant (default: from suite file)
 *   --core-url <url>       Core API base (default: env CORE_URL or http://localhost:4100)
 *   --token <token>        Service token for x-adas-token header (default: env CORE_MCP_SECRET)
 *   --service <name>       Service name for x-adas-service header (default: "regression-suite")
 *   --actor-id <id>        Actor identity for the test calls (default: regression-suite-test)
 *   --out <path>           Where to write the JSON report (default: stdout)
 *   --dry-run              Parse + validate suite only; no API calls
 *   --bail                 Stop on first failure
 *   --tests <names>        Comma-separated test names to run (default: all)
 *
 * Exit codes:
 *   0 — all tests passed (GREEN)
 *   1 — some tests failed (RED)
 *   2 — config/setup error
 *   3 — Core API unreachable
 *
 * Output format (JSON to stdout or --out file):
 *   {
 *     status: "GREEN" | "YELLOW" | "RED",
 *     tests_total: N,
 *     tests_passed: N,
 *     tests_failed: N,
 *     pass_rate: 0.0..1.0,
 *     started_at, ended_at, elapsed_ms,
 *     results: [{ name, status, expected, actual, failures, elapsed_ms }, ...]
 *   }
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import yaml from "js-yaml";

// ─────────────────────────────────────────────────────────────────────
// CLI parsing (minimal — no deps)
// ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    suite: "docs/strip-regression-suite.yaml",
    solution: null,
    tenant: null,
    coreUrl: process.env.CORE_URL || process.env.ADAS_CORE_URL || "http://localhost:4100",
    token: process.env.CORE_MCP_SECRET || process.env.ADAS_MCP_TOKEN || "",
    service: "regression-suite",
    actorId: "regression-suite-test",
    out: null,
    dryRun: false,
    bail: false,
    tests: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--suite") args.suite = next();
    else if (a === "--solution") args.solution = next();
    else if (a === "--tenant") args.tenant = next();
    else if (a === "--core-url") args.coreUrl = next();
    else if (a === "--token") args.token = next();
    else if (a === "--service") args.service = next();
    else if (a === "--actor-id") args.actorId = next();
    else if (a === "--out") args.out = next();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--bail") args.bail = true;
    else if (a === "--tests") args.tests = next().split(",").map(s => s.trim());
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return args;
}

function printHelp() {
  const help = fs.readFileSync(new URL(import.meta.url), "utf8")
    .split("\n").filter(l => l.startsWith(" *")).map(l => l.slice(3)).join("\n");
  console.log(help);
}

// ─────────────────────────────────────────────────────────────────────
// Suite loading + validation
// ─────────────────────────────────────────────────────────────────────

function loadSuite(suitePath) {
  if (!fs.existsSync(suitePath)) {
    throw new Error(`Suite file not found: ${suitePath}`);
  }
  const raw = fs.readFileSync(suitePath, "utf8");
  const suite = yaml.load(raw);
  if (!suite || typeof suite !== "object") {
    throw new Error(`Suite must be a YAML object`);
  }
  if (!Array.isArray(suite.tests) || suite.tests.length === 0) {
    throw new Error(`Suite must contain a non-empty 'tests' array`);
  }
  for (const t of suite.tests) {
    if (!t.name || typeof t.name !== "string") {
      throw new Error(`Test missing 'name': ${JSON.stringify(t).slice(0, 200)}`);
    }
    if (!t.input || typeof t.input !== "string") {
      throw new Error(`Test '${t.name}' missing 'input' (string)`);
    }
    if (!t.expect || typeof t.expect !== "object") {
      throw new Error(`Test '${t.name}' missing 'expect' object`);
    }
  }
  return suite;
}

// ─────────────────────────────────────────────────────────────────────
// Core API client
// ─────────────────────────────────────────────────────────────────────

async function postChat({ coreUrl, token, service, tenant, actorId, message }) {
  const url = `${coreUrl.replace(/\/$/, "")}/api/chat`;
  const headers = {
    "Content-Type": "application/json",
    "X-ADAS-TENANT": tenant,
  };
  if (token) {
    headers["x-adas-token"] = token;
    headers["x-adas-service"] = service;
    if (actorId) headers["x-adas-actor-id"] = actorId;
  }
  const body = JSON.stringify({ goal: message, actorId });
  const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST /api/chat → ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.ok || !json.id) {
    throw new Error(`POST /api/chat returned non-ok: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { jobId: json.id, job: json.job, streamUrl: json.streamUrl };
}

async function pollJob({ coreUrl, token, service, tenant, jobId, timeoutMs = 30000 }) {
  const url = `${coreUrl.replace(/\/$/, "")}/api/job/${encodeURIComponent(jobId)}`;
  const headers = { "X-ADAS-TENANT": tenant };
  if (token) {
    headers["x-adas-token"] = token;
    headers["x-adas-service"] = service;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    const job = await res.json();
    if (job?.done || job?.status === "finished" || job?.status === "failed" || job?.status === "aborted") {
      return job;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

// ─────────────────────────────────────────────────────────────────────
// Result comparison
// ─────────────────────────────────────────────────────────────────────

function extractRoute(job) {
  // Try several places where the executed-skill slug might live.
  return (
    job?.skillSlug ||
    job?.__skill?.slug ||
    job?.state?.skillSlug ||
    job?.state?.activeSkill ||
    job?.handoff_chain?.[job?.handoff_chain?.length - 1]?.to ||
    null
  );
}

function extractTools(job) {
  // Best effort — collect any tool names referenced in the job's history/state.
  const tools = new Set();
  const hist = job?.history || [];
  for (const h of hist) {
    if (typeof h?.tool === "string") tools.add(h.tool);
    if (typeof h?.toolName === "string") tools.add(h.toolName);
    if (Array.isArray(h?.tool_calls)) for (const tc of h.tool_calls) tools.add(tc?.name);
  }
  return [...tools];
}

function extractResponseText(job) {
  return (
    job?.result?.final_reply ||
    job?.result?.reply ||
    job?.result?.message ||
    job?.result?.text ||
    job?.final_reply ||
    ""
  );
}

function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function checkStyle(text, style) {
  const wc = wordCount(text);
  switch (style) {
    case "brief":         return wc <= 30;
    case "confirmation":  return wc <= 15;
    case "detail":        return wc > 5;  // any non-trivial response
    default:              return true;
  }
}

function compareTest(test, observed) {
  const failures = [];
  const expect = test.expect || {};
  const acceptedRoutes = test.accepted_routes || (expect.route ? [expect.route] : []);

  // Route check
  if (expect.route) {
    const ok = acceptedRoutes.length > 0
      ? acceptedRoutes.includes(observed.route)
      : observed.route === expect.route;
    if (!ok) failures.push({ kind: "route_mismatch", expected: expect.route, actual: observed.route, accepted: acceptedRoutes });
  }

  // Tool check (optional)
  if (expect.tool) {
    const has = observed.tools.some(t => t === expect.tool || (typeof expect.tool === "string" && t.includes(expect.tool)));
    if (!has) failures.push({ kind: "tool_missing", expected: expect.tool, actual: observed.tools });
  }

  // Style check
  if (expect.style) {
    if (!checkStyle(observed.response, expect.style)) {
      failures.push({ kind: "style_mismatch", expected: expect.style, actual_word_count: wordCount(observed.response) });
    }
  }

  // Contains_any check
  if (Array.isArray(expect.contains_any) && expect.contains_any.length > 0) {
    const lower = String(observed.response || "").toLowerCase();
    const has = expect.contains_any.some(s => lower.includes(String(s).toLowerCase()));
    if (!has) failures.push({ kind: "contains_any_missed", expected: expect.contains_any, response_preview: observed.response.slice(0, 150) });
  }

  // Absent check
  if (Array.isArray(expect.absent) && expect.absent.length > 0) {
    const lower = String(observed.response || "").toLowerCase();
    const found = expect.absent.filter(s => lower.includes(String(s).toLowerCase()));
    if (found.length > 0) failures.push({ kind: "absent_violation", found });
  }

  // Categorize failures — `fail_on` lists hard fails; others are warnings.
  const failOn = test.fail_on || ["route_mismatch", "style_mismatch"];
  const hardFails = failures.filter(f => failOn.includes(f.kind));
  const warnings = failures.filter(f => !failOn.includes(f.kind));
  return { hardFails, warnings };
}

// ─────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────

async function runOneTest(test, env) {
  const t0 = Date.now();
  const result = {
    name: test.name,
    input: test.input,
    started_at: new Date().toISOString(),
    status: "RUNNING",
    expected: test.expect,
    observed: null,
    failures: [],
    warnings: [],
    elapsed_ms: 0,
    error: null,
  };
  try {
    const { jobId } = await postChat({
      coreUrl: env.coreUrl,
      token: env.token,
      service: env.service,
      tenant: env.tenant,
      actorId: env.actorId,
      message: test.input,
    });
    const job = await pollJob({
      coreUrl: env.coreUrl,
      token: env.token,
      service: env.service,
      tenant: env.tenant,
      jobId,
      timeoutMs: env.timeoutMs,
    });
    const observed = {
      route: extractRoute(job),
      tools: extractTools(job),
      response: extractResponseText(job),
      job_id: jobId,
    };
    result.observed = observed;
    const cmp = compareTest(test, observed);
    result.failures = cmp.hardFails;
    result.warnings = cmp.warnings;
    result.status = cmp.hardFails.length === 0 ? "PASS" : "FAIL";
  } catch (err) {
    result.status = "ERROR";
    result.error = String(err?.message || err);
  }
  result.elapsed_ms = Date.now() - t0;
  result.ended_at = new Date().toISOString();
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const suitePath = path.resolve(args.suite);

  let suite;
  try {
    suite = loadSuite(suitePath);
  } catch (err) {
    console.error(`Suite load failed: ${err.message}`);
    process.exit(2);
  }

  const env = {
    coreUrl: args.coreUrl,
    token: args.token,
    service: args.service,
    tenant: args.tenant || suite.tenant,
    actorId: args.actorId,
    timeoutMs: suite.timeout_ms || 30000,
  };
  const solutionId = args.solution || suite.solution_id;

  if (!env.tenant) { console.error("No tenant specified (--tenant or in suite)"); process.exit(2); }
  if (!solutionId) { console.error("No solution id specified (--solution or in suite)"); process.exit(2); }

  // Filter tests
  let tests = suite.tests;
  if (args.tests) {
    const names = new Set(args.tests);
    tests = tests.filter(t => names.has(t.name));
    if (tests.length === 0) { console.error(`No tests matched: ${args.tests.join(",")}`); process.exit(2); }
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ status: "DRY_RUN", suite_path: suitePath, tests_loaded: tests.length, tenant: env.tenant, solution_id: solutionId }, null, 2));
    process.exit(0);
  }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const results = [];
  let passed = 0, failed = 0, errored = 0;

  console.error(`[regression] starting suite: ${tests.length} tests against ${solutionId} (tenant=${env.tenant}, core=${env.coreUrl})`);

  for (const test of tests) {
    process.stderr.write(`[regression] ${test.name} ... `);
    const r = await runOneTest(test, env);
    results.push(r);
    if (r.status === "PASS") { passed++; process.stderr.write(`PASS (${r.elapsed_ms}ms)\n`); }
    else if (r.status === "FAIL") { failed++; process.stderr.write(`FAIL: ${r.failures.map(f => f.kind).join(",")} (${r.elapsed_ms}ms)\n`); }
    else { errored++; process.stderr.write(`ERROR: ${r.error?.slice(0, 100)} (${r.elapsed_ms}ms)\n`); }
    if (args.bail && (r.status === "FAIL" || r.status === "ERROR")) break;
  }

  const elapsed = Date.now() - t0;
  const total = results.length;
  const passRate = total > 0 ? passed / total : 0;
  const minPass = suite.thresholds?.min_pass_rate ?? 1.0;
  const warnPass = suite.thresholds?.warning_pass_rate ?? 0.9;
  let status = "RED";
  if (passRate >= minPass) status = "GREEN";
  else if (passRate >= warnPass) status = "YELLOW";

  const report = {
    status,
    suite_path: suitePath,
    solution_id: solutionId,
    tenant: env.tenant,
    tests_total: total,
    tests_passed: passed,
    tests_failed: failed,
    tests_errored: errored,
    pass_rate: passRate,
    thresholds: { min_pass_rate: minPass, warning_pass_rate: warnPass },
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    elapsed_ms: elapsed,
    results,
  };

  const out = JSON.stringify(report, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, out);
    console.error(`[regression] report written to ${args.out}`);
  } else {
    console.log(out);
  }

  console.error(`[regression] ${status}: ${passed}/${total} passed (${(passRate * 100).toFixed(1)}%) in ${(elapsed / 1000).toFixed(1)}s`);
  process.exit(status === "GREEN" ? 0 : 1);
}

main().catch(err => {
  console.error(`[regression] fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(3);
});
