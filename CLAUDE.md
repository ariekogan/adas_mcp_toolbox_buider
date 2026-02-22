# A-Team Skill Builder

## CRITICAL ARCHITECTURE RULE — READ FIRST

**There are TWO systems. They have DIFFERENT storage. Do NOT confuse them.**

| System | Repo | Storage | Role |
|--------|------|---------|------|
| **ADAS Core** | `ai-dev-assistant` | **MongoDB ONLY. No filesystem.** | Runtime execution engine. Skills, connectors, identity, conversations — all in Mongo. |
| **Skill Builder** | `adas_mcp_toolbox_builder` (this repo) | **Filesystem ONLY (`_builder/`) + API calls to Core** | Design-time tool. Builds skills on FS, deploys to Core Mongo via API. Future: runtime monitoring. |

### Rules
- **Core = Mongo only. No FS.**
- **Builder = FS only. No Mongo.**
- **One tenant = one solution.** Both tools share the same tenant.
- **Data flow at deploy:** Builder FS → (API call) → Core Mongo. One-way push.
- **Production Docker volume:** `ai-dev-assistant/memory/<tenant>/_builder/` is the Builder's FS root. This is NOT the same as `adas_mcp_toolbox_builder/memory/` (that's the git repo, used for local dev only).
- **TENANT ISOLATION IS CRITICAL.** NEVER fallback to a default tenant. If tenant is missing, FAIL LOUDLY with an error. Cross-tenant data leaks are unacceptable.

## Project Structure

```
apps/
  frontend/     React 18 + Vite UI (port 3100 dev, 3312 prod)
  backend/      Express API server (port 4000 dev, 4311 prod)
    src/
      routes/       API routes (solutions, skills, chat, export, etc.)
      store/        Filesystem-based stores (solutions.js, skills.js)
      services/     LLM conversation, export/deploy, ADAS Core client
      utils/        Tenant context (AsyncLocalStorage), defaults
packages/
  skill-validator/  Validation library (shared)
```

## Key Architecture Decisions

- **No Redux/Zustand** — all state in App.jsx or component-local useState
- **Inline styles** via JS objects (no CSS modules)
- **Filesystem storage** under `_builder/` per tenant:
  - `_builder/solutions/<id>/solution.json` — solution architecture
  - `_builder/<skill-slug>/skill.json` — individual skill definitions
  - `_builder/_connectors/` — connector state
- **One solution per tenant** — enforced in `store/solutions.js`
- **Skills are solution-scoped** — linked via `solution.linked_skills[]`
- **ADAS Core communication** via `services/adasCoreClient.js` — forwards user JWT/PAT

## Development

```bash
# Local dev (uses local filesystem, NOT production data)
cd apps/frontend && BACKEND_PORT=4000 npx vite --port 3100
cd apps/backend && node src/server.js

# Build
cd apps/frontend && npx vite build

# Deploy to production (skill-builder only)
git push origin main
ssh mac1 "cd /Users/ariekogan333/Projects/adas_mcp_toolbox_builder && git pull origin main"
ssh mac1 "cd /Users/ariekogan333/Projects/ai-dev-assistant && export PATH=/usr/local/bin:/opt/homebrew/bin:\$PATH && docker compose build skill-builder-backend skill-builder-frontend"
ssh mac1 "cd /Users/ariekogan333/Projects/ai-dev-assistant && export PATH=/usr/local/bin:/opt/homebrew/bin:\$PATH && docker compose up -d skill-builder-backend skill-builder-frontend"
```

## Working Agreements

1. **READ EXISTING CODE FIRST** — before implementing anything
2. **DO NOT REARCHITECT** — fix what's broken, follow existing patterns
3. **Core = Mongo, Builder = FS** — never mix them up
4. **Always deploy to production** — user tests on `app.ateam-ai.com`, not localhost
5. **One solution per tenant** — enforced at code level
