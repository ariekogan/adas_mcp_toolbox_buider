/**
 * gitsync routes — F3 PR-6.
 *
 * The agent-api's /deploy/solutions/:id/github/patch endpoint pushes file
 * changes to GitHub but historically did NOT mirror them into Builder FS.
 * Result: every external ateam_github_patch / ateam_github_write call
 * created drift — GH had the latest content, FS lagged forever.
 *
 * This route is the FS half of that flow. The agent-api calls it AFTER
 * a successful GH push so Builder FS picks up the same change atomically.
 * Because the GH push already happened, we pass skipGhPush:true through
 * the stores so they don't double-commit.
 *
 * Endpoint:
 *   POST /api/gitsync/fs-mirror
 *     body: { path, content }
 *
 * The path is repo-relative ("solution.json" / "skills/<slug>/skill.json"
 * / "connectors/<id>/<file>"). Other paths are accepted but only logged.
 */

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

import solutionsStore from '../store/solutions.js';
import skillsStore from '../store/skills.js';
import { getMemoryRoot } from '../utils/tenantContext.js';

const router = Router();

// solution-name lookup is needed to resolve connector files into the right
// solution-pack directory. Cached briefly so repeated patch flurries don't
// hammer the store.
async function getSolutionName(solutionId) {
  try {
    const sol = await solutionsStore.load(solutionId);
    return sol?.name || solutionId;
  } catch {
    return solutionId;
  }
}

router.post('/fs-mirror', async (req, res) => {
  const log = req.app.locals.log;
  try {
    const { path: repoPath, content } = req.body || {};
    if (!repoPath || typeof repoPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'path required (repo-relative)' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ ok: false, error: 'content required (string)' });
    }

    // ── solution.json ────────────────────────────────────────────────────
    if (repoPath === 'solution.json') {
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return res.status(400).json({ ok: false, error: `solution.json content is not valid JSON: ${err.message}` });
      }
      if (!parsed.id) {
        return res.status(400).json({ ok: false, error: 'solution.json content missing .id' });
      }
      await solutionsStore.save(parsed, { skipGhPush: true });
      log.info(`[gitsync/fs-mirror] mirrored solution.json (${parsed.id}) — FS-only (GH already pushed by caller)`);
      return res.json({ ok: true, kind: 'solution', solution_id: parsed.id });
    }

    // ── skills/<slug>/skill.json ────────────────────────────────────────
    const skillMatch = repoPath.match(/^skills\/([^/]+)\/skill\.json$/);
    if (skillMatch) {
      const slug = skillMatch[1];
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return res.status(400).json({ ok: false, error: `${repoPath} content is not valid JSON: ${err.message}` });
      }
      if (parsed.id && parsed.id !== slug) {
        return res.status(400).json({
          ok: false,
          error: `path slug "${slug}" disagrees with skill.id "${parsed.id}"`,
        });
      }
      // Some external patches omit .id — fill it in from the path.
      if (!parsed.id) parsed.id = slug;
      await skillsStore.save(parsed, { skipGhPush: true });
      log.info(`[gitsync/fs-mirror] mirrored skills/${slug}/skill.json — FS-only`);
      return res.json({ ok: true, kind: 'skill', skill_id: slug });
    }

    // ── connectors/<id>/<file> ──────────────────────────────────────────
    const connMatch = repoPath.match(/^connectors\/([^/]+)\/(.+)$/);
    if (connMatch) {
      const [, connId, rel] = connMatch;
      const { solutionId } = req.query;
      if (!solutionId || typeof solutionId !== 'string') {
        return res.status(400).json({
          ok: false,
          error: 'solutionId query param required for connector files (to resolve solution-pack name)',
        });
      }
      const solName = await getSolutionName(solutionId);

      // Defense-in-depth path validation — connId must be a slug, rel must
      // not escape the connector dir. Same validation pattern as deploy.js.
      const CONNECTOR_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
      if (!CONNECTOR_ID_RE.test(connId)) {
        return res.status(400).json({ ok: false, error: `Invalid connector id "${connId}"` });
      }
      const connDir = path.resolve(
        path.join(getMemoryRoot(), 'solution-packs', solName, 'mcp-store', connId)
      );
      const target = path.resolve(connDir, rel);
      if (!target.startsWith(connDir + path.sep)) {
        return res.status(400).json({ ok: false, error: `path "${rel}" escapes connector dir` });
      }

      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf-8');
      log.info(`[gitsync/fs-mirror] mirrored ${repoPath} → ${target} (FS-only)`);
      return res.json({ ok: true, kind: 'connector', connector_id: connId, fs_target: target });
    }

    // ── README, .ateam/, other metadata ─────────────────────────────────
    // Builder doesn't track these on FS today. Acknowledge the call so the
    // caller doesn't error, but log so we can see what kinds of patches
    // are flowing through.
    log.info(`[gitsync/fs-mirror] no FS target for "${repoPath}" — accepted, no-op`);
    return res.json({ ok: true, kind: 'noop', path: repoPath });
  } catch (err) {
    log.error(`[gitsync/fs-mirror] failed: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
