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

const GH_TIMEOUT_MS = 15_000;   // 15s per API call
const GH_RETRIES = 2;           // total attempts = 2
const GH_BACKOFF_MS = 1000;     // initial backoff between retries
const BLOB_BATCH_SIZE = 5;      // parallel blob uploads

function headers() {
  return {
    'Authorization': `Bearer ${PAT}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/**
 * Core GitHub API caller with timeout + retry.
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
  const prefix = `${tenant}--`;
  const repos = await gh('GET', `/users/${OWNER}/repos?per_page=100&sort=updated`);
  return repos
    .filter(r => r.name.startsWith(prefix))
    .map(r => ({
      solutionId: r.name.slice(prefix.length),
      repo_url: r.html_url,
    }));
}

/**
 * List directory entries in a repo path.
 * @returns {Array<string>} directory names
 */
export async function listDir(tenant, solutionId, dirPath, branch = 'main') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;
  const contents = await gh('GET', `/repos/${fullName}/contents/${encodePath(dirPath)}?ref=${branch}`);
  return contents.filter(c => c.type === 'dir').map(c => c.name);
}

/**
 * Ensure a repo exists under the owner. Creates if not found.
 * Properly distinguishes 404 (not found) from other errors.
 * @returns {{ repo_url, created }} — created=true if newly created
 */
export async function ensureRepo(tenant, solutionId, description = '') {
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
}

/**
 * Atomic multi-file commit via Git Trees API.
 * Uses parallel blob creation for speed.
 */
export async function pushFiles(tenant, solutionId, files, message = 'Update solution') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // 1. Get current HEAD
  let headSha, treeSha;
  try {
    const ref = await gh('GET', `/repos/${fullName}/git/ref/heads/main`);
    headSha = ref.object.sha;
    const commit = await gh('GET', `/repos/${fullName}/git/commits/${headSha}`);
    treeSha = commit.tree.sha;
  } catch (err) {
    throw new Error(`Cannot get HEAD for ${fullName}: ${err.message}`);
  }

  // 2. Create blobs (parallel batches of 5)
  const treeItems = await createBlobsBatch(fullName, files);

  // 3. Create tree
  const tree = await gh('POST', `/repos/${fullName}/git/trees`, {
    base_tree: treeSha,
    tree: treeItems,
  });

  // 4. Create commit
  const commit = await gh('POST', `/repos/${fullName}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [headSha],
  });

  // 5. Update ref
  await gh('PATCH', `/repos/${fullName}/git/refs/heads/main`, {
    sha: commit.sha,
  });

  return {
    commit_sha: commit.sha,
    commit_url: commit.html_url,
    files_committed: files.length,
  };
}

/**
 * Get repo status — existence, latest commit, URL.
 */
export async function getRepoStatus(tenant, solutionId) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

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

    return {
      exists: true,
      repo_url: repo.html_url,
      full_name: fullName,
      default_branch: repo.default_branch,
      latest_commit,
    };
  } catch {
    return { exists: false, repo_url: null, full_name: fullName };
  }
}

/**
 * Read a single file from the repo.
 * @returns {{ path, content, sha, size }}
 */
export async function readFile(tenant, solutionId, filePath, branch = 'main') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const data = await gh('GET', `/repos/${fullName}/contents/${encodePath(filePath)}?ref=${branch}`);

  if (data.type !== 'file') {
    throw new Error(`${filePath} is a ${data.type}, not a file`);
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return {
    path: filePath,
    content,
    sha: data.sha,
    size: data.size,
  };
}

/**
 * Write/update a single file in the repo with a commit.
 * Uses the Contents API (simpler than Trees for single files).
 */
export async function patchFile(tenant, solutionId, filePath, content, message = `Update ${filePath}`, branch = 'main') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

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

  return {
    path: filePath,
    branch,
    commit_sha: result.commit.sha,
    commit_url: result.commit.html_url,
    created: !existingSha,
  };
}

/**
 * Search-and-replace within a file in the repo, then commit.
 * Reads the current file, performs all replacements, writes back.
 * @param {string} search — exact text to find
 * @param {string} replace — text to replace with
 * @returns {{ path, commit_sha, commit_url, replacements }}
 */
export async function searchReplacePatchFile(tenant, solutionId, filePath, search, replace, message, branch = 'main') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

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

  return {
    path: filePath,
    branch,
    commit_sha: result.commit.sha,
    commit_url: result.commit.html_url,
    replacements: count,
  };
}

/**
 * Get commit history for a repo.
 * @param {number} limit — max commits to return (default 10)
 * @returns {{ commits: Array<{ sha, message, date, author }> }}
 */
export async function getLog(tenant, solutionId, limit = 10, branch = 'main') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const commits = await gh('GET', `/repos/${fullName}/commits?sha=${branch}&per_page=${limit}`);

  return {
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
}

/**
 * List all files in the repo (recursive tree).
 * @returns {{ path, type, size }[] }
 */
export async function listFiles(tenant, solutionId, branch = 'main') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const tree = await gh('GET', `/repos/${fullName}/git/trees/${branch}?recursive=1`);

  return tree.tree
    .filter(t => t.type === 'blob')
    .map(t => ({ path: t.path, size: t.size }));
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
  return { branches: results, total_files_deleted: totalDeleted };
}

/**
 * @deprecated Use pushFiles instead. Kept as alias for backward compatibility.
 */
export const pushToDev = pushFiles;

/**
 * Create a safe checkpoint (tag) on current main HEAD.
 * Tags format: safe-YYYY-MM-DD-NNN
 * Use rollback() to revert to a checkpoint if something breaks.
 */
export async function checkpoint(tenant, solutionId, label = '') {
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

  // 2. Create date-based safe tag
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  let tagCounter = 1;
  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const todayTags = tags.filter(t => t.ref.startsWith(`refs/tags/safe-${dateStr}-`));
    if (todayTags.length > 0) {
      const lastTag = todayTags[todayTags.length - 1];
      const lastCounter = parseInt(lastTag.ref.split('-').pop());
      tagCounter = lastCounter + 1;
    }
  } catch { /* no tags yet */ }

  const tagName = `safe-${dateStr}-${String(tagCounter).padStart(3, '0')}`;
  const tagMessage = label
    ? `Safe checkpoint: ${label}`
    : `Safe checkpoint: ${tagName}`;

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
}

/** @deprecated Use checkpoint instead. Kept for backward compatibility. */
export const promote = checkpoint;

/**
 * List all safe checkpoints for a solution.
 */
export async function listCheckpoints(tenant, solutionId) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const safeTags = tags
      .filter(t => t.ref.startsWith('refs/tags/safe-'))
      .sort()
      .reverse();

    const checkpoints = safeTags.map(t => {
      const tagName = t.ref.replace('refs/tags/', '');
      const parts = tagName.split('-'); // safe-YYYY-MM-DD-NNN
      return {
        tag: tagName,
        date: `${parts[1]}-${parts[2]}-${parts[3]}`,
        counter: parseInt(parts[4]),
        commit_sha: t.object.sha,
      };
    });

    return { checkpoints };
  } catch (err) {
    throw new Error(`Cannot list checkpoints: ${err.message}`);
  }
}

/** @deprecated Use listCheckpoints instead. */
export const listDevVersions = listCheckpoints;

/**
 * Rollback main to a previous checkpoint tag.
 * DESTRUCTIVE — force-resets main to a specific commit.
 */
export async function rollback(tenant, solutionId, tagName) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Auto-checkpoint current state before rollback (skip if HEAD is already a checkpoint)
  let autoCheckpoint = null;
  try {
    // Get current main HEAD
    const mainRef = await gh('GET', `/repos/${fullName}/git/refs/heads/main`);
    const currentSha = mainRef.object.sha;

    // Check if any safe-* tag already points at this exact commit
    let alreadyTagged = false;
    try {
      const tags = await gh('GET', `/repos/${fullName}/tags?per_page=10`);
      alreadyTagged = tags.some(t => t.name.startsWith('safe-') && t.commit.sha === currentSha);
    } catch { /* ignore — be safe and create checkpoint */ }

    if (!alreadyTagged) {
      autoCheckpoint = await checkpoint(tenant, solutionId, `before-rollback-to-${tagName}`);
      console.log(`[GitHub] Auto-checkpoint created: ${autoCheckpoint.tag} (before rollback to ${tagName})`);
    } else {
      console.log(`[GitHub] Skipping auto-checkpoint — current HEAD already has a safe-* tag`);
    }
  } catch (cpErr) {
    console.warn(`[GitHub] Could not auto-checkpoint before rollback: ${cpErr.message}`);
    // Continue with rollback anyway — user explicitly requested it
  }

  let targetSha = null;
  try {
    const tagRef = await gh('GET', `/repos/${fullName}/git/refs/tags/${tagName}`);
    // Handle both annotated and lightweight tags
    if (tagRef.object.type === 'tag') {
      const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${tagRef.object.sha}`);
      targetSha = tagObj.object.sha;
    } else {
      targetSha = tagRef.object.sha;
    }
  } catch {
    throw new Error(`Checkpoint not found: ${tagName}. Use ateam_github_list_versions to see available checkpoints.`);
  }

  try {
    await gh('PATCH', `/repos/${fullName}/git/refs/heads/main`, {
      sha: targetSha,
      force: true,
    });
  } catch (err) {
    throw new Error(`Cannot rollback: ${err.message}`);
  }

  return {
    rolled_back: true,
    tag: tagName,
    main_commit_sha: targetSha,
    main_branch_url: `https://github.com/${fullName}/tree/main`,
    rolled_back_at: new Date().toISOString(),
    ...(autoCheckpoint && { auto_checkpoint: autoCheckpoint.tag }),
    _hint: autoCheckpoint
      ? `Pre-rollback state saved as ${autoCheckpoint.tag}. To undo: ateam_github_rollback(solution_id, tag: "${autoCheckpoint.tag}")`
      : 'Warning: could not save pre-rollback state.',
  };
}
