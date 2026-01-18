# ToolBox Factory - Development Environment

## Overview

This document describes the development environment setup for the ToolBox Factory project.

## Environment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TAILSCALE VPN                                  │
│                                                                          │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐   │
│  │        MAC 2            │          │           MAC 1              │   │
│  │   (Development)         │   SSH    │       (Deployment)           │   │
│  │                         │ ──────►  │                              │   │
│  │  MacBook-Air.local      │          │  ArieMacBook-Pro.local       │   │
│  │  User: arie             │          │  User: ariekogan333          │   │
│  │  Home: /Users/arie      │          │  Home: /Users/ariekogan333   │   │
│  │                         │          │                              │   │
│  │  - Code editing         │          │  - Docker runtime            │   │
│  │  - Git operations       │          │  - Container builds          │   │
│  │  - Claude Code IDE      │          │  - Running services          │   │
│  │                         │          │                              │   │
│  │  Project:               │          │  Project:                    │   │
│  │  ~/Projects/adas_mcp_   │          │  ~/Projects/adas_mcp_        │   │
│  │  toolbox_builder        │          │  toolbox_builder             │   │
│  └─────────────────────────┘          └─────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ git push/pull
                                    ▼
                          ┌─────────────────────┐
                          │       GitHub        │
                          │                     │
                          │  ariekogan/adas_    │
                          │  mcp_toolbox_buider │
                          │                     │
                          │  Branches:          │
                          │  - main (stable)    │
                          │  - dev (active)     │
                          └─────────────────────┘
```

## Machine Details

### MAC 2 - Development Machine

| Property | Value |
|----------|-------|
| Hostname | MacBook-Air.local |
| User | arie |
| Home Directory | /Users/arie |
| Project Path | /Users/arie/Projects/adas_mcp_toolbox_builder |
| SSH Alias | (local) |
| Role | Code editing, git operations |

### MAC 1 - Deployment Machine

| Property | Value |
|----------|-------|
| Hostname | ArieMacBook-Pro.local |
| User | ariekogan333 |
| Home Directory | /Users/ariekogan333 |
| Project Path | /Users/ariekogan333/Projects/adas_mcp_toolbox_builder |
| SSH Alias | mac1 |
| Role | Docker runtime, running services |
| Docker Path | /usr/local/bin/docker |

### Network (Tailscale)

Both machines are connected via Tailscale VPN.

| Machine | Tailscale IP | Note |
|---------|--------------|------|
| MAC 1 | 100.110.191.63 | Docker host |
| MAC 2 | (local) | Development machine |

**SSH Config** (`~/.ssh/config` on mac2):
```bash
Host mac1
    HostName 100.110.191.63
    User ariekogan333
```

**Note:** If Tailscale IP changes, update the SSH config accordingly.

## Git Workflow

### Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready code |
| `dev` | Active development branch |

### Development Flow

```
1. Work on dev branch (mac2)
   └── Edit code
   └── Test locally via SSH to mac1
   └── Commit changes

2. When stable
   └── Merge dev → main
   └── Push to GitHub
   └── Deploy on mac1
```

### Common Git Commands

```bash
# Start new work (on mac2)
git checkout dev
git pull origin dev

# After making changes
git add .
git commit -m "Description of changes"
git push origin dev

# When ready to release (stable build)
git checkout main
git merge dev
git push origin main
git checkout dev

# Sync mac1 with latest code (ensure on dev branch)
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && git checkout dev && git pull origin dev'
```

## Docker Commands

All Docker commands run on **mac1** via SSH from mac2.

### Start Development Environment

```bash
# From mac2
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build'
```

### Stop Environment

```bash
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose down'
```

### View Logs

```bash
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose logs -f'
```

### Rebuild Single Service

```bash
# Rebuild backend only
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build backend'
```

## Service Ports

| Service | Internal Port | Host Port (Dev) | Host Port (Prod) |
|---------|--------------|-----------------|------------------|
| Backend | 4000 | 4300 | 4300 |
| Frontend (Dev) | 3100 | 3310 | - |
| Frontend (Prod) | 80 | - | 3300 |

### Access URLs (from mac2)

- **Frontend (Dev):** http://100.110.191.63:3310
- **Backend API:** http://100.110.191.63:4300
- **Health Check:** http://100.110.191.63:4300/api/health

Or using SSH alias:
- http://mac1:3310
- http://mac1:4300

## Configuration

### Environment Variables

Create `.env` file on mac1 (not committed to git):

```bash
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && cp .env.example .env'
# Then edit .env with your API keys
```

Required variables:
```env
# LLM Configuration
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Ports (optional, defaults shown)
FRONTEND_HOST_PORT=3300
BACKEND_HOST_PORT=4300
VITE_DEV_HOST_PORT=3310
```

## Quick Reference

### Daily Development Workflow

```bash
# 1. Start work (mac2)
cd ~/Projects/adas_mcp_toolbox_builder
git checkout dev
git pull

# 2. Start services (run once, keep running)
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build'

# 3. Make code changes locally on mac2
#    (hot reload will pick up changes for frontend)

# 4. For backend changes, sync to mac1
git add . && git commit -m "changes" && git push
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && git pull'
# Docker will auto-restart with --watch

# 5. Test in browser
open http://mac1:3310

# 6. End of day - stop services
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  /usr/local/bin/docker compose down'
```

### Troubleshooting

**Docker not found on mac1:**
```bash
# Use full path
/usr/local/bin/docker compose ...
```

**pnpm TTY error:**
- Already fixed with `CI=true` in docker-compose.dev.yml

**Services not starting:**
```bash
# Check logs
ssh mac1 '/usr/local/bin/docker logs adas_mcp_toolbox_builder-backend-1'
ssh mac1 '/usr/local/bin/docker logs adas_mcp_toolbox_builder-frontend-1'
```

**Port already in use:**
```bash
ssh mac1 '/usr/local/bin/docker compose down'
ssh mac1 'lsof -i :4300'  # Check what's using the port
```

**Docker "port already allocated" but nothing using it (Docker Desktop bug):**
```bash
# This is a known Docker Desktop bug where ports remain "allocated" after container stops
# Solution 1: Change the port in .env
ssh mac1 "sed -i '' 's/VITE_DEV_HOST_PORT=3311/VITE_DEV_HOST_PORT=3312/' ~/Projects/adas_mcp_toolbox_builder/.env"

# Solution 2: Full Docker cleanup and restart
ssh mac1 '/usr/local/bin/docker compose -f ~/Projects/adas_mcp_toolbox_builder/docker-compose.yml -f ~/Projects/adas_mcp_toolbox_builder/docker-compose.dev.yml down --volumes --remove-orphans'
ssh mac1 '/usr/local/bin/docker network prune -f'
ssh mac1 '/usr/local/bin/docker system prune -f'

# Solution 3: Restart Docker Desktop (last resort)
ssh mac1 "osascript -e 'tell app \"Docker\" to quit' && sleep 5 && open -a Docker && sleep 60"
```

**Docker credential error (docker-credential-desktop not found):**
```bash
# Remove credsStore from docker config
ssh mac1 "sed -i '' 's/\"credsStore\": \"desktop\"/\"credsStore\": \"\"/' ~/.docker/config.json"
```
