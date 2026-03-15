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

/** Check if GitHub integration is enabled and configured. */
export function isEnabled() {
  return ENABLED && PAT.length > 0;
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
export async function readFile(tenant, solutionId, filePath) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const data = await gh('GET', `/repos/${fullName}/contents/${encodeURIComponent(filePath)}`);

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
export async function patchFile(tenant, solutionId, filePath, content, message = `Update ${filePath}`) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Check if file exists (need SHA for update)
  let existingSha = null;
  try {
    const existing = await gh('GET', `/repos/${fullName}/contents/${encodeURIComponent(filePath)}`);
    existingSha = existing.sha;
  } catch { /* file doesn't exist yet — will create */ }

  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
  };
  if (existingSha) body.sha = existingSha;

  const result = await gh('PUT', `/repos/${fullName}/contents/${encodeURIComponent(filePath)}`, body);

  return {
    path: filePath,
    commit_sha: result.commit.sha,
    commit_url: result.commit.html_url,
    created: !existingSha,
  };
}

/**
 * Get commit history for a repo.
 * @param {number} limit — max commits to return (default 10)
 * @returns {{ commits: Array<{ sha, message, date, author }> }}
 */
export async function getLog(tenant, solutionId, limit = 10) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const commits = await gh('GET', `/repos/${fullName}/commits?per_page=${limit}`);

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
export async function listFiles(tenant, solutionId) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  const tree = await gh('GET', `/repos/${fullName}/git/trees/main?recursive=1`);

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

  // Delete from both dev and main branches (so github_pull can't resurrect it)
  const branches = ['dev', 'main'];
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
 * Push files to dev branch and create date-based version tag.
 * Automatically cleans up old tags (keeps last X).
 * Uses parallel blob creation for speed.
 */
export async function pushToDev(tenant, solutionId, files, message = 'Update solution', keepVersions = 10) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;
  const branch = 'dev';

  // 1. Get or create dev branch
  let devSha = null;
  try {
    const ref = await gh('GET', `/repos/${fullName}/git/ref/heads/${branch}`);
    devSha = ref.object.sha;
  } catch {
    // Dev branch doesn't exist — create it from main
    try {
      const mainRef = await gh('GET', `/repos/${fullName}/git/ref/heads/main`);
      const mainSha = mainRef.object.sha;
      await gh('POST', `/repos/${fullName}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: mainSha,
      });
      devSha = mainSha;
    } catch (err) {
      throw new Error(`Cannot create dev branch: ${err.message}`);
    }
  }

  // 2. Get current tree
  const commit = await gh('GET', `/repos/${fullName}/git/commits/${devSha}`);
  const treeSha = commit.tree.sha;

  // 3. Create blobs (parallel batches of 5)
  const treeItems = await createBlobsBatch(fullName, files);

  // 4. Create tree
  const tree = await gh('POST', `/repos/${fullName}/git/trees`, {
    base_tree: treeSha,
    tree: treeItems,
  });

  // 5. Create commit
  const newCommit = await gh('POST', `/repos/${fullName}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [devSha],
  });

  // 6. Update dev branch ref
  await gh('PATCH', `/repos/${fullName}/git/refs/heads/${branch}`, {
    sha: newCommit.sha,
  });

  // 7. Create date-based version tag (with retry on 422 conflict)
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  let tagCounter = 1;
  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const todayTags = tags.filter(t => t.ref.startsWith(`refs/tags/dev-${dateStr}-`));
    if (todayTags.length > 0) {
      const lastTag = todayTags[todayTags.length - 1];
      const lastCounter = parseInt(lastTag.ref.split('-').pop());
      tagCounter = lastCounter + 1;
    }
  } catch { /* no tags yet */ }

  // Retry tag creation on 422 (conflict from concurrent deploys)
  let tagName = null;
  for (let tagAttempt = 0; tagAttempt < 3; tagAttempt++) {
    tagName = `dev-${dateStr}-${String(tagCounter + tagAttempt).padStart(3, '0')}`;
    try {
      await gh('POST', `/repos/${fullName}/git/tags`, {
        tag: tagName,
        message: `Development version: ${tagName}`,
        object: newCommit.sha,
        type: 'commit',
      });
      await gh('POST', `/repos/${fullName}/git/refs`, {
        ref: `refs/tags/${tagName}`,
        sha: newCommit.sha,
      });
      break; // success
    } catch (err) {
      if (err.status === 422 && tagAttempt < 2) {
        console.warn(`[GitHub] Tag ${tagName} already exists, trying next counter...`);
        continue;
      }
      console.warn(`[GitHub] Could not create tag ${tagName}: ${err.message}`);
      tagName = null; // tag failed, but commit succeeded
      break;
    }
  }

  // 8. Clean up old tags (keep last X) — best effort, don't fail deploy
  const cleanedTags = [];
  try {
    const allTags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const devTags = allTags
      .filter(t => t.ref.startsWith('refs/tags/dev-'))
      .sort()
      .reverse(); // newest first

    // Delete old tags
    for (let i = keepVersions; i < devTags.length; i++) {
      const oldTag = devTags[i].ref.replace('refs/tags/', '');
      try {
        await gh('DELETE', `/repos/${fullName}/git/refs/tags/${oldTag}`);
        cleanedTags.push(oldTag);
      } catch (err) {
        console.warn(`Could not delete tag ${oldTag}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`Error cleaning up tags: ${err.message}`);
  }

  return {
    branch,
    tag: tagName || `dev-${dateStr}-???`,
    commit_sha: newCommit.sha,
    commit_url: `https://github.com/${fullName}/commit/${newCommit.sha}`,
    dev_branch_url: `https://github.com/${fullName}/tree/${branch}`,
    cleaned_tags: cleanedTags,
  };
}

/**
 * Promote a dev version to main (production).
 */
export async function promote(tenant, solutionId, tagName = null) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // 1. Find target commit SHA
  let targetSha = null;
  let resolvedTag = tagName;

  if (tagName) {
    try {
      const tagRef = await gh('GET', `/repos/${fullName}/git/refs/tags/${tagName}`);
      targetSha = tagRef.object.sha;

      if (tagRef.object.type === 'tag') {
        const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${tagRef.object.sha}`);
        targetSha = tagObj.object.sha;
      }
    } catch (err) {
      throw new Error(`Tag not found: ${tagName}. Cannot promote.`);
    }
  } else {
    try {
      const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
      const devTags = tags
        .filter(t => t.ref.startsWith('refs/tags/dev-'))
        .sort()
        .reverse();

      if (devTags.length === 0) {
        throw new Error('No dev tags found. Deploy to dev branch first.');
      }

      const latestTagRef = devTags[0];
      resolvedTag = latestTagRef.ref.replace('refs/tags/', '');

      if (latestTagRef.object.type === 'tag') {
        // Annotated tag — dereference to get commit SHA
        const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${latestTagRef.object.sha}`);
        targetSha = tagObj.object.sha;
      } else {
        // Lightweight tag — object.sha IS the commit SHA
        targetSha = latestTagRef.object.sha;
      }
    } catch (err) {
      throw new Error(`Cannot find latest dev tag: ${err.message}`);
    }
  }

  // 2. Get main branch current state
  let mainSha = null;
  try {
    const mainRef = await gh('GET', `/repos/${fullName}/git/ref/heads/main`);
    mainSha = mainRef.object.sha;
  } catch {
    throw new Error('Main branch not found. Create it first.');
  }

  // 3. Create merge commit (main ← dev)
  const mergeMessage = `Promote: merge ${resolvedTag} to main`;
  let mergeCommit = null;

  try {
    mergeCommit = await gh('POST', `/repos/${fullName}/merges`, {
      base: 'main',
      head: resolvedTag,
      commit_message: mergeMessage,
    });
  } catch {
    try {
      mergeCommit = await gh('POST', `/repos/${fullName}/merges`, {
        base: 'main',
        head: targetSha,
        commit_message: mergeMessage,
      });
    } catch (mergeErr) {
      throw new Error(`Merge failed: ${mergeErr.message}`);
    }
  }

  // 4. Get new main ref
  let mainHeadSha = mainSha;
  try {
    const updatedMainRef = await gh('GET', `/repos/${fullName}/git/ref/heads/main`);
    mainHeadSha = updatedMainRef.object.sha;
  } catch { /* keep old value */ }

  // 5. Create production tag on main
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  let prodTagCounter = 1;
  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const todayProdTags = tags.filter(t => t.ref.startsWith(`refs/tags/prod-${dateStr}-`));
    if (todayProdTags.length > 0) {
      const lastTag = todayProdTags[todayProdTags.length - 1];
      const lastCounter = parseInt(lastTag.ref.split('-').pop());
      prodTagCounter = lastCounter + 1;
    }
  } catch { /* no tags yet */ }

  const prodTagName = `prod-${dateStr}-${String(prodTagCounter).padStart(3, '0')}`;

  try {
    await gh('POST', `/repos/${fullName}/git/tags`, {
      tag: prodTagName,
      message: `Production release: ${prodTagName} (promoted from ${resolvedTag})`,
      object: mainHeadSha,
      type: 'commit',
    });
    await gh('POST', `/repos/${fullName}/git/refs`, {
      ref: `refs/tags/${prodTagName}`,
      sha: mainHeadSha,
    });
  } catch (err) {
    console.warn(`Could not create production tag ${prodTagName}: ${err.message}`);
  }

  return {
    promoted: true,
    source_tag: resolvedTag,
    prod_tag: prodTagName,
    merge_commit_sha: mergeCommit?.sha || mainHeadSha,
    merge_commit_url: mergeCommit?.html_url || `https://github.com/${fullName}/commit/${mainHeadSha}`,
    main_branch_url: `https://github.com/${fullName}/tree/main`,
    promoted_at: new Date().toISOString(),
    repo_url: `https://github.com/${fullName}`,
  };
}

/**
 * List all available dev versions (tags) for a solution.
 */
export async function listDevVersions(tenant, solutionId) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const devTags = tags
      .filter(t => t.ref.startsWith('refs/tags/dev-'))
      .sort()
      .reverse();

    const versions = devTags.map(t => {
      const tagName = t.ref.replace('refs/tags/', '');
      const parts = tagName.split('-'); // dev-YYYY-MM-DD-NNN
      return {
        tag: tagName,
        date: `${parts[1]}-${parts[2]}-${parts[3]}`, // YYYY-MM-DD
        counter: parseInt(parts[4]),
        commit_sha: t.object.sha,
      };
    });

    return { versions };
  } catch (err) {
    throw new Error(`Cannot list dev versions: ${err.message}`);
  }
}

/**
 * Rollback main to a previous production tag.
 * DESTRUCTIVE — resets main to a specific commit.
 */
export async function rollback(tenant, solutionId, tagName) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  let targetSha = null;
  try {
    const tagRef = await gh('GET', `/repos/${fullName}/git/refs/tags/${tagName}`);
    const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${tagRef.object.sha}`);
    targetSha = tagObj.object.sha;
  } catch {
    throw new Error(`Tag not found: ${tagName}`);
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
    warning: 'Main branch has been reset. Use with caution.',
  };
}
