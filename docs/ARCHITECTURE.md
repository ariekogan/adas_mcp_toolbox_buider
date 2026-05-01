# A-Team Platform — Architecture Spec

**Audience:** new engineers, agent designers, integration partners.
**Purpose:** the canonical concept reference. Everything else in `docs/` is a
deep-dive on one of the concepts defined here.
**Last updated:** 2026-04-27.

---

## 0. Vision in one paragraph

A-Team is a platform for building **governed AI Teams** as complete operational
solutions. Each solution is a multi-skill assistant — one personal-assistant
solution can route the user to a calendar skill, a messaging skill, a smart-home
skill, etc. The platform handles plumbing (auth, identity, routing, handoffs,
deploy, storage, plugins), so a solution developer writes only domain logic.

The first reference implementation is **Ada** — a consumer-grade personal
assistant in `ateam-mobile`. Every platform decision is evaluated against the
question *"does this make it easier for someone to ship a polished consumer
assistant?"*

---

## 1. The four logical entities

Every solution is built from these four primitives. Get them straight first —
most platform bugs trace back to confusing one for another.

```
┌─────────────────────────────────────────────────────────────┐
│  SOLUTION  (one per tenant — the top-level deployment unit)  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  identity    actor types, admin roles, defaults        │  │
│  │  skills[]    what agents exist                         │  │
│  │  grants[]    verified claims that flow between skills  │  │
│  │  handoffs[]  who can hand off to whom; what flows      │  │
│  │  routing     channel → entry skill                     │  │
│  │  ui_plugins  visual surfaces (drawer/fullscreen/...)   │  │
│  │  platform_connectors  shared MCPs the solution uses    │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
        │                                                      │
        │ contains                                             │ uses
        ▼                                                      ▼
┌──────────────────────────────────┐    ┌────────────────────────────┐
│  SKILL  (autonomous AI role)     │    │  CONNECTOR (MCP server)    │
│  - intents (what users say)      │    │  - tools (what it can do)  │
│  - tools (what to call)          │    │  - source code (Node.js)   │
│  - role/persona (who you are)    │    │  - tenant or platform-level│
│  - policy/guardrails             │    │  - stdio (today)           │
│  - engine (planner config)       │    └────────────────────────────┘
│  - connectors[] (deps)           │
│  - ui_plugins[] (surfaces)       │
└──────────────────────────────────┘
```

### Skill
- An autonomous AI agent with one clear job (orchestrator, worker, gateway, approval).
- Defined by `skill.json`. Uses connectors for external capabilities and other skills via handoffs.
- Today: deployed as an HTTP MCP server on a dynamically allocated port (8100-8299). **Architectural debt** — should migrate to stdio (see §10).

### Connector
- An MCP server providing tools (functions the planner can call).
- **Two types:**
  - **Platform connectors** — shared across tenants, source lives in `ai-dev-assistant/connectors/`. Solution developers reference by id only. List in §6.
  - **User connectors** — tenant-scoped, source lives in `mcp_store` and the user's GitHub repo. Custom business logic.
- Transport is **stdio** (child process, JSON-RPC over stdin/stdout). Critical: never use HTTP/Express in user connector code (validator rejects).

### Solution
- The top-level deployment unit. **One solution per tenant.**
- Composes skills + connectors + grants + handoffs + routing into a working multi-agent system.
- `solution.json` is the canonical definition file.

### UI Plugin
- A visual surface the host shell renders inside its chrome.
- Two render modes: `iframe` (web) and `react-native` (mobile). `adaptive` does both.
- New `surface` field declares **where** in the host shell it renders: `drawer | fullscreen | card | header | ambient | nudge`.
- Visibility: `always | user | engine` — the latter means a skill summons it via `sys.focusUiPlugin`.
- New `surface.placement` field declares the role-based slot: `featured` (signature surface, the face of the solution), `menu` (nav-row entry), or omitted (regular plugin in the host's default list). Each host renders these roles using its own chrome conventions — solution.json stays portable.
- See `docs/UI_PLUGIN_DEVELOPMENT_GUIDE.md`, `docs/PLUGIN_PROTOCOL_SPEC.md`, and the **host contract** below for the host/solution boundary.

### Host contract — boundary between any host shell and the solutions it renders
The surface field tells a host **where** to render a plugin. The `host_contract` section of the solution spec tells a host **what it may not do** and the closed allow-list of **what it may do**. Defines:
- **Ownership matrix**: per-concern (brand chrome, identity flow, surface containers → host; tool names, domain UI, empty-state copy → solution).
- **Forbidden host behaviors**: no tool names in host code, no domain UI in host source, no shadowing solution plugins, no multi-source composition, no domain affordances in chrome, no domain seed copy.
- **Host capability allow-list**: the closed set of concerns a host may own (brand chrome, identity flow, surface containers, plugin SDK runtime, generic registry-driven scaffolding, transport — rendering only).
- **Validator drift check**: regex grep `api\.call\([\'"]([\w.]+)[\'"]` in host source, flag any tool name found outside the SDK runtime.

Why it matters: solutions become portable across hosts (web / mobile / watch / kiosk) and hosts become swappable across solutions. The drift case the contract was written for: `ateam-mobile`'s host-side `MemoryDrawer.tsx` shadowed the declared `mcp:personal-assistant-ui-mcp:memories-panel` plugin and called `memory.add` directly — schema-valid but spirit-violating.

- Spec endpoint: `GET /spec/host-contract` (also embedded in `GET /spec/solution#host_contract`).
- Origin doc: `docs/HOST_VS_SOLUTION_HANDOFF.md` (in `ateam-mobile`).
- Validator: enforces `surface.placement` enum + soft cap (≤ 3 `featured` per solution) + the engine/featured contradiction check.

---

## 2. The three runtime systems

```
                  ┌─────────────────┐
                  │   A-Team MCP    │ ← Agents talk to this
                  │  ateam-mcp      │   (Claude, Cursor, etc.)
                  │  port 4310      │
                  └────────┬────────┘
                           │ HTTP
            ┌──────────────┴──────────────┐
            ▼                             ▼
   ┌─────────────────┐           ┌─────────────────┐
   │  Skill Builder  │           │   ADAS Core     │
   │  (design-time)  │           │   (runtime)     │
   │  port 4311      │ ◄───HTTP──┤   port 4100     │
   │                 │           │                 │
   │  Builds skills  │           │ Executes them   │
   │  Stores in FS   │           │ Stores in Mongo │
   └────────┬────────┘           └─────────────────┘
            │
            ▼ pushes via HTTPS
   ┌─────────────────┐
   │     GitHub      │ ← source-of-truth versioning
   │  per-solution   │   `<tenant>--<solutionId>` repo
   │     repos       │
   └─────────────────┘
```

### A-Team MCP (`ateam-mcp`)
- The **public API surface**: `ateam_*` tools agents call (see §7).
- Stdio MCP server published as `@ateam-ai/mcp` on npm; runs in Docker as the gateway too.
- Translates tool calls to HTTP against Skill Builder.

### Skill Builder
- **Design-time** tool. Stores solution + skill definitions in **filesystem only**.
- Calls Core's API to deploy/update runtime state.
- Validator runs here — every deploy passes through validation.
- Three storage roots per tenant:
  - `<TENANTS_ROOT>/<tenant>/_builder/solutions/<solId>/solution.json`
  - `<TENANTS_ROOT>/<tenant>/_builder/<slug>/skill.json`
  - `<TENANTS_ROOT>/<tenant>/_builder/solution-packs/<name>/mcp-store/<connId>/...`
- Inner-loop: a `skill-validator` package mounted as both a library AND a sub-server (`VALIDATOR_PORT=3200`) inside the skill-builder container.

### ADAS Core
- **Runtime** engine. Stores in **MongoDB only** (per-tenant DBs `adas_<tenant>`).
- Hosts skill MCP servers as Python `streamable-http` services (port range 8100-8299).
- Hosts platform connectors as long-lived containers.

> ⚠️ **The biggest architecture rule on the platform:**
> **Core = Mongo only. Builder = FS only. They never share storage.**
> Cross-system state flows via HTTP API, never via shared filesystem or DB.

---

## 3. The four storage layers

Knowing **which store owns what** is critical — most "drift" bugs trace to writing to one but reading from another.

| Layer | Owner | What lives here | Read path |
|---|---|---|---|
| **Builder FS** | Skill Builder | Per-tenant: skill.json, solution.json, mcp-store source, exports, agent-api keys | `getMemoryRoot()` |
| **Core MongoDB** | ADAS Core | Per-tenant DB `adas_<tenant>`: skills registry, connectors registry, runtime conversation state, identity, policy. System DB `adas_system`: tenants, users, oauth states, token index | adasCoreClient |
| **GitHub** | External (source of truth) | One repo per solution: `<owner>/<tenant>--<solutionId>`. Contains solution.json + skills/* + connectors/* (user only) + .ateam/export.json | githubService |
| **`/tenants/<id>/_agent-api/keys.json`** | Skill Builder FS | The MCP API key per tenant (`adas_<tenant>_<32hex>`). Validated by attachTenant.js on every X-API-KEY request | agentApiKeyStore |

**F3 — single source of truth discipline.** GitHub is the canonical truth.
Builder FS is a read-through cache. Core Mongo is the runtime projection.
Three barriers prevent drift:

1. **Boot sync** (`gitSyncBootstrap.js`): on every Skill Builder start, walks every tenant's repos and reconciles GH → FS. See `services/gitSyncBootstrap.js`.
2. **Write coupling** (`gitSync.js`): every `solutionsStore.save()` / `skillsStore.save()` pushes to GH first (loose mode) or atomically (strict mode), then writes to FS. See `services/gitSync.js`.
3. **Union read filter** (`routes/skills.js:50`): the skills listing returns the union of `linked_skills ∪ skills[].id` so a single field divergence doesn't hide skills.

Plus: `services/platformConnectorRegistry.js` filters platform connectors out of every read/write that touches user repos — so platform-level state can't leak into per-solution storage.

---

## 4. Multi-tenancy

- **One solution per tenant** — enforced in `solutionsStore.list()` and `create()`.
- **Tenant context** via `AsyncLocalStorage`. Every request runs through `attachTenant.js` middleware which calls `runWithTenant(tenant, ...)`.
- **Tenant resolution priority:** JWT (logged-in user) → PAT (Bearer token) → X-API-KEY (`adas_<tenant>_<hex>` format) → x-adas-token shared-secret + X-ADAS-TENANT header (service-to-service).
- **`getCurrentTenant()` throws** outside ALS context — silent default-tenant fallback would be a security violation.
- **Tenant cache**: `tenantContext.refreshTenantCache()` polls Core's `/api/tenants/list` every 60s. Sends `x-adas-token` for service-to-service auth.

---

## 5. Authentication & authorization

| Auth method | Where | Used by |
|---|---|---|
| **MCP API key** `adas_<tenant>_<hex>` | `X-API-KEY` header | Agents calling A-Team MCP. Validated by Skill Builder reading `_agent-api/keys.json`. |
| **PAT (long-lived bearer)** | `Authorization: Bearer <token>` | Direct API users. 64-char hex token. Validated against `adas_system.token_index` (bcrypt hash). |
| **JWT (sessioned user)** | `Authorization: Bearer <jwt>` | Browser-session users. Issued by `/api/auth/login` (Google OAuth). |
| **Shared secret** `MCP_SHARED_SECRET` | `x-adas-token` header | Service-to-service (Skill Builder ↔ Core, admin-backend ↔ Core). |

Skill Builder's `attachTenant.js` tries each in order. Mismatched X-API-KEY → 401.

> ⚠️ **Env var naming drift** — same shared secret has three names in different repos: `ADAS_MCP_TOKEN`, `CORE_MCP_SECRET`, `MCP_SHARED_SECRET`. All resolve to the same value via fallback chains. Pick one canonical name in a future cleanup.

---

## 6. Platform connectors

Single source of truth: `services/platformConnectorRegistry.js`.

| ID | Port | What it does |
|---|---|---|
| `memory-mcp` | 7306 | Persistent cognitive memory — semantic recall, dedupe, decay. Per-actor. |
| `whatsapp-mcp` | 7305 | WhatsApp Business messaging, with whatsapp-setup UI plugin. |
| `telegram-mcp` | 7302 | Telegram messaging. |
| `gmail-mcp` | 7301 | Gmail integration (send / read / search / archive). |
| `mobile-device-mcp` | 7304 | Calendar, contacts, location, weather, battery, notifications, DND. |
| `handoff-controller-mcp` | 7309 | Skill-to-skill handoff orchestration with grant passing. |
| `internal-comm-mcp` | 7303 | Internal message queue (async skill-to-skill). |
| `browser-mcp` | 7315 | Playwright headless browser automation. |
| `docs-index-mcp` | 7311 | Source-agnostic document corpus retrieval (chunk + embed + cosine). |
| `cloud-docs-mcp` | 7312 | Unified cloud document source — Dropbox, Google Drive, ... |

Solution developers reference by `{id}` in `solution.platform_connectors[]` — never bundle the source code in their repo. Phase A (April 2026) made this a hard rule enforced at every write/read/validate touchpoint.

---

## 7. The MCP tool surface (`ateam_*`)

Agents drive the platform via these tools. Categorized:

### Discovery
- `ateam_bootstrap` — onboarding / self-introduction (call on first user message).
- `ateam_get_spec(topic)` — schema reference.
- `ateam_get_examples(type)` — working examples.
- `ateam_get_workflows()` — builder workflow state machines.

### Auth & inspection
- `ateam_auth(api_key)` — establish tenant context.
- `ateam_list_solutions()` / `ateam_get_solution(view)` — read state.
- `ateam_status_all()` / `ateam_get_connector_source()` — debug.

### Build & deploy
- `ateam_build_and_run(solution, skills, ...)` — full lifecycle (validate + deploy + push to GH). Async-first internally.
- `ateam_patch(target, skill_id, updates)` — surgical update on skill or solution; auto-redeploys.
- `ateam_redeploy(solution_id, skill_id?)` — redeploy without changes (e.g. after env update). Async-first.
- `ateam_test_skill(solution_id, skill_id, message)` — dry-run a skill.
- `ateam_conversation(solution_id, message)` — full conversation through the solution.

### GitHub
- `ateam_github_status / log / read / patch / push / pull / promote / list_versions / rollback` — version control surface.

### Skill / connector / solution lifecycle
- `ateam_delete_skill / delete_connector / delete_solution` — cleanup with full multi-store hygiene.
- `ateam_upload_connector(connector_id, github|files)` — connector code update without skill redeploy.

### Async pattern
Long-running endpoints (`build_and_run`, `redeploy`, `github_pull`) accept `{async: true}`:
- POST returns `{job_id, poll_url}` in <1s.
- Client polls `GET /deploy/jobs/<jobId>` until status `done` or `failed`.
- The MCP wrappers do this transparently — agents never see the async leak.

---

## 8. Deploy pipeline (anatomy of `ateam_build_and_run`)

```
agent
  │
  ▼ ateam_build_and_run(solution_id, github: true)
ateam-mcp wrapper
  │
  ▼ POST /deploy/solutions/<id>/github/pull-bundle  (auto-detects GH repo)
Skill Builder
  │  → reads solution.json + skills/<id>/skill.json + connectors/<id>/* from GitHub
  │  → filters out platform connectors (Phase A)
  │
  ▼ POST /api/deploy/solution {async: true}
  │  → returns {job_id, poll_url} immediately
  │
async worker:
  1. Save solution + skills to Builder FS    (gitSync write-coupling)
  2. Save mcp_store files to FS              (filtered)
  3. Upload connector source to Core         (POST /api/mcp-store/upload)
  4. Register connectors in Core             (POST /api/connectors)
  5. Deploy each skill in parallel:
        a. Enrich intents with LLM (cached)
        b. Generate Python MCP code from skill definition
        c. Save export to FS
        d. Upload MCP code to Core
        e. Pre-bind: kill any zombie holding the target port (verified)
        f. Spawn python3 mcp_server.py on assigned port
        g. Register skill in Core registry
        h. Mark phase=DEPLOYED, write back to FS via gitSync
  6. Push final state to GitHub              (single commit, atomic via Trees API)

agent polls /deploy/jobs/<job_id>
  → status: in_progress → done | failed
  → final response shape merged into job entry
```

See `apps/backend/src/routes/deploy.js`, `services/exportDeploy.js`, `apps/backend/routes/skills.js` (Core).

---

## 9. The grant economy & handoffs

The security model. **Grants** are verified claims that one skill issues, others consume.

```
gateway-skill (orchestrator)
   │ issues: pa.verified_user
   │
   ├──[handoff: orchestrator-to-life-manager]───►  life-manager
   │                                               consumes pa.verified_user
   │
   ├──[handoff: orchestrator-to-messaging]──────►  messaging-agent
   │                                               consumes pa.verified_user
   │
   └──[handoff: orchestrator-to-nutrition]──────►  nutrition-tracker
                                                   consumes pa.verified_user
```

Each handoff declares `from`, `to`, `trigger`, `grants_passed`, `grants_dropped`, `mechanism`. The platform's `handoff-controller-mcp` orchestrates the actual conversation transfer at runtime.

`security_contracts[]` formalize "tool X requires grant Y issued by skill Z" — enforced before tool execution.

See `docs/IDENTITY_ACCESS_CONTROL_SPEC.md`.

---

## 10. Known architectural debt

Honest about what's still wrong:

### A1. Skills as HTTP MCPs (should be stdio) — ✅ DONE 2026-05-01

**Migrated.** Skills are now stdio MCPs. Core's `apps/backend/utils/skillMcpClient.js` spawns each skill's `mcp_server.py` with `MCP_TRANSPORT=stdio` and pipes JSON-RPC over stdin/stdout. One session per `<tenant>::<skillSlug>`, lazy-spawned on first use, reused thereafter.

What this killed permanently:
- Port allocation in 8100-8299 — no ports used for skills
- Port-conflict bugs (4 skills sharing 8106) — impossible
- EADDRINUSE on Core restart — children die with parent, respawn fresh
- Lazy-start race + concurrent picker collision
- The `lsof`/`ss`-dependent zombie kill saga (Alpine container ships neither)
- ~400 lines of HTTP code path in `routes/skills.js`

Migration audit (all 68 skills across 10 tenants on stdio):
- ai-dev-team: 4, ateam-mcp-test: 1, dark-data: 2, dev: 15
- fleet-managment: 3, gpt-clinic: 4, main: 13, mobile-pa: 12
- smart-home: 1, test1: 1

Phases shipped: 1–5 (`5e178c53`, `dda440b8`, `c3ee6448`, `dd7d5ac1`, `40a359f3`, `b6a83a03`) on 2026-05-01.

### A2. F3 PR-5 + PR-6 (still held)
- **Pre-deploy consistency guard** — would catch FS ↔ GH drift before deploy starts. Currently writes happen optimistically.
- **`/github/patch` through gitSync** — direct GH patches don't update Builder FS until next boot sync.

Both designed; see `/Users/arie/.claude/plans/peaceful-dazzling-dijkstra.md`.

### A3. Validator tightly coupled to deploy
A pre-existing connector error blocks unrelated deploys. Brief #4 designed `skip_validation: ["connector-id"]` opt-out — not built.

### A4. `_force_redeploy: true` persists in solution.json
Should be a transient request flag, not stored state. Currently re-triggers on every deploy.

### A5. Async deploy job state in-memory
`_deployJobs` Map evicts after 30 minutes but doesn't survive Skill Builder restart. Mid-deploy restart → job_id 404 on poll.

See `docs/ARCHITECTURE_OPEN_WORK.md` (TBD) for the prioritized list.

---

## 11. Conventions

### Mode env vars (graceful degradation)
- `GITSYNC_MODE`: `loose | strict | off` — default loose. Loose tolerates GH push failures (boot sync reconciles). Strict fails fast.
- `GITHUB_ENABLED`: `true | false` — disables all GH I/O when false.
- `MCP_DEBUG_POLLS`: enables verbose async-poll logging.

### Storage paths
```
TENANTS_ROOT (default ./data/tenants)
  └── <tenant>/
      ├── _builder/                     ← Skill Builder data
      │   ├── solutions/<solId>/solution.json
      │   ├── <skillSlug>/skill.json
      │   └── solution-packs/<name>/mcp-store/<connId>/
      ├── _agent-api/keys.json          ← MCP API key
      └── connector-data/               ← per-connector sqlite/kv
```

### GitHub repo structure
```
<tenant>--<solutionId>/                 ← repo name
  ├── solution.json
  ├── skills/<skillId>/skill.json
  ├── connectors/<userConnId>/server.js + package.json + ui-dist/
  └── .ateam/
      ├── export.json                   ← full bundle for re-import
      └── deployed_at.txt
```

### Naming
- Tenant ID: `[a-z0-9][a-z0-9-]{0,28}[a-z0-9]` (validated).
- Solution ID: `[a-z0-9][a-z0-9_-]{0,127}` (validated, path-traversal-safe).
- Skill slug: kebab-case, must match `skill.id`.
- Connector ID: kebab-case, ends in `-mcp` by convention.
- API key: `adas_<tenant>_<32hex>`.
- Plugin ID: `mcp:<connector-id>:<plugin-name>`.

### Async deploy contract
```
POST /deploy/solutions/<id>/redeploy {async: true}
  ⇒ {ok: true, async: true, job_id: "...", poll_url: "/deploy/jobs/..."}

GET /deploy/jobs/<job_id>
  ⇒ {status: "in_progress" | "done" | "failed", ...rest_of_response}
```

---

## 12. Dive deeper

| Topic | Read |
|---|---|
| Solution YAML schema | `docs/SOLUTION_YAML_SCHEMA.md` |
| Skill builder workflow internals | `docs/SOLUTION_BUILDER_ARCHITECTURE.md` |
| Identity & grants in detail | `docs/IDENTITY_ACCESS_CONTROL_SPEC.md` |
| UI plugins | `docs/UI_PLUGIN_DEVELOPMENT_GUIDE.md`, `docs/PLUGIN_PROTOCOL_SPEC.md` |
| Plugin SDK API | `docs/PLUGIN_SDK_API_REFERENCE.md` |
| External developers writing connectors | `Docs/EXTERNAL_CONNECTOR_GUIDE.md` (in `ai-dev-assistant`) |
| Surface field spec hand-off | `docs/SURFACE_SPEC_HANDOFF.md` (in `ateam-mobile`) |
| Host contract spec hand-off | `docs/HOST_VS_SOLUTION_HANDOFF.md` (in `ateam-mobile`) — boundary between any host shell and the solutions it renders. Live spec at `GET /spec/host-contract`. |
| F3 storage discipline plan | `~/.claude/plans/peaceful-dazzling-dijkstra.md` |
| Roadmap (open work) | `docs/ROADMAP.md` (TBD — flag if missing) |
| Public MCP API reference | `docs/PUBLIC_MCP_DOCUMENTATION.md` |

---

## 13. The single most important rule

> **Every change to platform behavior must answer: "what's the source of truth for the field/file/state I'm touching, and which other store(s) need to be informed?"**

The 12 drift bugs we hit in Q2 2026 all came from violating this. F3 (boot sync + write coupling + union filter) makes it harder to violate — but doesn't eliminate the responsibility.
