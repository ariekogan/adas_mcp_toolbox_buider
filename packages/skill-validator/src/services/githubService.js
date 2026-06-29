/**
 * GitHub API client for A-Team solution repos.
 *
 * Uses raw fetch (no dependencies). All repos live under a single GitHub org/user.
 * Atomic multi-file commits via the Git Trees API.
 *
 * Resilience features:
 *   - 15s timeout on every GitHub API call (AbortSignal)
 *   - Automatic retry (2 attempts) on 5xx and network errors with exponential backoff
 *   - Parallel blob creation (batches of 5)
 *   - Proper error discrimination in ensureRepo (404 vs other errors)
 *
 * Env vars:
 *   GITHUB_PAT      — Fine-grained PAT with repos scope
 *   GITHUB_OWNER    — GitHub user or org (default: "ariekogan")
 *   GITHUB_ENABLED  — Set to "false" to disable (default: "true")
 */

const GITHUB_API = 'https://api.github.com';
const OWNER = process.env.GITHUB_OWNER || 'ariekogan';
const PAT = process.env.GITHUB_PAT || '';
const ENABLED = process.env.GITHUB_ENABLED !== 'false';

// ─────────────────────────────────────────────────────────────────────────────
// Per-tenant GitHub auth — Core owns the credential, the Builder owns the ops.
// ─────────────────────────────────────────────────────────────────────────────
//
// The GitHub App private key is a PLATFORM secret and lives only in Core
// (adas_system.global_settings.github_app). The Builder is FS-only and must NOT
// hold it. So Core mints a short-lived (~1h) per-tenant installation token; the
// Builder fetches it (service-to-service, shared secret — same pattern as
// llm/adapter.js) and uses it for all git operations. Falls back to the legacy
// platform-wide GITHUB_PAT when a tenant hasn't connected (or Core is down).
//
// The resolved token is carried in AsyncLocalStorage, set once per public call
// by withGithubAuth(tenant, …). Race-free across concurrent tenants, and
// private helpers (assertRefExists, createBlobsBatch) inherit it transparently
// without threading tenant through their signatures.
import { AsyncLocalStorage } from 'node:async_hooks';

const CORE_URL = process.env.ADAS_CORE_URL || 'http://adas-backend:4000';
const CORE_SECRET = process.env.ADAS_MCP_TOKEN || process.env.CORE_MCP_SECRET || '';
const _ghAuth = new AsyncLocalStorage(); // store: { token }
const _tokenCache = new Map();           // tenant → { token, expiresAtMs }
const TOKEN_SKEW_MS = 60_000;

/** Run `fn` with the tenant's GitHub token bound to the async context. */
async function withGithubAuth(tenant, fn) {
  const token = await resolveTenantToken(tenant);
  return _ghAuth.run({ token }, fn);
}

/**
 * Resolve the GitHub bearer token for a tenant: a Core-minted installation
 * token if the tenant has connected, else the legacy PAT. Cached per tenant.
 */
async function resolveTenantToken(tenant) {
  if (!tenant || !CORE_SECRET) return PAT;
  const cached = _tokenCache.get(tenant);
  if (cached && cached.expiresAtMs - TOKEN_SKEW_MS > Date.now()) return cached.token;
  try {
    const res = await fetch(`${CORE_URL}/api/github/installation-token`, {
      headers: { 'x-adas-token': CORE_SECRET, 'x-adas-tenant': tenant },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const d = await res.json();
      if (d?.ok && d.token) {
        const expiresAtMs = d.expires_at ? Date.parse(d.expires_at) : Date.now() + 3600_000;
        _tokenCache.set(tenant, { token: d.token, expiresAtMs });
        return d.token;
      }
    } else if (res.status === 409) {
      // Tenant hasn't connected GitHub. If a legacy PAT exists, use it silently
      // (migration window). If NOT, fail with an actionable, agent-readable
      // message + connect URL — never a cryptic GitHub 401. Core's 409 body
      // carries the guidance (message, connect_url, app_configured).
      if (PAT) return PAT;
      const d = await res.json().catch(() => ({}));
      const e = new Error(d.message || `Tenant "${tenant}" has not connected GitHub.`);
      e.code = 'github_not_connected';
      e.connect_url = d.connect_url || null;
      e.app_configured = d.app_configured ?? null;
      e.actionable = true;
      throw e;
    }
  } catch (err) {
    if (err.code === 'github_not_connected') throw err; // propagate the actionable error
    console.warn(`[GitHub] installation-token fetch failed for "${tenant}": ${err.message} — falling back to PAT`);
  }
  return PAT;
}

/** Drop a tenant's cached token (e.g. after disconnect). */
export function clearTenantTokenCache(tenant) {
  if (tenant) _tokenCache.delete(tenant); else _tokenCache.clear();
}

const GH_TIMEOUT_MS = 15_000;   // 15s per API call
const GH_RETRIES = 2;           // total attempts = 2
const GH_BACKOFF_MS = 1000;     // initial backoff between retries
const BLOB_BATCH_SIZE = 5;      // parallel blob uploads

// ─────────────────────────────────────────────────────────────────────────────
// Read response cache — 60s TTL
// ─────────────────────────────────────────────────────────────────────────────
//
// Why: GitHub's authenticated REST API allows 5000 calls/hour. A single
// ateam_github_pull on a 12-skill solution reads ~50 files. A pre-deploy
// guard verifyConsistency reads ~50 more. A redeploy verifies again. Two
// agents working in parallel + a couple of pulls + verifies = quota gone
// in 30 minutes.
//
// Most of those reads hit the same files repeatedly within a short window
// (single deploy cycle). 60s TTL catches the common cases without staleness
// risk: any GH write through this module busts the relevant cache keys
// before returning, so the cache is never out of sync with our own writes.
// External writes (e.g. someone editing the GH repo via the web UI) are
// reflected after 60s — acceptable trade-off.
//
// Cache key conventions:
//   readFile:        readFile::<tenant>::<solId>::<path>::<branch>
//   listFiles:       listFiles::<tenant>::<solId>::<branch>
//   listTenantRepos: listTenantRepos::<tenant>
//   getRepoStatus:   getRepoStatus::<tenant>::<solId>
//   getLog:          getLog::<tenant>::<solId>::<limit>::<branch>
//
// Default TTL is 60s, but each call can override per-key.
const READ_CACHE_TTL_MS = parseInt(process.env.GH_READ_CACHE_TTL_MS || '60000', 10);
const _readCache = new Map(); // key → { value, fetchedAt, ttl }
let _cacheStats = { hits: 0, misses: 0, writes: 0, busts: 0 };

function cacheGet(key) {
  const entry = _readCache.get(key);
  if (!entry) { _cacheStats.misses++; return null; }
  if (Date.now() - entry.fetchedAt > entry.ttl) {
    _readCache.delete(key);
    _cacheStats.misses++;
    return null;
  }
  _cacheStats.hits++;
  return entry.value;
}

function cacheSet(key, value, ttl = READ_CACHE_TTL_MS) {
  _readCache.set(key, { value, fetchedAt: Date.now(), ttl });
  _cacheStats.writes++;
}

/**
 * Bust all cache entries for a given <tenant>::<solId> repo. Called by every
 * write path so a subsequent read sees the freshly-written content.
 */
function cacheBustRepo(tenant, solutionId) {
  const prefixA = `::${tenant}::${solutionId}::`;
  const prefixB = `::${tenant}::${solutionId}`; // exact-match keys
  let busted = 0;
  for (const k of _readCache.keys()) {
    if (k.includes(prefixA) || k.endsWith(prefixB)) {
      _readCache.delete(k);
      busted++;
    }
  }
  // Also bust the per-tenant repo list — a write may create a new repo
  if (_readCache.delete(`listTenantRepos::${tenant}`)) busted++;
  _cacheStats.busts += busted;
}

/** Diagnostic — exposed via the gitsync health endpoint. */
export function getReadCacheStats() {
  return {
    ..._cacheStats,
    size: _readCache.size,
    ttlMs: READ_CACHE_TTL_MS,
    blobCache: { ..._blobCacheStats, dir: BLOB_CACHE_DIR },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-addressable blob cache (SHA → content) — on-disk, survives restart
// ─────────────────────────────────────────────────────────────────────────────
//
// Why: a github-mode build_and_run does N readFile calls — one per file in the
// repo (~80 for a real solution). With a 5000/hour PAT quota, a few back-to-back
// deploys exhaust the limit (observed: 95 rate-limit-exceeded errors in a single
// 9-minute deploy on ada).
//
// But the Trees API listFiles() returns the git blob SHA of every file in ONE
// call. Git blob SHAs are content-deterministic (sha1("blob " + size + "\0" +
// content)), so they uniquely identify content across any repo, branch, or
// tenant. If we've ever fetched a blob with SHA X, we have its content forever.
//
// Cache shape:
//   <BLOB_CACHE_DIR>/<sha[0:2]>/<sha[2:]>   ← raw file content
//
// Hit rate: ~100% for unchanged files, which is the common case for repeated
// build_and_run cycles. A typical "no source changes" deploy drops from 80+
// API calls to 1 (just the listFiles tree fetch).
//
// Invalidation: never — SHA is a hash of content, content with the same SHA
// is guaranteed identical bytes.
import { mkdirSync, existsSync as _existsSync, readFileSync as _readFileSync, writeFileSync as _writeFileSync, statSync as _statSync } from 'fs';
import { tmpdir } from 'os';
import { join as _join, dirname as _dirname } from 'path';

const BLOB_CACHE_DIR = process.env.GH_BLOB_CACHE_DIR || _join(tmpdir(), 'gh-blob-cache');
let _blobCacheStats = { hits: 0, misses: 0, writes: 0, errors: 0 };

function _blobCachePath(sha) {
  return _join(BLOB_CACHE_DIR, sha.slice(0, 2), sha.slice(2));
}

function blobCacheGet(sha) {
  if (!sha) { _blobCacheStats.misses++; return null; }
  try {
    const content = _readFileSync(_blobCachePath(sha), 'utf-8');
    _blobCacheStats.hits++;
    return content;
  } catch {
    _blobCacheStats.misses++;
    return null;
  }
}

function blobCacheSet(sha, content) {
  if (!sha) return;
  try {
    const p = _blobCachePath(sha);
    mkdirSync(_dirname(p), { recursive: true });
    _writeFileSync(p, content);
    _blobCacheStats.writes++;
  } catch (err) {
    _blobCacheStats.errors++;
    // Don't throw — cache write is best-effort. A failed write just means
    // the next read of this blob will hit the API again.
    console.warn(`[GitHub] Blob cache write failed for ${sha?.slice(0, 8)}: ${err.message}`);
  }
}

function headers() {
  // Token from the active per-tenant auth context (withGithubAuth); PAT when
  // called outside a context (legacy callers / not wrapped).
  const token = _ghAuth.getStore()?.token || PAT;
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/**
 * Core GitHub API caller with timeout + retry. Auth is the token in the active
 * withGithubAuth context (per-tenant install token, PAT fallback).
 */
async function gh(method, path, body) {
  let lastErr = null;

  for (let attempt = 1; attempt <= GH_RETRIES; attempt++) {
    try {
      const opts = {
        method,
        headers: headers(),
        signal: AbortSignal.timeout(GH_TIMEOUT_MS),
      };
      if (body !== undefined) opts.body = JSON.stringify(body);

      const res = await fetch(`${GITHUB_API}${path}`, opts);

      if (res.status === 204) return null;

      const data = await res.json();

      if (!res.ok) {
        const err = new Error(`GitHub API ${method} ${path} → ${res.status}: ${data.message || JSON.stringify(data)}`);
        err.status = res.status;

        // Retry on 5xx (server errors), not on 4xx (client errors)
        if (res.status >= 500 && attempt < GH_RETRIES) {
          console.warn(`[GitHub] ${method} ${path} → ${res.status}, retry ${attempt}/${GH_RETRIES}...`);
          lastErr = err;
          await sleep(GH_BACKOFF_MS * attempt);
          continue;
        }
        throw err;
      }

      return data;
    } catch (err) {
      // Network errors and timeouts — retry
      if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        console.warn(`[GitHub] ${method} ${path} → ${err.name || err.code}, retry ${attempt}/${GH_RETRIES}...`);
        lastErr = err;
        if (attempt < GH_RETRIES) {
          await sleep(GH_BACKOFF_MS * attempt);
          continue;
        }
      }
      // If it already has a status (our error from above), or it's the last attempt, throw
      throw lastErr || err;
    }
  }
  throw lastErr;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Verify a ref (branch/tag/sha) exists in the repo. Throws a workflow-aware
 * error if it doesn't, so callers get an actionable message instead of a
 * terse "404 Not Found".
 *
 * Called at the top of every ref-accepting operation (pushFiles, readFile,
 * patchFile, getLog, getDiff, etc.) so the error surfaces BEFORE any
 * side-effects (blob uploads, partial commits).
 *
 * Returns the resolved commit SHA on success.
 */
async function assertRefExists(fullName, ref, ctx = {}) {
  const isWrite = ctx.operation === 'write';
  try {
    // Try as branch first
    const r = await gh('GET', `/repos/${fullName}/git/ref/heads/${encodeURIComponent(ref)}`);
    return r.object.sha;
  } catch (branchErr) {
    if (branchErr.status !== 404) throw branchErr;
    // Not a branch — try as tag
    try {
      const r = await gh('GET', `/repos/${fullName}/git/ref/tags/${encodeURIComponent(ref)}`);
      // Annotated tag: resolve to the commit it points to
      if (r.object.type === 'tag') {
        const t = await gh('GET', `/repos/${fullName}/git/tags/${r.object.sha}`);
        return t.object.sha;
      }
      return r.object.sha;
    } catch (tagErr) {
      if (tagErr.status !== 404) throw tagErr;
      // Not a tag — try as direct commit SHA
      try {
        const c = await gh('GET', `/repos/${fullName}/git/commits/${encodeURIComponent(ref)}`);
        return c.sha;
      } catch (shaErr) {
        // All three lookups failed → ref truly doesn't exist.
        // Build a helpful, workflow-aware error.
        const lines = [
          `Ref "${ref}" not found in ${fullName} (not a branch, tag, or commit SHA).`,
          '',
          'Valid options:',
          '  • "dev"  — active work branch (default target for writes)',
          '  • "main" — production branch (default target for reads + ateam_build_and_run)',
          '  • A tag from ateam_github_list_versions() — e.g. "prod-2026-05-19-001"',
          '  • A commit SHA (e.g. "a1b2c3d")',
          '',
          'Workflow reminder:',
          '  1. Edit files → ateam_github_patch(..., ref:"dev") — writes default to dev',
          '  2. Preview     → ateam_github_diff (compares dev vs main)',
          '  3. Promote     → ateam_github_promote (merges dev→main + auto-tags prod-*)',
          '  4. Deploy      → ateam_build_and_run (deploys main)',
        ];
        if (isWrite && ref === 'master') {
          lines.push('', `(Did you mean "main"? Note: this project uses 'main', not 'master'.)`);
        }
        if (isWrite && ref !== 'dev' && ref !== 'main') {
          lines.push('', `If you intended to create a new branch "${ref}", do it via git directly (it can't be auto-created through this API).`);
        }
        const err = new Error(lines.join('\n'));
        err.status = 404;
        err.refNotFound = true;
        throw err;
      }
    }
  }
}

/**
 * Create blobs in parallel batches.
 * @returns {Array<{ path, mode, type, sha }>} tree items
 */
async function createBlobsBatch(fullName, files) {
  const treeItems = [];
  for (let i = 0; i < files.length; i += BLOB_BATCH_SIZE) {
    const batch = files.slice(i, i + BLOB_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const blob = await gh('POST', `/repos/${fullName}/git/blobs`, {
          content: file.content,
          encoding: 'utf-8',
        });
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        };
      })
    );
    treeItems.push(...results);
  }
  return treeItems;
}

/** Build the repo name from tenant + solution ID. */
export function repoName(tenant, solutionId) {
  return `${tenant}--${solutionId}`;
}

/**
 * Encode a path for GitHub's Contents API.
 *
 * BUG FIX: previous code used encodeURIComponent(path) which encodes "/" as
 * "%2F". GitHub's Contents API expects path SEGMENTS — slashes must remain
 * literal so the URL `/repos/foo/bar/contents/connectors/x/y.js` parses as
 * the file at sub-path "connectors/x/y.js", not as a single literal name
 * "connectors%2Fx%2Fy.js". Result of the bug: any subdirectory file (e.g.
 * connectors/<id>/rn-bundle/index.bundle.js) returned 404, the readFile
 * caller's try/catch swallowed it silently, and ateam_github_pull silently
 * dropped subdirectory files — only top-level connector files came through.
 * Encode each segment separately so special chars (spaces, plus, etc.) are
 * still escaped, but slashes survive.
 */
function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

/** Check if GitHub integration is enabled and configured. */
export function isEnabled() {
  return ENABLED && PAT.length > 0;
}

/**
 * List all solution repos for a tenant.
 * Repos follow the naming convention: {tenant}--{solutionId}
 * @returns {Array<{solutionId: string, repo_url: string}>}
 */
export async function listTenantRepos(tenant) {
  return withGithubAuth(tenant, async () => {
  const cacheKey = `listTenantRepos::${tenant}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const prefix = `${tenant}--`;
  const repos = await gh('GET', `/users/${OWNER}/repos?per_page=100&sort=updated`);
  const result = repos
    .filter(r => r.name.startsWith(prefix))
    .map(r => ({
      solutionId: r.name.slice(prefix.length),
      repo_url: r.html_url,
    }));
  cacheSet(cacheKey, result);
  return result;
  });
}

/**
 * List directory entries in a repo path.
 * @returns {Array<string>} directory names
 */
export async function listDir(tenant, solutionId, dirPath, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;
  const contents = await gh('GET', `/repos/${fullName}/contents/${encodePath(dirPath)}?ref=${branch}`);
  return contents.filter(c => c.type === 'dir').map(c => c.name);
  });
}

/**
 * Ensure a repo exists under the owner. Creates if not found.
 * Properly distinguishes 404 (not found) from other errors.
 * @returns {{ repo_url, created }} — created=true if newly created
 */
export async function ensureRepo(tenant, solutionId, description = '') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Check if exists — only treat 404 as "not found"
  try {
    const repo = await gh('GET', `/repos/${fullName}`);
    return { repo_url: repo.html_url, full_name: fullName, created: false };
  } catch (err) {
    if (err.status !== 404) {
      // Real error (auth, rate limit, network) — don't try to create
      throw new Error(`Cannot check repo ${fullName}: ${err.message}`);
    }
    // 404 — repo doesn't exist, create it below
  }

  const repo = await gh('POST', '/user/repos', {
    name,
    description: description || `A-Team solution: ${solutionId} (tenant: ${tenant})`,
    private: false,
    auto_init: true, // creates initial commit so we have a branch
  });

  return { repo_url: repo.html_url, full_name: `${OWNER}/${name}`, created: true };
  });
}

/**
 * Atomic multi-file commit via Git Trees API.
 * Uses parallel blob creation for speed.
 *
 * Concurrent-write resilience: when two pushes to the same repo race,
 * the second ref-update returns 422 ("Update is not a fast forward" or
 * "Reference cannot be updated") because both commits were authored
 * against the same HEAD. The losing push used to fail outright,
 * leaving Builder FS ahead of GitHub for the affected file —
 * exactly the FS-newer-than-GH drift observed on mobile-pa.
 *
 * Fix: on a ref-update 422, re-read HEAD, rebuild the commit on top of
 * the new HEAD (re-using the already-uploaded blobs and tree), retry
 * the ref-update. Up to PUSH_MAX_RETRIES attempts with small jittered
 * backoff. Blobs are content-addressable so they don't need to be
 * recreated; only the tree (which depends on base_tree) and the
 * commit (which depends on parents) get rebuilt.
 */
const PUSH_MAX_RETRIES = 4;

export async function pushFiles(tenant, solutionId, files, message = 'Update solution', branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Validate ref BEFORE uploading blobs — gives a clear, workflow-aware
  // error if the user passed e.g. "master" or "production" by mistake,
  // without wasting blob uploads on a deploy that's going to fail.
  await assertRefExists(fullName, branch, { operation: 'write' });

  // Create blobs ONCE — they're content-addressable, surviving every retry.
  const treeItems = await createBlobsBatch(fullName, files);

  let lastErr = null;
  for (let attempt = 0; attempt <= PUSH_MAX_RETRIES; attempt++) {
    // 1. Get current HEAD on every attempt (a concurrent push may have
    //    advanced it since the previous try).
    let headSha, treeSha;
    try {
      const ref = await gh('GET', `/repos/${fullName}/git/ref/heads/${branch}`);
      headSha = ref.object.sha;
      const commit = await gh('GET', `/repos/${fullName}/git/commits/${headSha}`);
      treeSha = commit.tree.sha;
    } catch (err) {
      throw new Error(`Cannot get HEAD for ${fullName}@${branch}: ${err.message}`);
    }

    // 2. Create tree on top of the current HEAD's tree.
    const tree = await gh('POST', `/repos/${fullName}/git/trees`, {
      base_tree: treeSha,
      tree: treeItems,
    });

    // 3. Create commit with current HEAD as parent.
    const commit = await gh('POST', `/repos/${fullName}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [headSha],
    });

    // 4. Update ref. This is the contended step — a concurrent push that
    //    lands between step 1 and step 4 makes our parents stale, so the
    //    server rejects with 422.
    try {
      await gh('PATCH', `/repos/${fullName}/git/refs/heads/${branch}`, {
        sha: commit.sha,
      });
      // Bust the read cache for this repo — the freshly-pushed content
      // is what subsequent reads should see, not whatever we cached
      // before the push.
      cacheBustRepo(tenant, solutionId);
      return {
        commit_sha: commit.sha,
        commit_url: commit.html_url,
        files_committed: files.length,
        ...(attempt > 0 && { retries: attempt }),
      };
    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      const isFastForwardRace = err?.status === 422 && /fast forward|cannot be updated|update is not/i.test(msg);
      if (!isFastForwardRace || attempt >= PUSH_MAX_RETRIES) {
        throw err;
      }
      // Jittered backoff: 100-300ms × 2^attempt.
      const wait = Math.floor((100 + Math.random() * 200) * (2 ** attempt));
      console.warn(`[GitHub] pushFiles ref-update 422 for ${fullName} (attempt ${attempt + 1}/${PUSH_MAX_RETRIES}, retry in ${wait}ms): ${msg}`);
      await sleep(wait);
    }
  }
  throw lastErr || new Error(`pushFiles failed after ${PUSH_MAX_RETRIES} retries`);
  });
}

/**
 * Get repo status — existence, latest commit, URL.
 */
export async function getRepoStatus(tenant, solutionId) {
  return withGithubAuth(tenant, async () => {
  const cacheKey = `getRepoStatus::${tenant}::${solutionId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  let result;
  try {
    const repo = await gh('GET', `/repos/${fullName}`);
    // Get latest commit
    let latest_commit = null;
    try {
      const commits = await gh('GET', `/repos/${fullName}/commits?per_page=1`);
      if (commits && commits.length > 0) {
        latest_commit = {
          sha: commits[0].sha,
          message: commits[0].commit.message,
          date: commits[0].commit.committer.date,
          author: commits[0].commit.author.name,
        };
      }
    } catch { /* no commits yet */ }

    result = {
      exists: true,
      repo_url: repo.html_url,
      full_name: fullName,
      default_branch: repo.default_branch,
      latest_commit,
    };
  } catch {
    result = { exists: false, repo_url: null, full_name: fullName };
  }
  // Shorter TTL for "exists:false" so a freshly-created repo is detected fast.
  cacheSet(cacheKey, result, result.exists ? READ_CACHE_TTL_MS : 5_000);
  return result;
  });
}

/**
 * Read a single file from the repo.
 * @returns {{ path, content, sha, size }}
 */
export async function readFile(tenant, solutionId, filePath, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const cacheKey = `readFile::${tenant}::${solutionId}::${filePath}::${branch}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  let data;
  try {
    data = await gh('GET', `/repos/${fullName}/contents/${encodePath(filePath)}?ref=${branch}`);
  } catch (err) {
    // If the ref itself is missing, surface a workflow-aware error instead
    // of "GitHub 404 on .../contents/<path>?ref=<branch>". Otherwise let the
    // file-not-found 404 pass through.
    if (err.status === 404) {
      try {
        await assertRefExists(fullName, branch, { operation: 'read' });
      } catch (refErr) {
        if (refErr.refNotFound) throw refErr;
      }
    }
    throw err;
  }

  if (data.type !== 'file') {
    throw new Error(`${filePath} is a ${data.type}, not a file`);
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  // Populate blob cache (keyed by content SHA — durable across restarts).
  blobCacheSet(data.sha, content);
  const result = {
    path: filePath,
    content,
    sha: data.sha,
    size: data.size,
  };
  cacheSet(cacheKey, result);
  return result;
  });
}

/**
 * Read a file by its known git blob SHA — uses the SHA-keyed blob cache as a
 * fast path. Falls back to readFile (which burns 1 API quota) only on miss.
 *
 * Callers should obtain the SHA from listFiles() (1 API call gives the whole
 * tree with SHAs). The typical pattern:
 *
 *   const tree = await listFiles(tenant, solId);          // 1 API call
 *   for (const f of tree) {
 *     const file = await readFileBySha(tenant, solId, f.path, f.sha);
 *     // ^ free if we've ever seen f.sha; 1 API call only for changed/new files
 *   }
 *
 * This eliminates the "fan-out readFile per path" anti-pattern that exhausted
 * the PAT rate limit on every github-mode build_and_run.
 *
 * @returns {{ path, content, sha, size, _cached: boolean }}
 */
export async function readFileBySha(tenant, solutionId, filePath, sha, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  if (sha) {
    const cached = blobCacheGet(sha);
    if (cached !== null) {
      return {
        path: filePath,
        content: cached,
        sha,
        size: Buffer.byteLength(cached, 'utf-8'),
        _cached: true,
      };
    }
  }
  // Miss — fall through to the normal API path, which also populates the cache.
  const result = await readFile(tenant, solutionId, filePath, branch);
  return { ...result, _cached: false };
  });
}

/**
 * Write/update a single file in the repo with a commit.
 * Uses the Contents API (simpler than Trees for single files).
 */
export async function patchFile(tenant, solutionId, filePath, content, message = `Update ${filePath}`, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Validate ref BEFORE the existence check — workflow-aware error if user
  // passed a bad branch (e.g. "master" instead of "main", or a typo).
  await assertRefExists(fullName, branch, { operation: 'write' });

  // Check if file exists on the target branch (need SHA for update)
  let existingSha = null;
  try {
    const existing = await gh('GET', `/repos/${fullName}/contents/${encodePath(filePath)}?ref=${branch}`);
    existingSha = existing.sha;
  } catch { /* file doesn't exist yet — will create */ }

  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const result = await gh('PUT', `/repos/${fullName}/contents/${encodePath(filePath)}`, body);
  cacheBustRepo(tenant, solutionId);

  return {
    path: filePath,
    branch,
    commit_sha: result.commit.sha,
    commit_url: result.commit.html_url,
    created: !existingSha,
  };
  });
}

/**
 * Search-and-replace within a file in the repo, then commit.
 * Reads the current file, performs all replacements, writes back.
 * @param {string} search — exact text to find
 * @param {string} replace — text to replace with
 * @returns {{ path, commit_sha, commit_url, replacements }}
 */
export async function searchReplacePatchFile(tenant, solutionId, filePath, search, replace, message, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Validate ref BEFORE the read — workflow-aware error if user passed a
  // bad branch (typo, "master" vs "main", etc.).
  await assertRefExists(fullName, branch, { operation: 'write' });

  // Read current file from target branch
  const existing = await gh('GET', `/repos/${fullName}/contents/${encodePath(filePath)}?ref=${branch}`);
  const currentContent = Buffer.from(existing.content, 'base64').toString('utf-8');

  // Count occurrences
  const count = currentContent.split(search).length - 1;
  if (count === 0) {
    throw new Error(`Search text not found in ${filePath}. Make sure the search string matches exactly (including whitespace and line breaks).`);
  }

  // Replace
  const newContent = currentContent.replaceAll(search, replace);

  // Write back
  const body = {
    message: message || `Edit ${filePath} (${count} replacement${count > 1 ? 's' : ''})`,
    content: Buffer.from(newContent, 'utf-8').toString('base64'),
    sha: existing.sha,
    branch,
  };

  const result = await gh('PUT', `/repos/${fullName}/contents/${encodePath(filePath)}`, body);
  cacheBustRepo(tenant, solutionId);

  return {
    path: filePath,
    branch,
    commit_sha: result.commit.sha,
    commit_url: result.commit.html_url,
    replacements: count,
  };
  });
}

/**
 * Get commit history for a repo.
 * @param {number} limit — max commits to return (default 10)
 * @returns {{ commits: Array<{ sha, message, date, author }> }}
 */
export async function getLog(tenant, solutionId, limit = 10, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const cacheKey = `getLog::${tenant}::${solutionId}::${limit}::${branch}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  let commits;
  try {
    commits = await gh('GET', `/repos/${fullName}/commits?sha=${branch}&per_page=${limit}`);
  } catch (err) {
    if (err.status === 404 || err.status === 422) {
      try { await assertRefExists(fullName, branch, { operation: 'read' }); }
      catch (refErr) { if (refErr.refNotFound) throw refErr; }
    }
    throw err;
  }

  const result = {
    repo_url: `https://github.com/${fullName}`,
    commits: commits.map(c => ({
      sha: c.sha.substring(0, 7),
      full_sha: c.sha,
      message: c.commit.message,
      date: c.commit.committer.date,
      author: c.commit.author.name,
      url: c.html_url,
    })),
  };
  cacheSet(cacheKey, result);
  return result;
  });
}

/**
 * List all files in the repo (recursive tree).
 * @returns {{ path, type, size }[] }
 */
export async function listFiles(tenant, solutionId, branch = 'main') {
  return withGithubAuth(tenant, async () => {
  const cacheKey = `listFiles::${tenant}::${solutionId}::${branch}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const tree = await gh('GET', `/repos/${fullName}/git/trees/${branch}?recursive=1`);

  // Keep `sha` — callers use it for the SHA-keyed blob cache fast path
  // (readFileBySha). Without it, every file fetch costs 1 API call even when
  // the content hasn't changed since last fetch.
  const result = tree.tree
    .filter(t => t.type === 'blob')
    .map(t => ({ path: t.path, size: t.size, sha: t.sha }));
  cacheSet(cacheKey, result);
  return result;
  });
}

/**
 * Delete an entire directory from the repo (e.g. connectors/device-mock-mcp/).
 * Uses the Git Trees API: list all files under the prefix, create a tree
 * with sha=null for each, commit, and update ref.
 *
 * @param {string} tenant
 * @param {string} solutionId
 * @param {string} dirPath - Directory path to delete (e.g. "connectors/device-mock-mcp")
 * @param {string} message - Commit message
 * @returns {{ commit_sha, files_deleted }}
 */
export async function deleteDirectory(tenant, solutionId, dirPath, message = `Delete ${dirPath}`) {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Normalize: strip trailing slash
  const prefix = dirPath.replace(/\/+$/, '') + '/';

  // Delete from main branch only (single-branch model)
  const branches = ['main'];
  const results = {};

  for (const branch of branches) {
    try {
      // 1. Get current tree to find files under this directory
      const fullTree = await gh('GET', `/repos/${fullName}/git/trees/${branch}?recursive=1`);
      const toDelete = fullTree.tree.filter(t => t.type === 'blob' && t.path.startsWith(prefix));

      if (toDelete.length === 0) {
        results[branch] = { commit_sha: null, files_deleted: 0 };
        continue;
      }

      // 2. Get HEAD of this branch
      const ref = await gh('GET', `/repos/${fullName}/git/ref/heads/${branch}`);
      const headSha = ref.object.sha;
      const headCommit = await gh('GET', `/repos/${fullName}/git/commits/${headSha}`);

      // 3. Create tree with sha=null for each deleted file
      const treeItems = toDelete.map(f => ({
        path: f.path,
        mode: '100644',
        type: 'blob',
        sha: null,  // null sha = delete
      }));

      const tree = await gh('POST', `/repos/${fullName}/git/trees`, {
        base_tree: headCommit.tree.sha,
        tree: treeItems,
      });

      // 4. Commit + update ref
      const commit = await gh('POST', `/repos/${fullName}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [headSha],
      });

      await gh('PATCH', `/repos/${fullName}/git/refs/heads/${branch}`, {
        sha: commit.sha,
      });

      console.log(`[GitHub] Deleted ${toDelete.length} files under ${dirPath} from ${branch} in ${fullName}`);
      results[branch] = { commit_sha: commit.sha, files_deleted: toDelete.length };
    } catch (err) {
      console.warn(`[GitHub] Failed to delete ${dirPath} from ${branch}:`, err.message);
      results[branch] = { error: err.message, files_deleted: 0 };
    }
  }

  const totalDeleted = Object.values(results).reduce((sum, r) => sum + (r.files_deleted || 0), 0);
  if (totalDeleted > 0) cacheBustRepo(tenant, solutionId);
  return { branches: results, total_files_deleted: totalDeleted };
  });
}

/**
 * @deprecated Use pushFiles instead. Kept as alias for backward compatibility.
 */
export const pushToDev = pushFiles;

/**
 * Create a prod checkpoint (tag) on current main HEAD.
 *
 * Tag format: prod-YYYY-MM-DD-NNN
 *
 * Auto-created by `promote()` after a successful dev→main merge. Can also
 * be called directly via the deprecated /promote-old route or future
 * `ateam_github_checkpoint` tool.
 *
 * Back-compat: counter computation looks at BOTH `prod-*` and the legacy
 * `safe-*` tags from the same day so the NNN never collides during the
 * transition. listCheckpoints() returns both prefixes too.
 *
 * Use rollback(target) to revert main to any tag (prod-* or safe-*) or
 * commit SHA. Rollback is additive — history is preserved.
 */
export async function checkpoint(tenant, solutionId, label = '') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // 1. Get current main HEAD
  let mainSha;
  try {
    const mainRef = await gh('GET', `/repos/${fullName}/git/ref/heads/main`);
    mainSha = mainRef.object.sha;
  } catch {
    throw new Error('Main branch not found.');
  }

  // 2. Create date-based prod tag. Counter includes legacy safe-* tags
  // from the same day to avoid collisions during the rename transition.
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  let tagCounter = 1;
  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const todayTags = tags.filter(t =>
      t.ref.startsWith(`refs/tags/prod-${dateStr}-`) ||
      t.ref.startsWith(`refs/tags/safe-${dateStr}-`),
    );
    if (todayTags.length > 0) {
      // Each tag ends with -NNN; take the max counter and add 1.
      const counters = todayTags
        .map(t => parseInt(t.ref.split('-').pop()))
        .filter(n => !isNaN(n));
      if (counters.length > 0) tagCounter = Math.max(...counters) + 1;
    }
  } catch { /* no tags yet */ }

  const tagName = `prod-${dateStr}-${String(tagCounter).padStart(3, '0')}`;
  const tagMessage = label
    ? `Prod checkpoint: ${label}`
    : `Prod checkpoint: ${tagName}`;

  try {
    await gh('POST', `/repos/${fullName}/git/tags`, {
      tag: tagName,
      message: tagMessage,
      object: mainSha,
      type: 'commit',
    });
    await gh('POST', `/repos/${fullName}/git/refs`, {
      ref: `refs/tags/${tagName}`,
      sha: mainSha,
    });
  } catch (err) {
    throw new Error(`Could not create checkpoint tag: ${err.message}`);
  }

  return {
    ok: true,
    tag: tagName,
    label: label || null,
    commit_sha: mainSha,
    repo_url: `https://github.com/${fullName}`,
    created_at: now.toISOString(),
    _hint: `To rollback to this checkpoint: ateam_github_rollback(solution_id, tag='${tagName}')`,
  };
  });
}

/**
 * Compare two branches/refs. Returns commit list + files changed.
 * Used as pre-flight for `promote` to show what's about to ship.
 */
export async function getDiff(tenant, solutionId, base = 'main', head = 'dev') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;
  let compare;
  try {
    compare = await gh('GET', `/repos/${fullName}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  } catch (err) {
    // 404 on /compare means one of the refs doesn't exist. Probe each to
    // give the user a workflow-aware error pointing at the bad one.
    if (err.status === 404) {
      try { await assertRefExists(fullName, base, { operation: 'read' }); }
      catch (refErr) { if (refErr.refNotFound) throw new Error(`base="${base}" — ${refErr.message}`); }
      try { await assertRefExists(fullName, head, { operation: 'read' }); }
      catch (refErr) { if (refErr.refNotFound) throw new Error(`head="${head}" — ${refErr.message}`); }
    }
    throw new Error(`Cannot compare ${base}...${head}: ${err.message}`);
  }
  return {
    ahead_by: compare.ahead_by || 0,
    behind_by: compare.behind_by || 0,
    status: compare.status,
    commits: (compare.commits || []).map(c => ({
      sha: c.sha,
      message: (c.commit?.message || '').split('\n')[0].slice(0, 200),
      author: c.commit?.author?.name || c.author?.login || 'unknown',
      date: c.commit?.author?.date || null,
    })),
    files: (compare.files || []).map(f => ({
      path: f.filename,
      status: f.status,
      additions: f.additions || 0,
      deletions: f.deletions || 0,
    })),
  };
  });
}

/**
 * Merge `head` branch into `base` via GitHub's /merges API.
 * Returns null if base is already up-to-date.
 * Throws on conflict (409) — caller must resolve manually on GitHub.
 */
export async function mergeBranch(tenant, solutionId, base = 'main', head = 'dev', commit_message = '') {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;
  const message = commit_message || `Merge ${head} into ${base}`;
  let result;
  try {
    result = await gh('POST', `/repos/${fullName}/merges`, { base, head, commit_message: message });
  } catch (err) {
    // GitHub returns 204 for "already merged" — gh() returns null for that
    // 409 = merge conflict — let caller see the real error
    throw new Error(`Merge ${head} → ${base} failed: ${err.message}`);
  }
  cacheBustRepo(tenant, solutionId);
  if (!result) {
    return { ok: true, already_up_to_date: true, merge_commit_sha: null };
  }
  return {
    ok: true,
    already_up_to_date: false,
    merge_commit_sha: result.sha,
    merge_commit_url: result.html_url,
  };
  });
}

/**
 * Promote: merge `dev` → `main` and auto-tag the new main HEAD.
 * Returns the diff summary + tag.
 *
 * This is the NEW semantics. Was previously an alias for `checkpoint` (just
 * tagged the current main HEAD). The naming was misleading — "promote" should
 * mean "move dev work into the main/prod branch", which is what it does now.
 *
 * For the old behavior (tag without merge), call `checkpoint` directly.
 */
export async function promote(tenant, solutionId, options = {}) {
  return withGithubAuth(tenant, async () => {
  const { label = '', skipTag = false } = options;

  // 1. Diff first so the caller sees what's about to ship
  const diff = await getDiff(tenant, solutionId, 'main', 'dev');
  if (diff.ahead_by === 0) {
    return {
      ok: true,
      already_up_to_date: true,
      merged_commits: 0,
      _hint: 'dev is not ahead of main — nothing to promote.',
    };
  }

  // 2. Merge
  const merge = await mergeBranch(
    tenant,
    solutionId,
    'main',
    'dev',
    `Promote: merge dev → main (${diff.ahead_by} commits across ${diff.files.length} files)`,
  );

  // 3. Auto-tag the new main HEAD (best-effort — non-fatal on failure)
  let tag = null;
  if (!skipTag) {
    try {
      const tagResult = await checkpoint(tenant, solutionId, label || `promote ${diff.ahead_by}-commits`);
      tag = tagResult.tag;
    } catch (err) {
      console.warn(`[promote] Auto-tag failed (promote itself succeeded): ${err.message}`);
    }
  }

  return {
    ok: true,
    already_up_to_date: false,
    merged_commits: diff.ahead_by,
    files_changed: diff.files.length,
    merge_commit_sha: merge.merge_commit_sha,
    merge_commit_url: merge.merge_commit_url,
    tag,
    files: diff.files.slice(0, 20), // first 20 for context, rest truncated
    _hint: tag
      ? `Promoted ${diff.ahead_by} commit(s) to main. Tagged as ${tag}. Run ateam_build_and_run() to deploy main.`
      : `Promoted ${diff.ahead_by} commit(s) to main. Run ateam_build_and_run() to deploy main.`,
  };
  });
}

/**
 * List all promotion checkpoints (tags) for a solution.
 *
 * Returns both new `prod-*` tags (from current promote() flow) and legacy
 * `safe-*` tags (from older promote/checkpoint calls before the rename).
 * Both are valid rollback targets — `rollback(target)` accepts any tag
 * regardless of prefix.
 */
export async function listCheckpoints(tenant, solutionId) {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const checkpointTags = tags
      .filter(t => t.ref.startsWith('refs/tags/prod-') || t.ref.startsWith('refs/tags/safe-'))
      .sort()
      .reverse();

    const checkpoints = checkpointTags.map(t => {
      const tagName = t.ref.replace('refs/tags/', '');
      const parts = tagName.split('-'); // prod-YYYY-MM-DD-NNN or safe-YYYY-MM-DD-NNN
      return {
        tag: tagName,
        prefix: parts[0], // 'prod' (new) or 'safe' (legacy)
        date: `${parts[1]}-${parts[2]}-${parts[3]}`,
        counter: parseInt(parts[4]),
        commit_sha: t.object.sha,
      };
    });

    return { checkpoints };
  } catch (err) {
    throw new Error(`Cannot list checkpoints: ${err.message}`);
  }
  });
}

/** @deprecated Use listCheckpoints instead. */
export const listDevVersions = listCheckpoints;

/**
 * Rollback main to a previous checkpoint tag or commit SHA.
 *
 * ADDITIVE (git revert semantics): does NOT force-reset main. Instead, creates
 * a new commit on top of current main whose tree equals the target's tree.
 * Result: main contains the OLD state but the history of everything in
 * between is preserved.
 *
 * Why additive: a force-reset destroys the commits between target and current
 * main, including anything someone might want to recover. The additive
 * pattern is the standard "git revert <tag>" approach — same end state on
 * disk, no history loss.
 */
export async function rollback(tenant, solutionId, target) {
  return withGithubAuth(tenant, async () => {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // 1. Resolve target to a commit SHA. Accepts: tag name, sha, or branch ref.
  let targetSha = null;
  try {
    // Try as tag first
    const tagRef = await gh('GET', `/repos/${fullName}/git/refs/tags/${target}`);
    if (tagRef.object.type === 'tag') {
      const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${tagRef.object.sha}`);
      targetSha = tagObj.object.sha;
    } else {
      targetSha = tagRef.object.sha;
    }
  } catch {
    // Not a tag — try as commit SHA directly
    try {
      const commit = await gh('GET', `/repos/${fullName}/git/commits/${target}`);
      targetSha = commit.sha;
    } catch {
      throw new Error(`Cannot resolve "${target}" to a tag or commit SHA. Use ateam_github_list_versions to see available checkpoints.`);
    }
  }

  // 2. Get current main HEAD
  let currentSha;
  try {
    const mainRef = await gh('GET', `/repos/${fullName}/git/refs/heads/main`);
    currentSha = mainRef.object.sha;
  } catch (err) {
    throw new Error(`Cannot read main branch: ${err.message}`);
  }

  // No-op if main already at target
  if (currentSha === targetSha) {
    return {
      ok: true,
      already_at: target,
      no_op: true,
      main_commit_sha: currentSha,
      _hint: `main is already at ${target} — nothing to do.`,
    };
  }

  // 3. Get target's tree (what the old state's files looked like)
  let targetTree;
  try {
    const targetCommit = await gh('GET', `/repos/${fullName}/git/commits/${targetSha}`);
    targetTree = targetCommit.tree.sha;
  } catch (err) {
    throw new Error(`Cannot read target commit ${targetSha}: ${err.message}`);
  }

  // 4. Create a new commit on top of current main with the OLD tree.
  // Parent = current main HEAD → fast-forward update is safe (no force needed).
  let revertCommit;
  try {
    revertCommit = await gh('POST', `/repos/${fullName}/git/commits`, {
      message: `Rollback main to ${target}\n\nReverts the tree to commit ${targetSha.slice(0, 7)}.\nHistory between is preserved as commits ${currentSha.slice(0, 7)}..${revertCommit?.sha || 'this'}.`,
      tree: targetTree,
      parents: [currentSha],
    });
  } catch (err) {
    throw new Error(`Cannot create rollback commit: ${err.message}`);
  }

  // 5. Update main to point at the new commit. Fast-forward — NO force flag.
  try {
    await gh('PATCH', `/repos/${fullName}/git/refs/heads/main`, {
      sha: revertCommit.sha,
    });
  } catch (err) {
    throw new Error(`Cannot update main: ${err.message}`);
  }

  cacheBustRepo(tenant, solutionId);

  return {
    ok: true,
    rolled_back_to: target,
    target_commit_sha: targetSha,
    revert_commit_sha: revertCommit.sha,
    revert_commit_url: revertCommit.html_url,
    previous_main_sha: currentSha,
    main_branch_url: `https://github.com/${fullName}/tree/main`,
    rolled_back_at: new Date().toISOString(),
    _hint: `main now contains state from ${target} as a new commit. History preserved. Run ateam_build_and_run() to deploy. To go back to the previous main, ateam_github_rollback(solution_id, target: "${currentSha.slice(0, 7)}").`,
  };
  });
}
