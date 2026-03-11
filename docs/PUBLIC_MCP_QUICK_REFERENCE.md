# A-Team Public MCP — Quick Reference

**TL;DR version of PUBLIC_MCP_DOCUMENTATION.md**

---

## Quick Start

```python
# 1. Authenticate
from ateam import ateam_auth
ateam_auth(api_key="adas_main_abc123...")

# 2. Build and deploy
from ateam import ateam_build_and_run
result = ateam_build_and_run(
  solution={"id": "my-app", ...},
  skills=[{"id": "skill1", ...}]
)

# 3. Test
from ateam import ateam_test_skill
ateam_test_skill(
  solution_id="my-app",
  skill_id="skill1",
  message="test message"
)
```

---

## Core Tools Matrix

| Tool | Purpose | When to Use |
|------|---------|------------|
| `ateam_auth` | Authenticate | **FIRST, before anything** |
| `ateam_build_and_run` | Deploy solution | Initial deployment or full redeployment |
| `ateam_patch` | Update skill/solution | Quick incremental changes |
| `ateam_test_skill` | Test with tools | Verify behavior (tool execution) |
| `ateam_test_pipeline` | Test without tools | Debug intent/planning (no execution) |
| `ateam_test_voice` | Test voice | Multi-turn voice conversations |
| `ateam_github_push` | Push to GitHub | Create/update version snapshot |
| `ateam_github_pull` | Pull from GitHub | Restore solution from repo |
| `ateam_github_patch` | Edit GitHub file | Update connector code (single file) |
| `ateam_github_status` | Check GitHub | Is repo linked? Latest commit? |
| `ateam_github_log` | View commit history | See all versions, messages |
| `ateam_github_read` | Read GitHub file | Read any file from repo |
| `ateam_github_promote` | Promote dev→main | Move tested version to production |
| `ateam_github_list_versions` | List dev versions | See all available versions |
| `ateam_github_rollback` | Rollback main | Revert to previous production tag ⚠️ |
| `ateam_get_solution` | Read solution state | Get definition, skills, health, status |
| `ateam_list_solutions` | List all solutions | See what's deployed |
| `ateam_delete_solution` | Delete solution | Remove from Core (⚠️ destructive) |

---

## Common Tasks

### Deploy a New Solution
```python
result = ateam_build_and_run(
  solution={
    "id": "my-assistant",
    "name": "My Assistant",
    "routing": [{"intent_pattern": "calendar", "skill_id": "cal"}]
  },
  skills=[{
    "id": "cal",
    "name": "Calendar",
    "problem": {"statement": "Manage calendar"},
    "intents": [{"type": "text", "pattern": "show my calendar"}],
    "tools": [...]
  }],
  test_message="show my calendar"
)
```

### Update Intents (Fast)
```python
ateam_patch(
  solution_id="my-assistant",
  target="skill",
  skill_id="cal",
  updates={
    "intents": [
      {"type": "text", "pattern": "what's on my calendar"},
      {"type": "text", "pattern": "schedule {event} for {when}"}
    ]
  }
)
```

### Update Connector Code
```python
# 1. Edit on GitHub
ateam_github_patch(
  solution_id="my-assistant",
  path="connectors/gcal/server.js",
  content="// new code..."
)

# 2. Redeploy from GitHub
ateam_build_and_run(
  solution=...,
  skills=...,
  github=True  # Important: pull from repo, not inline
)
```

### Test a Skill
```python
# Option 1: Full test with tool execution
result = ateam_test_skill(
  solution_id="my-assistant",
  skill_id="cal",
  message="show my calendar"
)
print(result["execution"]["response"])

# Option 2: Test just intent/planning (no tools)
result = ateam_test_pipeline(
  solution_id="my-assistant",
  skill_id="cal",
  message="show my calendar"
)
print(result["intent_classification"]["matched"])
```

### Check GitHub Status
```python
status = ateam_github_status(solution_id="my-assistant")
print(f"Repo: {status['repo_url']}")
print(f"Latest: {status['latest_commit_message']}")

# View history
log = ateam_github_log(solution_id="my-assistant", limit=10)
for commit in log["commits"]:
    print(f"{commit['sha']}: {commit['message']}")
```

### Promote Dev to Production
```python
# See all available dev versions
versions = ateam_github_list_versions(solution_id="my-assistant")
print(f"Latest dev: {versions['versions'][0]['tag']}")

# Promote to production
result = ateam_github_promote(solution_id="my-assistant")
print(f"✅ Promoted {result['source_tag']} → {result['prod_tag']}")

# Rollback if needed (⚠️ destructive)
ateam_github_rollback(
  solution_id="my-assistant",
  tag="prod-2026-03-10-001",
  confirm=True
)
```

### View Solution Health
```python
health = ateam_get_solution(
  solution_id="my-assistant",
  view="health"
)
print(health["status"])  # "healthy" or "unhealthy"
print(health["all_skills_reachable"])  # true or false
```

---

## Workflow Patterns

### Pattern 1: Prototype → Test → Deploy
```python
# Define locally
solution = {...}
skills = [...]

# Test
ateam_test_pipeline(solution_id="...", skill_id="...", message="test")

# Deploy
ateam_build_and_run(solution=solution, skills=skills, test_message="test")
```

### Pattern 2: Iterate on Connector Code
```python
# Deploy with mcp_store
ateam_build_and_run(solution=..., skills=..., mcp_store={...})

# Make changes → Test → Redeploy loop
while True:
    # Edit connector code on GitHub
    ateam_github_patch(solution_id="...", path="connectors/.../server.js", content="...")

    # Redeploy from GitHub
    ateam_build_and_run(solution=..., skills=..., github=True)

    # Test
    result = ateam_test_skill(solution_id="...", skill_id="...", message="test")

    if result["ok"]:
        break
    # else: go back to GitHub and fix
```

### Pattern 3: Version Management
```python
# Every deployment auto-pushes to GitHub with version tag
ateam_build_and_run(solution=..., skills=...)

# Check available versions
log = ateam_github_log(solution_id="...", limit=20)

# Restore a specific version (if needed)
# Find the commit SHA, then:
ateam_github_pull(solution_id="...")  # pulls latest from GitHub
```

---

## Parameter Cheat Sheet

### Solution Object
```python
{
  "id": "my-app",                    # Required: unique ID
  "name": "My App",                  # Required: display name
  "version": "1.0.0",                # Required: semantic version
  "description": "What it does",     # Optional
  "handoffs": [...],                 # Optional: skill delegation
  "routing": [                       # Optional: intent-to-skill mapping
    {"intent_pattern": "calendar", "skill_id": "cal"}
  ],
  "team": {...},                     # Optional: trust rules
  "ui_plugins": [...],               # Optional: embedded UIs
  "functional_connectors": [...]     # Optional: background services
}
```

### Skill Object
```python
{
  "id": "cal",                       # Required: unique ID
  "name": "Calendar",                # Required: display name
  "slug": "calendar-skill",          # Optional: URL-friendly name
  "description": "...",              # Optional
  "problem": {                       # Required: what it solves
    "statement": "Manage calendar events..."
  },
  "identity": {...},                 # Optional: identity metadata
  "intents": [                       # Optional: how to trigger
    {"type": "text", "pattern": "show my calendar"},
    {"type": "schedule", "cron": "0 9 * * *"}
  ],
  "tools": [                         # Optional: available actions
    {
      "id": "cal_list",
      "name": "List Events",
      "description": "...",
      "input": {...}                 # JSON schema
    }
  ],
  "policy": {                        # Optional: constraints
    "constraints": ["..."],
    "guardrails": [...]
  },
  "engine": {                        # Optional: LLM config
    "temperature": 0.7,
    "max_tokens": 1000
  }
}
```

### Intent Object
```python
{
  "type": "text",                    # "text", "schedule", "webhook"
  "pattern": "show my calendar",     # Text pattern or cron/webhook spec
  "description": "User wants calendar"  # Optional
}
```

### Tool Object
```python
{
  "id": "cal_list",                  # Required: unique ID
  "name": "List Events",             # Required: display name
  "description": "Get events...",    # Required
  "input": {                         # Required: JSON schema
    "type": "object",
    "properties": {
      "days": {"type": "integer", "description": "How many days"}
    },
    "required": ["days"]
  }
}
```

---

## Error Quick Reference

| Status | Message | Fix |
|--------|---------|-----|
| 401 | Unauthorized | Check API key |
| 403 | Forbidden | Check tenant |
| 404 | Not found | Verify ID exists |
| 422 | Validation failed | Fix JSON schema |
| 409 | Already exists | Use `patch` not `build_and_run` |
| 500 | Server error | Check logs, retry |

---

## One-Liners

```python
# Authenticate
ateam_auth(api_key="adas_main_...")

# Deploy
ateam_build_and_run(solution={...}, skills=[...])

# Test
ateam_test_skill(solution_id="...", skill_id="...", message="...")

# Update
ateam_patch(solution_id="...", target="skill", skill_id="...", updates={...})

# GitHub
ateam_github_push(solution_id="...")
ateam_github_patch(solution_id="...", path="...", content="...")
ateam_build_and_run(..., github=True)

# Version Management
ateam_github_list_versions(solution_id="...")
ateam_github_promote(solution_id="...")
ateam_github_rollback(solution_id="...", tag="prod-...", confirm=True)

# Check
ateam_get_solution(solution_id="...", view="health")
ateam_list_solutions()

# Delete (⚠️ destructive)
ateam_delete_solution(solution_id="...")
```

---

## Decision Tree: Which Tool to Use?

```
Am I deploying?
  → First time? → ateam_build_and_run (with mcp_store)
  → Updating connector code? → ateam_github_patch + ateam_build_and_run (github=True)
  → Updating skill definitions? → ateam_patch (faster)
  → Full redeployment? → ateam_build_and_run

Am I testing?
  → Testing intent/planning? → ateam_test_pipeline
  → Testing full execution? → ateam_test_skill
  → Testing voice? → ateam_test_voice

Am I managing GitHub?
  → Push current state? → ateam_github_push
  → Edit a file? → ateam_github_patch
  → Redeploy from GitHub? → ateam_build_and_run (github=True)
  → View history? → ateam_github_log
  → Check status? → ateam_github_status
  → View versions? → ateam_github_list_versions
  → Promote dev→main? → ateam_github_promote
  → Rollback production? → ateam_github_rollback (⚠️ destructive)

Am I checking?
  → See all solutions? → ateam_list_solutions
  → Get solution state? → ateam_get_solution (view="definition"|"health"|"status")
  → Check GitHub? → ateam_github_status or ateam_github_log
```

---

## Typical Session Flow

```python
from ateam import *

# 1. Auth (once per session)
ateam_auth(api_key="adas_main_...")

# 2. Define solution & skills
solution = {...}
skills = [...]

# 3. Test locally
ateam_test_skill(solution_id="...", skill_id="...", message="test")

# 4. Deploy
result = ateam_build_and_run(solution=solution, skills=skills)
print(f"✅ Deployed: {result['solution_id']}")
print(f"GitHub: {result['github']['repo_url']}")

# 5. Make changes
ateam_github_patch(solution_id="...", path="...", content="...")

# 6. Redeploy
ateam_build_and_run(solution=..., skills=..., github=True)

# 7. Test again
ateam_test_skill(solution_id="...", skill_id="...", message="test")

# 8. Check health
health = ateam_get_solution(solution_id="...", view="health")
print(f"Status: {health['status']}")
```

---

## Troubleshooting

| Problem | Check | Solution |
|---------|-------|----------|
| Deploy fails | Skill schema | Validate intents, tools input |
| Test fails | Connector | Check MCP connector logs |
| Intent not matched | Pattern | Use `ateam_test_pipeline` to debug |
| GitHub not linked | Repo | Check `ateam_github_status` |
| Changes not deployed | github flag | Did you set `github=True`? |

---

## Resources

- **Full Docs:** `PUBLIC_MCP_DOCUMENTATION.md`
- **Spec:** `GET /spec/solution`, `GET /spec/skill`
- **Examples:** `/docs/examples/`
- **Status:** `GET /health`

---

**Pro Tip:** Bookmark this page. You'll use it a lot! 📌
