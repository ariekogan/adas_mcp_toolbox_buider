#!/usr/bin/env node
/**
 * strip-phase.mjs
 *
 * The phase orchestrator for the schema-strip project. Wraps a phase's
 * implementation script with safety mechanics: pre-tag, run regression,
 * post-tag or auto-rollback.
 *
 * Each strip phase is a self-contained script that mutates code/config
 * and (typically) requires a Builder rebuild + redeploy. This wrapper
 * handles everything around that:
 *
 *   1. Verify previous phase's `-post` tag exists (or `-pre` of THIS phase
 *      if it's the first run).
 *   2. Run the regression suite as a SMOKE TEST against current mobile-pa
 *      → must be GREEN before we start, otherwise mobile-pa is already
 *      broken and we don't want to mask that with our changes.
 *   3. Tag `safe-strip-phase-N-pre` on all affected repos (if not already).
 *   4. Run the phase's implementation (--impl <path>).
 *   5. Build + deploy Builder (and ateam-mcp if needed).
 *   6. Wait for deploy ready.
 *   7. Run regression suite POST-phase.
 *   8. Decide:
 *        GREEN  → tag `safe-strip-phase-N-post`, exit 0.
 *        YELLOW → halt, notify, do NOT tag, do NOT rollback (human decides).
 *        RED    → auto-rollback to `-pre` tag, exit 1.
 *
 * Usage:
 *   node apps/backend/scripts/strip-phase.mjs --phase N --impl <script.mjs> [options]
 *
 * Options:
 *   --phase <N>            Phase number (required, 0..10)
 *   --impl <path>          Path to the phase implementation script (required)
 *   --skip-pre-check       Skip the pre-phase smoke regression run
 *   --skip-deploy          Don't trigger Builder rebuild/deploy (impl handles it)
 *   --dry-run              Show what would happen, don't execute the phase
 *   --suite <path>         Override regression suite path
 *
 * Output:
 *   Phase report at docs/phase-reports/phase-N-<timestamp>.json
 *
 * Exit codes:
 *   0 — phase ran, GREEN, tagged
 *   1 — phase ran, RED, rolled back
 *   2 — phase YELLOW or halted without rollback (human review needed)
 *   3 — config/precondition error before phase started
 *   4 — pre-phase smoke regression failed; mobile-pa already broken
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname, "../../../..");
const RUNNER = path.join(REPO_ROOT, "apps/backend/scripts/run-strip-regression.mjs");
const DEFAULT_SUITE = path.join(REPO_ROOT, "docs/strip-regression-suite.yaml");
const REPORTS_DIR = path.join(REPO_ROOT, "docs/phase-reports");

// Repos that get tagged. Core is read-only (marker tags only, no behavior change).
const REPOS = [
  { name: "Builder", path: REPO_ROOT },
  { name: "Core", path: "/Users/arie/Projects/ai-dev-assistant", readOnly: true },
  { name: "ateam-mcp", path: "/Users/arie/Projects/ateam-mcp" },
];

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    phase: null,
    impl: null,
    skipPreCheck: false,
    skipDeploy: false,
    dryRun: false,
    suite: DEFAULT_SUITE,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--phase") args.phase = parseInt(next(), 10);
    else if (a === "--impl") args.impl = next();
    else if (a === "--skip-pre-check") args.skipPreCheck = true;
    else if (a === "--skip-deploy") args.skipDeploy = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--suite") args.suite = next();
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${a}`); process.exit(3); }
  }
  return args;
}

function printHelp() {
  const help = fs.readFileSync(new URL(import.meta.url), "utf8")
    .split("\n").filter(l => l.startsWith(" *")).map(l => l.slice(3)).join("\n");
  console.log(help);
}

// ─────────────────────────────────────────────────────────────────────
// Git helpers
// ─────────────────────────────────────────────────────────────────────

function git(repo, args, opts = {}) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", ...opts });
  if (result.status !== 0 && !opts.allowFailure) {
    throw new Error(`git ${args.join(" ")} in ${repo} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function tagExists(repo, tag) {
  const r = git(repo, ["tag", "-l", tag], { allowFailure: true });
  return r.stdout.trim() === tag;
}

function createTag(repo, tag, message) {
  if (tagExists(repo, tag)) {
    log(`tag ${tag} already exists in ${repo.split("/").pop()} (skip)`);
    return;
  }
  git(repo, ["tag", tag, "HEAD", "-m", message]);
  git(repo, ["push", "origin", tag], { allowFailure: true });
  log(`tagged ${tag} on ${repo.split("/").pop()}`);
}

function rollbackToTag(repo, tag) {
  if (!tagExists(repo, tag)) {
    throw new Error(`Cannot rollback ${repo}: tag ${tag} does not exist`);
  }
  // Hard reset (we only call this after deciding RED — destructive by design).
  git(repo, ["reset", "--hard", tag]);
  log(`rolled back ${repo.split("/").pop()} to ${tag}`);
}

function currentSha(repo) {
  return git(repo, ["rev-parse", "HEAD"]).stdout.trim();
}

// ─────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────

function log(msg) {
  console.error(`[phase] ${new Date().toISOString()} ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────
// Regression run wrapper
// ─────────────────────────────────────────────────────────────────────

function runRegression(suite, label) {
  log(`running regression suite (${label})...`);
  const outFile = path.join(REPORTS_DIR, `${label}-${Date.now()}.json`);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const r = spawnSync("node", [RUNNER, "--suite", suite, "--out", outFile], {
    stdio: ["ignore", "inherit", "inherit"],
    encoding: "utf8",
  });
  const exitCode = r.status;
  let report = null;
  if (fs.existsSync(outFile)) {
    try { report = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch {}
  }
  return { exitCode, report, outFile };
}

// ─────────────────────────────────────────────────────────────────────
// Phase implementation runner
// ─────────────────────────────────────────────────────────────────────

function runPhaseImpl(implPath) {
  log(`running phase implementation: ${implPath}`);
  const r = spawnSync("node", [implPath], {
    stdio: ["ignore", "inherit", "inherit"],
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`phase implementation exited non-zero (${r.status})`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.phase === null || isNaN(args.phase)) {
    console.error("--phase <N> is required");
    process.exit(3);
  }
  if (!args.impl) {
    console.error("--impl <path> is required");
    process.exit(3);
  }
  if (!fs.existsSync(args.impl)) {
    console.error(`Impl script not found: ${args.impl}`);
    process.exit(3);
  }

  const phaseNum = args.phase;
  const preTag = `safe-strip-phase-${phaseNum}-pre`;
  const postTag = `safe-strip-phase-${phaseNum}-post`;
  const prevPostTag = phaseNum > 0 ? `safe-strip-phase-${phaseNum - 1}-post` : null;

  log(`=== Phase ${phaseNum} orchestration starting ===`);
  log(`impl: ${args.impl}`);
  log(`pre-tag: ${preTag}`);
  log(`post-tag: ${postTag}`);
  if (prevPostTag) log(`prev post-tag (required): ${prevPostTag}`);

  if (args.dryRun) {
    log(`DRY RUN — no changes will be made`);
    log(`would tag ${preTag} on: ${REPOS.map(r => r.name).join(", ")}`);
    log(`would run impl: ${args.impl}`);
    log(`would run regression suite: ${args.suite}`);
    log(`would tag ${postTag} on GREEN, rollback on RED`);
    process.exit(0);
  }

  // ── Step 1: precondition ────────────────────────────────────────────
  if (prevPostTag) {
    for (const repo of REPOS) {
      if (!tagExists(repo.path, prevPostTag)) {
        log(`MISSING PRECONDITION: tag ${prevPostTag} does not exist on ${repo.name}`);
        log(`Cannot proceed — previous phase has not been completed cleanly.`);
        process.exit(3);
      }
    }
  }

  // ── Step 2: pre-phase smoke regression ──────────────────────────────
  if (!args.skipPreCheck) {
    const { exitCode, report } = runRegression(args.suite, `phase-${phaseNum}-pre-smoke`);
    if (exitCode !== 0) {
      log(`PRE-PHASE SMOKE FAILED — mobile-pa is already broken (or unreachable)`);
      log(`Refusing to start phase ${phaseNum}; investigate first.`);
      log(`Pass rate: ${report?.pass_rate ?? "n/a"}, status: ${report?.status ?? "ERROR"}`);
      process.exit(4);
    }
    log(`pre-phase smoke GREEN (${report.tests_passed}/${report.tests_total})`);
  } else {
    log(`pre-phase smoke skipped (--skip-pre-check)`);
  }

  // ── Step 3: tag pre-state ───────────────────────────────────────────
  for (const repo of REPOS) {
    createTag(repo.path, preTag, `Pre-Phase-${phaseNum}. ${new Date().toISOString()}`);
  }

  // ── Step 4: capture pre-SHAs ────────────────────────────────────────
  const preSHAs = {};
  for (const repo of REPOS) preSHAs[repo.name] = currentSha(repo.path);
  log(`pre-SHAs: ${JSON.stringify(preSHAs)}`);

  // ── Step 5: run phase implementation ────────────────────────────────
  try {
    runPhaseImpl(args.impl);
  } catch (err) {
    log(`PHASE IMPL FAILED: ${err.message}`);
    log(`Rolling back all repos to ${preTag}...`);
    for (const repo of REPOS) {
      if (!repo.readOnly) rollbackToTag(repo.path, preTag);
    }
    process.exit(1);
  }

  // ── Step 6: rebuild Builder (and ateam-mcp if it changed) ───────────
  if (!args.skipDeploy) {
    log(`Builder rebuild on mac1 — not automated here; expect impl script to handle it`);
    // Phase impl scripts are responsible for triggering their own mac1 deploys.
    // The orchestrator just runs the impl and assumes it left the system in
    // the right state. Polling for "deploy ready" is the impl's responsibility.
  }

  // ── Step 7: post-phase regression ───────────────────────────────────
  const { exitCode: postCode, report: postReport, outFile: postOut } = runRegression(args.suite, `phase-${phaseNum}-post`);

  // ── Step 8: decide ──────────────────────────────────────────────────
  const status = postReport?.status || "RED";
  if (status === "GREEN") {
    log(`POST-PHASE GREEN (${postReport.tests_passed}/${postReport.tests_total})`);
    for (const repo of REPOS) {
      createTag(repo.path, postTag, `Post-Phase-${phaseNum} GREEN. ${new Date().toISOString()}`);
    }
    writePhaseSummary(phaseNum, "GREEN", preSHAs, postReport, postOut);
    log(`✅ Phase ${phaseNum} complete. Tag: ${postTag}`);
    process.exit(0);
  } else if (status === "YELLOW") {
    log(`POST-PHASE YELLOW (${postReport.tests_passed}/${postReport.tests_total}) — halt for human review`);
    writePhaseSummary(phaseNum, "YELLOW", preSHAs, postReport, postOut);
    log(`⚠️ Phase ${phaseNum} halted at YELLOW. No tag created. No rollback. Investigate ${postOut}`);
    process.exit(2);
  } else {
    log(`POST-PHASE RED — auto-rolling back to ${preTag}`);
    for (const repo of REPOS) {
      if (!repo.readOnly) rollbackToTag(repo.path, preTag);
    }
    writePhaseSummary(phaseNum, "RED", preSHAs, postReport, postOut);
    log(`❌ Phase ${phaseNum} FAILED. Rolled back. Report: ${postOut}`);
    process.exit(1);
  }
}

function writePhaseSummary(phaseNum, status, preSHAs, report, reportPath) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const out = path.join(REPORTS_DIR, `phase-${phaseNum}-summary-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify({
    phase: phaseNum,
    status,
    pre_shas: preSHAs,
    report_path: reportPath,
    tests_total: report?.tests_total,
    tests_passed: report?.tests_passed,
    tests_failed: report?.tests_failed,
    pass_rate: report?.pass_rate,
    timestamp: new Date().toISOString(),
  }, null, 2));
  log(`phase summary: ${out}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(3);
});
