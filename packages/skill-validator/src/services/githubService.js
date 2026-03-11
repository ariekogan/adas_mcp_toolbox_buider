/**
 * GitHub API client for A-Team solution repos.
 *
 * Uses raw fetch (no dependencies). All repos live under a single GitHub org/user.
 * Atomic multi-file commits via the Git Trees API.
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

function headers() {
  return {
    'Authorization': `Bearer ${PAT}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function gh(method, path, body) {
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${GITHUB_API}${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
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
 * @returns {{ repo_url, created }} — created=true if newly created
 */
export async function ensureRepo(tenant, solutionId, description = '') {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // Check if exists
  try {
    const repo = await gh('GET', `/repos/${fullName}`);
    return { repo_url: repo.html_url, full_name: fullName, created: false };
  } catch {
    // Not found — create it
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
 *
 * 1. Get current HEAD SHA + tree SHA
 * 2. Create blobs for each file
 * 3. Create a new tree with all blobs
 * 4. Create a commit pointing to the new tree
 * 5. Update the ref (main branch)
 *
 * @param {string} tenant
 * @param {string} solutionId
 * @param {{ path: string, content: string }[]} files
 * @param {string} message — commit message
 * @returns {{ commit_sha, commit_url, files_committed }}
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

  // 2. Create blobs for all files
  const treeItems = [];
  for (const file of files) {
    const blob = await gh('POST', `/repos/${fullName}/git/blobs`, {
      content: file.content,
      encoding: 'utf-8',
    });
    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

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
 * Push files to dev branch and create date-based version tag.
 * Automatically cleans up old tags (keeps last X).
 *
 * @param {string} tenant
 * @param {string} solutionId
 * @param {Array<{ path, content }>} files
 * @param {string} message - commit message
 * @param {number} keepVersions - number of old versions to keep (default 10)
 * @returns {{ branch: "dev", tag: "dev-YYYY-MM-DD-NNN", commit_sha, cleaned_tags: [] }}
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

  // 3. Create blobs for all files
  const treeItems = [];
  for (const file of files) {
    const blob = await gh('POST', `/repos/${fullName}/git/blobs`, {
      content: file.content,
      encoding: 'utf-8',
    });
    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

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

  // 7. Create date-based version tag
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Get existing tags for today to determine counter
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

  const tagName = `dev-${dateStr}-${String(tagCounter).padStart(3, '0')}`;

  // Create annotated tag
  await gh('POST', `/repos/${fullName}/git/tags`, {
    tag: tagName,
    message: `Development version: ${tagName}`,
    object: newCommit.sha,
    type: 'commit',
  });

  // Create ref for the tag
  await gh('POST', `/repos/${fullName}/git/refs`, {
    ref: `refs/tags/${tagName}`,
    sha: newCommit.sha,
  });

  // 8. Clean up old tags (keep last X)
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
    tag: tagName,
    commit_sha: newCommit.sha,
    commit_url: `https://github.com/${fullName}/commit/${newCommit.sha}`,
    dev_branch_url: `https://github.com/${fullName}/tree/${branch}`,
    cleaned_tags: cleanedTags,
  };
}

/**
 * Promote a dev version to main (production).
 *
 * Strategy:
 * 1. Find the target commit (from tag or latest dev)
 * 2. Merge dev → main via merge commit
 * 3. Create production tag on main
 * 4. Return merge result
 *
 * @param {string} tenant
 * @param {string} solutionId
 * @param {string} tagName - Optional: specific dev tag to promote (e.g., "dev-2026-03-11-005")
 *                          If omitted, uses latest dev tag
 * @returns {{ promoted: true, tag, main_branch_url, merge_commit_sha, ... }}
 */
export async function promote(tenant, solutionId, tagName = null) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // 1. Find target commit SHA
  let targetSha = null;
  let resolvedTag = tagName;

  if (tagName) {
    // Use the specified tag
    try {
      const tagRef = await gh('GET', `/repos/${fullName}/git/refs/tags/${tagName}`);
      targetSha = tagRef.object.sha;

      // If tag is annotated, get the commit SHA
      if (tagRef.object.type === 'tag') {
        const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${tagRef.object.sha}`);
        targetSha = tagObj.object.sha;
      }
    } catch (err) {
      throw new Error(`Tag not found: ${tagName}. Cannot promote.`);
    }
  } else {
    // Find latest dev tag
    try {
      const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
      const devTags = tags
        .filter(t => t.ref.startsWith('refs/tags/dev-'))
        .sort()
        .reverse(); // newest first

      if (devTags.length === 0) {
        throw new Error('No dev tags found. Deploy to dev branch first.');
      }

      const latestTagRef = devTags[0];
      resolvedTag = latestTagRef.ref.replace('refs/tags/', '');

      // Get the commit SHA from the tag
      const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${latestTagRef.object.sha}`);
      targetSha = tagObj.object.sha;
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
    const result = await gh('POST', `/repos/${fullName}/merges`, {
      base: 'main',
      head: resolvedTag, // Can reference tag by name directly
      commit_message: mergeMessage,
    });

    if (result.status === 409) {
      // Merge conflict
      throw new Error(`Merge conflict detected. Resolve manually on GitHub.`);
    }

    mergeCommit = result;
  } catch (err) {
    // If tag-based merge fails, try commit-based merge
    try {
      const result = await gh('POST', `/repos/${fullName}/merges`, {
        base: 'main',
        head: targetSha, // Use commit SHA directly
        commit_message: mergeMessage,
      });

      mergeCommit = result;
    } catch (mergeErr) {
      throw new Error(`Merge failed: ${mergeErr.message}`);
    }
  }

  // 4. Get new main ref (merge might not have created a commit if ff-only)
  let mainHeadSha = mainSha;
  try {
    const updatedMainRef = await gh('GET', `/repos/${fullName}/git/ref/heads/main`);
    mainHeadSha = updatedMainRef.object.sha;
  } catch { /* keep old value */ }

  // 5. Create production tag on main
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

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
    // Create annotated tag on main
    await gh('POST', `/repos/${fullName}/git/tags`, {
      tag: prodTagName,
      message: `Production release: ${prodTagName} (promoted from ${resolvedTag})`,
      object: mainHeadSha,
      type: 'commit',
    });

    // Create ref for the tag
    await gh('POST', `/repos/${fullName}/git/refs`, {
      ref: `refs/tags/${prodTagName}`,
      sha: mainHeadSha,
    });
  } catch (err) {
    console.warn(`Could not create production tag ${prodTagName}: ${err.message}`);
  }

  // 6. Return result
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
 *
 * @param {string} tenant
 * @param {string} solutionId
 * @returns {{ versions: Array<{ tag, date, counter, commit_sha }> }}
 */
export async function listDevVersions(tenant, solutionId) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  try {
    const tags = await gh('GET', `/repos/${fullName}/git/refs/tags`);
    const devTags = tags
      .filter(t => t.ref.startsWith('refs/tags/dev-'))
      .sort()
      .reverse(); // newest first

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
 *
 * ⚠️ DESTRUCTIVE — resets main to a specific commit.
 *
 * @param {string} tenant
 * @param {string} solutionId
 * @param {string} tagName - Prod tag to rollback to (e.g., "prod-2026-03-10-001")
 * @returns {{ rolled_back: true, tag, main_commit_sha, ... }}
 */
export async function rollback(tenant, solutionId, tagName) {
  const name = repoName(tenant, solutionId);
  const fullName = `${OWNER}/${name}`;

  // 1. Get the rollback target commit
  let targetSha = null;
  try {
    const tagRef = await gh('GET', `/repos/${fullName}/git/refs/tags/${tagName}`);
    const tagObj = await gh('GET', `/repos/${fullName}/git/tags/${tagRef.object.sha}`);
    targetSha = tagObj.object.sha;
  } catch {
    throw new Error(`Tag not found: ${tagName}`);
  }

  // 2. Update main ref to the target commit
  try {
    await gh('PATCH', `/repos/${fullName}/git/refs/heads/main`, {
      sha: targetSha,
      force: true,
    });
  } catch (err) {
    throw new Error(`Cannot rollback: ${err.message}`);
  }

  // 3. Return result
  return {
    rolled_back: true,
    tag: tagName,
    main_commit_sha: targetSha,
    main_branch_url: `https://github.com/${fullName}/tree/main`,
    rolled_back_at: new Date().toISOString(),
    warning: 'Main branch has been reset. Use with caution.',
  };
}
