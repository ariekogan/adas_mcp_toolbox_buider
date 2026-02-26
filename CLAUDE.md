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
```

## Deploy to Production

```bash
./deploy.sh
```

That's it. One command. The script pushes code, pulls on mac1, and rebuilds via the ADAS Core compose.

### WHY: There is NO standalone docker-compose.yml in this repo.

The Skill Builder runs INSIDE the `ai-dev-assistant` docker-compose as `skill-builder-backend` + `skill-builder-frontend`. They share a Docker network with all other ADAS services. Running a separate compose creates an isolated network where nginx can't find `skill-builder-backend`, causing 502 errors on `app.ateam-ai.com`.

`docker-compose.local-dev.yml` exists for local dev only. Never use it on mac1.

## Production Container Inventory (mac1)

All containers run under the `ai-dev-assistant` docker-compose project.

| Container | Service | Port (host→container) | Role |
|-----------|---------|----------------------|------|
| `backend` | ADAS Core backend | 4100→4000 | Core API server |
| `frontend` | ADAS Core frontend | 3102→80 | Core UI (nginx) |
| `mongo` | MongoDB | 27017→27017 | Database |
| `skill-builder-backend` | Skill Builder API | 4311→4000, 3201→3200, 8100-8110 | Builder backend + dynamic MCP ports |
| `skill-builder-frontend` | Skill Builder UI | 3312→80 | Builder UI (nginx, proxies /api/ to backend) |
| `admin-backend` | Admin API | 4105→4000 | SysAdmin backend |
| `sysadmin-frontend` | SysAdmin UI | 3105→80 | SysAdmin panel |
| `voice-backend` | Voice API | 4200→4000 | Voice/Twilio backend |
| `voice-frontend` | Voice UI | 3200→80 | Voice UI |
| `adas-mcp` | Core MCP server | 4310→4310 | MCP protocol server |
| `trigger-runner` | Trigger engine | 3100→3100 | Scheduled triggers |
| `telegram-mcp` | Telegram connector | 7302→7302 | Telegram MCP (supergateway) |
| `gmail-mcp-adas-main` | Gmail connector | 7301→7301 | Gmail MCP (supergateway) |
| `internal-comm-mcp` | Internal comm | 7303→7303 | Internal comms MCP (supergateway) |
| `handoff-controller-mcp` | Handoff controller | 7309→7309 | Handoff MCP (supergateway) |

**Domain routing:** `app.ateam-ai.com` → Cloudflare Tunnel → mac1 → `frontend` (port 3102) for Core UI, `/builder/` → `skill-builder-frontend` (port 3312).

## Working Agreements

1. **READ EXISTING CODE FIRST** — before implementing anything
2. **DO NOT REARCHITECT** — fix what's broken, follow existing patterns
3. **Core = Mongo, Builder = FS** — never mix them up
4. **Always deploy to production** — user tests on `app.ateam-ai.com`, not localhost
5. **One solution per tenant** — enforced at code level
6. **Deploy = `./deploy.sh`** — never run docker compose manually on mac1
