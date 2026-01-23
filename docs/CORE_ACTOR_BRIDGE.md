# DAL ↔ CORE Actor Bridge Architecture

## Overview

The Actor Bridge connects the DAL (Domain Authoring Layer / Toolbox Builder) to CORE (ai-dev-assistant) for actor and identity management. This allows skills built in DAL to have proper authentication and audit tracking when deployed to CORE.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DAL                                         │
│  (adas_mcp_toolbox_builder)                                             │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Frontend       │    │   Backend        │    │                  │  │
│  │                  │    │                  │    │  cpAdminBridge   │  │
│  │ SkillConnectors  │───▶│  /api/actors/*   │───▶│    Service       │  │
│  │    Panel.jsx     │    │   (routes)       │    │                  │  │
│  │                  │    │                  │    │                  │  │
│  │ "Activate        │    │                  │    │                  │  │
│  │  Identity" UI    │    │                  │    │                  │  │
│  └──────────────────┘    └──────────────────┘    └────────┬─────────┘  │
│                                                            │            │
└────────────────────────────────────────────────────────────┼────────────┘
                                                             │
                                            JSON-RPC over HTTP (MCP)
                                            x-adas-token header
                                                             │
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              CORE                                        │
│  (ai-dev-assistant)                                                     │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   MCP Server     │    │   cp.admin_api   │    │  actorRegistry   │  │
│  │                  │    │                  │    │                  │  │
│  │  /mcp endpoint   │───▶│   - listActors   │───▶│  actors.json     │  │
│  │  (port 4310)     │    │   - createActor  │    │  identities.json │  │
│  │                  │    │   - linkIdentity │    │                  │  │
│  │  tools/call      │    │   - createToken  │    │  tokenStore      │  │
│  │                  │    │   - etc...       │    │                  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### DAL Side

| Component | Location | Purpose |
|-----------|----------|---------|
| `cpAdminBridge.js` | `apps/backend/src/services/` | Service that calls CORE's MCP server |
| `actors.js` | `apps/backend/src/routes/` | REST API endpoints for actor management |
| `client.js` | `apps/frontend/src/api/` | Frontend API client functions |
| `SkillConnectorsPanel.jsx` | `apps/frontend/src/components/` | UI for "Activate Identity" |

### CORE Side

| Component | Location | Purpose |
|-----------|----------|---------|
| `cp.admin_api/core.js` | `apps/backend/tools/impl/` | Admin API facade |
| `cp.admin_api/methods/*.js` | `apps/backend/tools/impl/` | Individual API methods |
| `actorRegistry.js` | `apps/backend/utils/` | Actor storage and management |
| `tokenStore.js` | `apps/backend/utils/` | PAT (Personal Access Token) storage |
| `server.ts` | `apps/mcp-server/src/` | MCP HTTP server |

## cp.admin_api Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `listActors` | `{limit?, offset?, status?}` | `{actors[], paging}` | List all actors |
| `getActor` | `{actorId}` | `{actor, tokens[]}` | Get actor with tokens |
| `createActor` | `{actorType?, roles?, displayName?, identities?, status?}` | `{actor}` | Create new actor |
| `updateActor` | `{actorId, roles}` | `{actor}` | Update actor roles |
| `approveActor` | `{actorId}` | `{actor}` | Approve pending actor |
| `deactivateActor` | `{actorId}` | `{actor}` | Deactivate actor (soft delete) |
| `linkIdentity` | `{actorId, provider, externalId}` | `{actor}` | Link identity to actor |
| `unlinkIdentity` | `{actorId, provider, externalId}` | `{actor}` | Unlink identity from actor |
| `createToken` | `{actorId, scopes?}` | `{id, token, prefix}` | Create PAT (token shown once!) |
| `revokeToken` | `{tokenId}` | `{success}` | Revoke a token |
| `listTokens` | `{actorId}` | `{tokens[]}` | List tokens for actor |
| `listAudit` | `{limit?, date?, actorId?, action?}` | `{events[]}` | List audit events |

## Data Models

### Actor
```javascript
{
  actorId: "uuid",              // UUID v4
  actorType: "external_user",   // external_user | skill_builder | adas_builder | agent
  displayName: "John Doe",
  roles: ["external_user"],
  identities: [
    { provider: "gmail", externalId: "john@example.com" }
  ],
  status: "active",             // active | pending | inactive
  createdAt: "2026-01-23T...",
  updatedAt: "2026-01-23T...",
  isLegacy: false
}
```

### Token
```javascript
{
  id: "uuid",
  prefix: "adas_abc",           // First 8 chars for identification
  scopes: ["*"],
  createdAt: "2026-01-23T...",
  revokedAt: null,
  lastUsedAt: null
}
```

### Identity (in connector config)
```javascript
{
  from_name: "Support Bot",
  from_email: "support@example.com",
  signature: "-- Sent by ADAS",
  actor_id: "uuid",             // Linked CORE actor
  actor_display_name: "Support Bot",
  token_prefix: "adas_abc"      // For display only
}
```

## Configuration

### DAL Environment Variables

In `docker-compose.dev.yml` or `.env`:

```bash
# URL to CORE's MCP server (container name when in same Docker network)
CORE_MCP_URL=http://ai-dev-assistant-adas-mcp-1:4310/mcp

# Shared secret (must match CORE's MCP_SHARED_SECRET)
CORE_MCP_SECRET=<secret-from-core>
```

### CORE Environment Variables

```bash
# Shared secret for MCP authentication
MCP_SHARED_SECRET=<generate-random-secret>
```

### Docker Network

DAL must be on the same Docker network as CORE to communicate via container names:

```yaml
# In docker-compose.dev.yml
networks:
  adas_network:
    external: true
    name: ai-dev-assistant_default
```

## User Flow: Activate Identity

1. **User opens skill** in DAL
2. **Links a connector** (e.g., Gmail) to the skill
3. **Expands "Skill Identity"** section
4. **Enters identity details**: from_name, from_email, signature
5. **Clicks "Activate Identity"**
6. **System**:
   - Calls `findOrCreateActorForIdentity` → creates actor in CORE if needed
   - Calls `createToken` → generates PAT for the skill
   - Displays token once (user must copy it!)
   - Stores `actor_id` and `token_prefix` in skill's connector config
7. **Token is used** when skill runs in CORE for authentication

## Extending the Bridge

### Adding a New cp.admin_api Method

1. **CORE: Create method file**
   ```javascript
   // apps/backend/tools/impl/cp.admin_api/methods/newMethod.js
   import { someFunction } from "../../../../utils/actorRegistry.js";
   import { auditEvent } from "../../../../utils/auditLog.js";

   export default async function newMethod(params = {}, callerActor = null) {
     // Implementation
     await auditEvent({
       actorId: callerActor?.actorId,
       action: "admin.newMethod",
       resource: params.someId,
       metadata: { ... },
     });
     return { result };
   }
   ```

2. **CORE: Register in core.js**
   ```javascript
   import newMethod from "./methods/newMethod.js";
   const METHODS = { ..., newMethod };
   ```

3. **CORE: Add to cpAdminApi.ts (frontend client)**
   ```typescript
   export async function newMethod(params): Promise<Result> {
     return callAdminApi("newMethod", params);
   }
   ```

4. **DAL: Add to cpAdminBridge.js**
   ```javascript
   export async function newMethod(params) {
     return callAdminApi("newMethod", params);
   }
   ```

5. **DAL: Add route in actors.js**
   ```javascript
   router.post("/new-method", async (req, res) => {
     const result = await cpAdminBridge.newMethod(req.body);
     res.json(result);
   });
   ```

6. **DAL: Add to frontend client.js**
   ```javascript
   export async function newMethod(params) {
     return request('/actors/new-method', {
       method: 'POST',
       body: JSON.stringify(params)
     });
   }
   ```

### Adding Identity Support for New Connector Types

In `SkillConnectorsPanel.jsx`, update `supportsIdentity()`:

```javascript
function supportsIdentity(connectorType) {
  return ['gmail', 'mail', 'email', 'smtp', 'slack', 'teams'].some(t =>
    connectorType.toLowerCase().includes(t)
  );
}
```

Then add appropriate identity fields in the UI for that connector type.

## Deployment

### From mac2 to mac1

```bash
# 1. Commit and push both repos
cd /Users/arie/Projects/ai-dev-assistant
git add -A && git commit -m "feat: ..." && git push origin dev

cd /Users/arie/Projects/adas_mcp_toolbox_builder
git add -A && git commit -m "feat: ..." && git push origin main

# 2. Deploy CORE
cd /Users/arie/Projects/ai-dev-assistant
make deploy

# 3. Deploy DAL
ssh mac1 'cd ~/Projects/adas_mcp_toolbox_builder && \
  git fetch origin && git reset --hard origin/main && \
  /usr/local/bin/docker compose -f docker-compose.dev.yml up -d --build --force-recreate'
```

### Verifying Connection

```bash
# Test CORE MCP
ssh mac1 'curl -s http://localhost:4310/health'
# Expected: {"ok":true,"service":"adas-mcp","mode":"import"}

# Test DAL backend
ssh mac1 'curl -s http://localhost:4311/api/health'
# Expected: {"ok":true,"service":"adas_mcp_toolbox_builder-backend",...}

# Test bridge (actors API)
ssh mac1 'curl -s http://localhost:4311/api/actors'
# Expected: {"actors":[...],"paging":{...}}
```

## Troubleshooting

### 401 Unauthorized from CORE

- Check `CORE_MCP_SECRET` in DAL matches `MCP_SHARED_SECRET` in CORE
- After updating `.env`, recreate containers: `docker compose up -d --force-recreate`

### Connection Refused

- Verify CORE is running: `docker ps | grep adas-mcp`
- Verify DAL is on ADAS network: check `networks` in docker-compose.dev.yml
- Check container can resolve CORE: `docker exec dal-backend ping ai-dev-assistant-adas-mcp-1`

### Token Not Working

- Tokens are shown once only - if lost, create a new one
- Check token scopes match required permissions
- Verify actor status is "active" (not "pending" or "inactive")

## Security Considerations

1. **Shared Secret**: The `MCP_SHARED_SECRET` protects the admin API. Keep it secure.
2. **Tokens**: PATs are hashed in storage. Raw token is only shown once at creation.
3. **Audit Trail**: All admin actions are logged via `auditEvent()`.
4. **Actor Status**: Use "pending" for new actors requiring approval, "inactive" for disabled.
5. **Identity Uniqueness**: Each identity (provider::externalId) can only be linked to one actor.
