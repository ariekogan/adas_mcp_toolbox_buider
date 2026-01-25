# End-to-End Inbound Routing Architecture

## Overview

This document describes the complete flow from inbound message (email/Slack) to skill execution and reply. It covers the responsibilities of DAL (Skill Builder) and CORE (Runtime), and how they work together.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL CHANNELS                                       │
│                                                                                  │
│   ┌────────────┐                              ┌────────────┐                    │
│   │   Gmail    │                              │   Slack    │                    │
│   │  (email)   │                              │  (messages)│                    │
│   └─────┬──────┘                              └─────┬──────┘                    │
│         │                                          │                            │
│         ▼                                          ▼                            │
│   ┌────────────┐                              ┌────────────┐                    │
│   │   Gmail    │                              │   Slack    │                    │
│   │ Connector  │                              │ Connector  │                    │
│   │   (MCP)    │                              │   (MCP)    │                    │
│   └─────┬──────┘                              └─────┬──────┘                    │
│         │                                          │                            │
└─────────┼──────────────────────────────────────────┼────────────────────────────┘
          │                                          │
          │         POST /api/inbound/gmail          │  POST /api/inbound/slack
          │                                          │
          ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 CORE                                             │
│                         (ai-dev-assistant)                                       │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                        routes/inbound.js                                 │   │
│   │                                                                          │   │
│   │  • POST /api/inbound/gmail     - Receive email webhook                  │   │
│   │  • POST /api/inbound/slack     - Receive Slack message                  │   │
│   │  • POST /api/inbound/slack/events - Slack Events API                    │   │
│   │                                                                          │   │
│   └────────────────────────────────┬────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                      services/routing.js                                 │   │
│   │                                                                          │   │
│   │  • getTenantConfig()           - Load /memory/tenant.json               │   │
│   │  • resolveEmailRoute(to)       - Map email → skillSlug                  │   │
│   │  • resolveSlackRoute(mention)  - Map mention/channel → skillSlug        │   │
│   │  • getSkillIdentity(slug)      - Get skill's reply identity             │   │
│   │                                                                          │   │
│   └────────────────────────────────┬────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         jobRunner.js                                     │   │
│   │                                                                          │   │
│   │  startJob({                                                              │   │
│   │    goal: "Email from alice@...",                                        │   │
│   │    skillSlug: "my-support-skill",                                       │   │
│   │    triggerContext: { replyContext, skillIdentity },                     │   │
│   │    actor: { actorId: "external::alice@...", actorType: "external_user" }│   │
│   │  })                                                                      │   │
│   │                                                                          │   │
│   └────────────────────────────────┬────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                      worker/mainloop.js                                  │   │
│   │                                                                          │   │
│   │  • Load skill prompt & tools                                            │   │
│   │  • Execute LLM conversation                                              │   │
│   │  • Process tool calls                                                    │   │
│   │  • Generate response                                                     │   │
│   │                                                                          │   │
│   └────────────────────────────────┬────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼  (job completes)                           │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                    services/replyHandler.js                              │   │
│   │                                                                          │   │
│   │  handleJobCompletion(job):                                              │   │
│   │    • Extract response from job.result / job.history                     │   │
│   │    • Check triggerContext.replyContext                                  │   │
│   │    • Send via connector (Gmail send_email / Slack send_message)         │   │
│   │    • Apply skill identity (from_email, signature, bot_name)             │   │
│   │                                                                          │   │
│   └────────────────────────────────┬────────────────────────────────────────┘   │
│                                    │                                             │
└────────────────────────────────────┼────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          OUTBOUND TO USER                                        │
│                                                                                  │
│   ┌────────────┐                              ┌────────────┐                    │
│   │   Gmail    │  Reply email                 │   Slack    │  Thread reply      │
│   │ Connector  │  (same thread)               │ Connector  │  (same channel)    │
│   │            │◄─────────────────────────────│            │◄───────────────────│
│   └────────────┘                              └────────────┘                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### DAL (adas_mcp_toolbox_builder) - Skill Builder UI

DAL is **only** for building and configuring skills. It does **not** handle runtime routing.

| Component | Purpose |
|-----------|---------|
| `routes/tenant.js` | Store tenant config (channels, routing rules) - **UI only** |
| `routes/actors.js` | Actor management UI (via cpAdminBridge to CORE) |
| `routes/export.js` | Export skill.yaml with identity + channels |
| `services/cpAdminBridge.js` | Call CORE's cp.admin_api for actor operations |
| Frontend | UI for Tenant Channels, Skill Identity, Connectors |

**DAL outputs:**
- `skill.yaml` - Skill definition with identity
- `tenant.json` - Tenant routing configuration
- Both deployed to CORE's `/memory/` directory

### CORE (ai-dev-assistant) - Runtime

CORE handles all runtime operations: inbound routing, job execution, outbound replies.

| Component | Location | Purpose |
|-----------|----------|---------|
| `routes/inbound.js` | `/api/inbound/*` | Receive webhooks from connectors |
| `services/routing.js` | Internal | Route messages to skills |
| `services/replyHandler.js` | Internal | Send replies when jobs complete |
| `jobRunner.js` | Internal | Execute skills with actor context |
| `routes/connectors.js` | `/api/connectors/*` | Connector management + tool calls |
| `cp.admin_api` | `/mcp` | Actor management API |

## Data Flow

### 1. Inbound Email Flow

```
1. Gmail Connector receives email
   └─► POST /api/inbound/gmail
       {
         fromAddress: "alice@example.com",
         toAddress: "support@yourdomain.com",
         subject: "Help needed",
         bodyText: "I need help with...",
         threadId: "17abc..."
       }

2. Routing Service resolves skill
   └─► routing.resolveEmailRoute("support@yourdomain.com")
   └─► Reads /memory/tenant.json
   └─► Returns: { skillSlug: "support-skill" }

3. Job Runner starts job
   └─► startJob({
         goal: "Email from alice@example.com\nSubject: Help needed\n\nI need help with...",
         skillSlug: "support-skill",
         triggerContext: {
           triggerType: "email",
           replyContext: {
             type: "email",
             to: "alice@example.com",
             subject: "Re: Help needed",
             threadId: "17abc..."
           },
           skillIdentity: {
             email: {
               from_name: "Support Bot",
               from_email: "support@yourdomain.com",
               signature: "-- Support Team"
             }
           }
         },
         actor: {
           actorId: "external::alice@example.com",
           actorType: "external_user"
         }
       })

4. Skill executes
   └─► LLM processes request
   └─► Generates response

5. Job completes → Reply sent
   └─► replyHandler.handleJobCompletion(job)
   └─► Extracts response from job
   └─► Calls Gmail connector: send_email({
         to: "alice@example.com",
         subject: "Re: Help needed",
         body: "Hello! I can help you with...\n\n-- Support Team",
         threadId: "17abc...",
         from: "support@yourdomain.com"
       })
```

### 2. Inbound Slack Flow

```
1. Slack Connector receives message
   └─► POST /api/inbound/slack
       {
         userId: "U123...",
         channelId: "C456...",
         text: "@support-bot help me with this",
         threadTs: "1234567890.123456",
         ts: "1234567890.654321"
       }

2. Routing Service resolves skill
   └─► routing.resolveSlackRoute({ mentionHandle: "@support-bot" })
   └─► Returns: { skillSlug: "support-skill" }

3. Job Runner starts job
   └─► startJob({
         goal: "help me with this",
         skillSlug: "support-skill",
         triggerContext: {
           triggerType: "slack",
           replyContext: {
             type: "slack",
             channelId: "C456...",
             threadTs: "1234567890.123456"
           },
           skillIdentity: {
             slack: {
               bot_name: "Support Bot",
               bot_icon_url: "https://..."
             }
           }
         },
         actor: {
           actorId: "slack::U123...",
           actorType: "external_user"
         }
       })

4. Job completes → Reply sent
   └─► Calls Slack connector: send_message({
         channel: "C456...",
         thread_ts: "1234567890.123456",
         text: "Here's how I can help...",
         username: "Support Bot"
       })
```

## Configuration Files

### tenant.json (DAL → CORE)

Stored in DAL's `/memory/tenant.json`, deployed to CORE's `/memory/tenant.json`.

```json
{
  "tenant_id": "uuid",
  "name": "My Tenant",
  "channels": {
    "email": {
      "enabled": true,
      "connector_id": "gmail",
      "routing": {
        "mode": "dedicated_mailbox",
        "rules": [
          { "address": "support@yourdomain.com", "skill_slug": "support-skill" },
          { "address": "sales@yourdomain.com", "skill_slug": "sales-skill" }
        ]
      }
    },
    "slack": {
      "enabled": true,
      "connector_id": "slack",
      "workspace_id": "T123...",
      "routing": {
        "mode": "mention_based",
        "rules": [
          { "mention_handle": "@support-bot", "skill_slug": "support-skill" },
          { "mention_handle": "@sales-bot", "skill_slug": "sales-skill" }
        ]
      }
    }
  },
  "policies": {
    "allow_external_users": true,
    "default_skill_slug": "fallback-skill"
  }
}
```

### skill.yaml (DAL → CORE)

Includes identity for outbound replies.

```yaml
id: support-skill
name: "Support Assistant"
version: 1

identity:
  actor_ref: "agent::support-skill"
  display_name: "Support Bot"

  email:
    from_name: "Support Bot"
    from_email: "support@yourdomain.com"
    signature: |
      --
      Support Team | Powered by ADAS

  slack:
    bot_name: "Support Bot"
    bot_icon_url: "https://example.com/bot-icon.png"

channels:
  email:
    inbound:
      addresses:
        - "support@yourdomain.com"
    outbound:
      from_email: "support@yourdomain.com"

  slack:
    inbound:
      mentions:
        - "@support-bot"
    outbound:
      bot_ref: "support-bot"

connectors:
  - gmail
  - slack

role:
  persona: |
    You are a helpful support assistant...
```

## CORE Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `services/routing.js` | Load tenant config, resolve routes |
| `routes/inbound.js` | Webhook endpoints for Gmail/Slack |
| `services/replyHandler.js` | Send replies when jobs complete |

### Modified Files

| File | Changes |
|------|---------|
| `jobRunner.js` | Added `handleJobCompletion()` call in `finalizeJob()` |
| `server.js` | Registered `/api/inbound` routes |

## API Endpoints

### CORE Inbound Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/inbound/gmail` | POST | Receive email from Gmail connector |
| `/api/inbound/slack` | POST | Receive message from Slack connector |
| `/api/inbound/slack/events` | POST | Slack Events API (URL verification + events) |

### Request/Response Examples

**Gmail Inbound:**
```http
POST /api/inbound/gmail
Content-Type: application/json

{
  "fromAddress": "alice@example.com",
  "toAddress": "support@yourdomain.com",
  "subject": "Help needed",
  "bodyText": "I need help with...",
  "threadId": "17abc123",
  "messageId": "msg_123"
}

Response:
{
  "ok": true,
  "jobId": "job_abc123",
  "skillSlug": "support-skill",
  "streamUrl": "/api/job/job_abc123/stream"
}
```

**Slack Inbound:**
```http
POST /api/inbound/slack
Content-Type: application/json

{
  "userId": "U123ABC",
  "channelId": "C456DEF",
  "text": "@support-bot help me with this",
  "threadTs": "1234567890.123456",
  "ts": "1234567890.654321"
}

Response:
{
  "ok": true,
  "jobId": "job_xyz789",
  "skillSlug": "support-skill",
  "streamUrl": "/api/job/job_xyz789/stream"
}
```

## Connector Integration

### Gmail Connector Requirements

The Gmail connector must:
1. Watch for new emails (via push notification or polling)
2. POST to `/api/inbound/gmail` when email arrives
3. Support `send_email` tool for replies

### Slack Connector Requirements

The Slack connector must:
1. Subscribe to Slack Events API or RTM
2. POST to `/api/inbound/slack` or `/api/inbound/slack/events`
3. Support `send_message` tool for replies

## Deployment Flow

```
1. Build skill in DAL
   └─► Configure identity (from_email, bot_name, etc.)
   └─► Configure channels (which addresses/mentions route here)

2. Deploy skill from DAL
   └─► Export skill.yaml + tools + connectors
   └─► POST to CORE's /api/skills/import
   └─► tenant.json is deployed to /memory/

3. Configure connectors in CORE
   └─► Set up Gmail/Slack connectors with credentials
   └─► Point connector webhooks to /api/inbound/*

4. Runtime
   └─► Connector posts inbound message
   └─► CORE routes to skill, executes, sends reply
```

## Error Handling

| Error | Handling |
|-------|----------|
| No route found | Return 404, log for debugging |
| Skill not found | Return 404 from routing |
| Connector not available | Log error, skip reply (job still completes) |
| Reply send fails | Log error, job marked complete anyway |

## Monitoring & Debugging

### Logs to Watch

```bash
# Inbound processing
[inbound/gmail] From: alice@... To: support@... Subject: ...
[inbound/gmail] Routed to skill: support-skill
[inbound/gmail] Job created: job_abc123

# Reply handling
[replyHandler] Sending email to alice@example.com
[replyHandler] Email sent successfully

# Routing
[routing] No tenant.json found
[routing] No route found for: unknown@example.com
```

### Testing

```bash
# Test email routing (no CORE submission)
curl -X POST http://localhost:4000/api/inbound/gmail \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": "test@example.com",
    "toAddress": "support@yourdomain.com",
    "subject": "Test",
    "bodyText": "Hello"
  }'

# Test Slack routing
curl -X POST http://localhost:4000/api/inbound/slack \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "U123",
    "channelId": "C456",
    "text": "@support-bot test"
  }'
```

## Related Documentation

- [Tenant Channels & Skill Identity](./TENANT_CHANNELS_SKILL_IDENTITY.md) - Data models and routing logic
- [DAL ↔ CORE Actor Bridge](./CORE_ACTOR_BRIDGE.md) - Actor management integration
- [Connector System](./design/CONNECTOR_SYSTEM.md) - MCP connector architecture
