# Project Rules

## Session Start

**IMPORTANT:** At the start of each new chat session, read the following files:
- `docs/DEVELOPMENT.md` - Build/deploy rules, environment setup, Docker commands
- `project_rules.md` - This file

## Build & Deploy

See `docs/DEVELOPMENT.md` for full details. Quick reference:

**Two-machine setup via Tailscale VPN:**
- **mac2** (MacBook-Air): Development machine, code editing, Claude Code IDE
- **mac1** (ArieMacBook-Pro): Docker runtime, deployment, running services

**Access URLs (from mac2):**
- Frontend: http://100.110.191.63:3310
- Backend API: http://100.110.191.63:4300

**Common commands:**
```bash
# Start services on mac1
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build'

# Sync changes to mac1
git add . && git commit -m "message" && git push origin dev
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && git pull origin dev'

# Stop services
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && /usr/local/bin/docker compose down'
```

---

## Documentation

### Work In Progress Documents

Store work-in-progress documents in `docs/wip/`.

**Naming convention:** `wip_[description]_[date].md`

**Examples:**
- `wip_status_2025-01-12.md` - Status report
- `wip_handover_2025-01-15.md` - Session handover
- `wip_design_2025-01-20.md` - Design document
- `wip_roadmap_2025-01-25.md` - Roadmap

**When to create:** Periodically when requested by the user.

**Types:** handover, design, status, roadmap, or any other relevant description.
