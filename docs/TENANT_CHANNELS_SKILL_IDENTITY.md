# Tenant Channels & Skill Identity Architecture

## Overview

This document defines the architecture for:
1. **Tenant-level communication channels** (infrastructure)
2. **Skill-level identity** (who the skill is)
3. **Routing** (how messages reach skills)
4. **Actor attribution** (who sent, who received, delegation)

---

## Core Principles

1. **Channels are tenant-level resources** - configured once, shared by skills
2. **Identity belongs to the skill** - independent of channels
3. **Skills reply on the same channel they were contacted** - automatic
4. **Actors are the glue** - bind channel identities to logical entities (humans or skills)

---

## Data Models

### 1. Tenant Configuration

```typescript
TenantConfig = {
  tenant_id: string,                    // UUID
  name: string,

  // Communication channels (infrastructure)
  channels: {
    email?: EmailChannelConfig,
    slack?: SlackChannelConfig,
    whatsapp?: WhatsAppChannelConfig,   // Future
  },

  // Policies
  policies: {
    allow_external_users: boolean,      // Auto-provision actors for unknown senders
    default_skill_slug?: string,        // Fallback if routing fails
  }
}
```

### 2. Channel Configurations (Tenant-Level)

```typescript
// Base channel config
ChannelConfig = {
  enabled: boolean,
  connector_id: string,                 // Reference to MCP connector
}

// Email (Gmail/SMTP)
EmailChannelConfig = ChannelConfig & {
  // Routing rules: which skill handles which address
  routing: {
    mode: 'dedicated_mailbox' | 'plus_addressing',
    rules: EmailRoutingRule[],
  }
}

EmailRoutingRule = {
  address: string,                      // e.g., "swdev2@yourdomain.com"
  skill_slug: string,                   // e.g., "swdev2"
}

// Slack
SlackChannelConfig = ChannelConfig & {
  workspace_id: string,

  routing: {
    mode: 'mention_based' | 'channel_per_skill',
    rules: SlackRoutingRule[],
  }
}

SlackRoutingRule = {
  // For mention_based
  mention_handle?: string,              // e.g., "@swdev2"
  bot_user_id?: string,                 // Slack bot user ID

  // For channel_per_skill
  channel_id?: string,                  // e.g., "C0123..."

  skill_slug: string,
}
```

### 3. Skill Identity (Skill-Level)

```typescript
SkillIdentity = {
  // Logical reference to the skill's actor in CORE
  actor_ref: string,                    // e.g., "agent::swdev2"

  // Display properties
  display_name: string,                 // e.g., "SWDev2 Bot"
  avatar_url?: string,

  // Channel-specific identity overrides
  channel_identities: {
    email?: {
      from_name: string,                // Display name in emails
      from_email: string,               // e.g., "swdev2@yourdomain.com"
      signature?: string,
    },
    slack?: {
      bot_name?: string,                // Override bot display name
      bot_icon_url?: string,
    }
  }
}
```

### 4. Skill Channels Configuration (Skill-Level)

```typescript
SkillChannelsConfig = {
  // Which channels can reach this skill (inbound)
  inbound: {
    email?: {
      addresses: string[],              // e.g., ["swdev2@yourdomain.com"]
    },
    slack?: {
      mentions: string[],               // e.g., ["@swdev2"]
      channels?: string[],              // e.g., ["C0123"] for channel-per-skill
    }
  },

  // Outbound identity (uses skill identity by default)
  // This section is optional - skills reply as themselves
  outbound: {
    email?: {
      from_email: string,               // Override: which address to send from
    },
    slack?: {
      bot_ref: string,                  // Override: which bot to use
    }
  }
}
```

---

## Actor Model

### Actor Types

```typescript
ActorType =
  | 'external_user'     // Human user contacting the system
  | 'skill_builder'     // Human using DAL to build skills
  | 'adas_builder'      // Human using ADAS admin
  | 'agent'             // Skill/Agent actor (the skill's identity)
  | 'service'           // Internal service account
```

### Actor Structure

```typescript
Actor = {
  actorId: string,                      // UUID
  actorType: ActorType,
  displayName: string,

  // Channel identities (how this actor is known on each channel)
  identities: Identity[],

  // Authentication
  tokens: Token[],

  // Metadata
  roles: string[],
  status: 'active' | 'pending' | 'inactive',
  createdAt: string,
  updatedAt: string,
}

Identity = {
  provider: 'gmail' | 'slack' | 'whatsapp',
  externalId: string,                   // Email address, Slack user ID, etc.
}
```

### Skill Actor vs Human Actor

| Aspect | Human Actor | Skill Actor |
|--------|-------------|-------------|
| `actorType` | `external_user` | `agent` |
| `displayName` | "Alice Smith" | "agent::swdev2" |
| `identities` | User's email/slack | Skill's mailbox/bot |
| Created | Auto-provisioned on first contact | Created when skill is deployed |

---

## Message Attribution

Every message has these attributes:

```typescript
MessageAttribution = {
  // Who actually sent (on the channel)
  senderActorId: string,

  // Which skill handles this
  targetSkillSlug: string,

  // Delegation chain (optional)
  onBehalfOfActorId?: string,           // Human in delegation scenarios
  delegationChain?: string[],           // Full chain for nested delegation
}
```

### Attribution Scenarios

**Case A: Human → Skill**
```
senderActorId = human actor (alice@example.com)
targetSkillSlug = "swdev2"
onBehalfOfActorId = null (no delegation)
```

**Case B: Skill → Skill (agent-to-agent)**
```
senderActorId = agent actor (agent::skill-a)
targetSkillSlug = "skill-b"
onBehalfOfActorId = human actor (if acting on behalf of someone)
```

**Case C: Skill replies to Human**
```
senderActorId = agent actor (agent::swdev2)
targetActorId = human actor (alice@example.com)
channel = same as inbound (email → email, slack → slack)
```

---

## Routing Resolution

### Gmail Routing (Dedicated Mailbox)

```
Input: Incoming email
  - To: swdev2@yourdomain.com
  - From: alice@example.com

Step 1: Resolve sender → human actor
  - Lookup: (gmail, alice@example.com)
  - Result: actorId or auto-provision new actor

Step 2: Route recipient → skillSlug
  - Lookup: tenant.channels.email.routing.rules
  - Match: address == "swdev2@yourdomain.com"
  - Result: skill_slug = "swdev2"

Step 3: Load skill identity → skill actor
  - Lookup: skill.identity.actor_ref = "agent::swdev2"
  - Resolve: actorId for skill

Step 4: Create job
  - ownerActorId = senderActorId (human)
  - skillActorId = skill actor
  - channel = email
  - replyTo = alice@example.com
```

### Slack Routing (Mention-Based)

```
Input: Slack message
  - Channel: #general
  - User: U123... (alice)
  - Text: "@swdev2 help me with this"

Step 1: Resolve sender → human actor
  - Lookup: (slack, U123...)
  - Result: actorId

Step 2: Route mention → skillSlug
  - Parse: mentions in text
  - Lookup: tenant.channels.slack.routing.rules
  - Match: mention_handle == "@swdev2"
  - Result: skill_slug = "swdev2"

Step 3: Load skill identity → skill actor
  - Same as email

Step 4: Create job
  - Same pattern, but channel = slack
  - replyTo = channel + thread_ts
```

---

## skill.yaml Schema (New)

```yaml
# Metadata
id: swdev2
name: "Software Developer Assistant"
version: 1

# NEW: Skill Identity
identity:
  actor_ref: "agent::swdev2"
  display_name: "SWDev2 Bot"
  avatar_url: "https://..."

  # Channel-specific identity
  email:
    from_name: "SWDev2 Bot"
    from_email: "swdev2@yourdomain.com"
    signature: |
      --
      SWDev2 Bot | Powered by ADAS

  slack:
    bot_name: "SWDev2"

# NEW: Channel Configuration
channels:
  email:
    inbound:
      addresses:
        - "swdev2@yourdomain.com"
    outbound:
      from_email: "swdev2@yourdomain.com"

  slack:
    inbound:
      mentions:
        - "@swdev2"
      channels: []  # Empty = mention-based in any channel
    outbound:
      bot_ref: "swdev2-bot"

# Existing fields
connectors:
  - gmail
  - slack

resources:
  - name: codebase
    type: filesystem
    description: "..."

role:
  persona: |
    You are SWDev2, a software development assistant...

policy:
  tools:
    allowed: ["*"]

triggers:
  - id: email_trigger
    type: event
    event: email.received
    filter:
      to: "swdev2@yourdomain.com"
```

---

## Job Storage

Jobs are stored under the **sender actor** (the one who initiated):

```
/jobs/{senderActorId}/{jobId}/
  ├── metadata.json    # Job metadata including skillActorId
  ├── messages/        # Conversation history
  └── artifacts/       # Generated files
```

**Why sender-based storage?**
- Data isolation by actor
- Human sees their own jobs
- Agent-to-agent jobs stored under initiating agent
- Audit trail is clear

**Delegation metadata in job:**
```json
{
  "jobId": "uuid",
  "ownerActorId": "human-actor-id",
  "skillActorId": "agent::swdev2",
  "delegationChain": ["agent::skill-a", "agent::skill-b"],
  "onBehalfOf": "human-actor-id",
  "channel": "email",
  "replyContext": {
    "type": "email",
    "to": "alice@example.com",
    "threadId": "..."
  }
}
```

---

## Implementation Order

### Phase 1: Backend Foundations
1. Add `TenantConfig` model
2. Add tenant channels configuration (email, slack)
3. Update `Actor` model to support `agent` type
4. Implement routing resolution logic
5. Update connectors to use routing tables

### Phase 2: Skill Identity
1. Add `SkillIdentity` to `DraftDomain`
2. Update skill.yaml export with identity + channels
3. Implement skill actor creation on deploy
4. Link skill identity to CORE actor

### Phase 3: Admin UI
1. Tenant Channels page (configure email/slack)
2. Skill Identity tab (simplified)
3. Routing diagnostics (optional)

### Phase 4: DAL UI Updates
1. Move channel config out of Connectors tab
2. Simplify Identity tab to skill identity only
3. Show routing status

---

## Migration Path

### From Current State
- `connector_configs[].identity` → `skill.identity.email` / `.slack`
- `channels[]` (basic) → `skill.channels` (detailed)
- Actor `external_user` for skills → Actor `agent` type

### Backward Compatibility
- Keep `connector_configs` in export for existing CORE versions
- New `identity` and `channels` sections are additive
- CORE can ignore new fields if not supported

---

## Security Considerations

1. **Token per skill actor** - Each skill has its own PAT
2. **Channel isolation** - Skills can only use configured channels
3. **Audit trail** - All actions logged with actorId
4. **Delegation tracking** - onBehalfOf preserves accountability

---

## Routing Decision Tables & Test Harness

### Core Invariants

1. **Sender actor is always the channel sender identity** (human OR agent)
2. **Job ownerActorId = senderActorId** (simple default)
3. **Skill actor is used for outbound identity** (reply sender), not the job owner
4. **If delegation exists**: `onBehalfOfActorId` is recorded, but does not change owner

### Required Fields on Every Inbound Event (Normalized)

```typescript
InboundEvent = {
  provider: 'gmail' | 'slack',
  senderIdentity: { provider: string, externalId: string },
  senderActorId: string,              // UUID (resolved via actor registry)
  targetSkillSlug: string,            // Resolved via routing
  conversationKey: string,            // Stable thread key
  messageText: string,

  // Optional delegation
  onBehalfOfActorId?: string,
  delegationChain?: string[],
}
```

### Gmail Routing Decision Table

**Inputs from connector:**
- `fromAddress` - sender email
- `toAddress` - recipient email (or list)
- `threadId` - conversation key
- `messageId`
- `subject`
- `bodyText`

**Resolution Steps:**

| Step | Rule | Output |
|------|------|--------|
| 1 | `targetSkillSlug = routeByToAddress(toAddress)` | skillSlug or reject |
| 2 | `senderActorId = actorRegistry.findByIdentity("gmail", fromAddress)` | actor UUID (human or agent) |
| 3 | If not found + tenant allows auto-provision → create actor | actor UUID |
| 4 | `conversationKey = "gmail::" + threadId` | stable key |
| 5 | `skillActorId = resolveSkillActor(skillSlug)` via `identity.actor_ref` | actor UUID |
| 6 | Start/Resume job with `ownerActorId = senderActorId` | job |

**Example Routing Table:**

| To Address | skillSlug |
|------------|-----------|
| swdev2@yourdomain.com | swdev2 |
| hr@yourdomain.com | hr |
| finance@yourdomain.com | finance |

### Slack Routing Decision Table

**Inputs from connector:**
- `userId` - sender Slack user ID
- `channelId`
- `text`
- `threadTs` - thread timestamp (if threaded)
- `ts` - message timestamp

**Mode A: Mention-Based (Default)**

| Step | Rule | Output |
|------|------|--------|
| 1 | Extract `@mention` from text or app_mention event | mentionKey |
| 2 | `targetSkillSlug = routeByMention(mentionKey)` | skillSlug or reject |
| 3 | `senderActorId = actorRegistry.findByIdentity("slack", userId)` | UUID (human or bot) |
| 4 | If not found → auto-provision per policy | UUID |
| 5 | `conversationKey = "slack::" + channelId + "::" + (threadTs \|\| ts)` | stable key |
| 6 | `skillActorId = resolveSkillActor(skillSlug)` | UUID |
| 7 | Start/Resume job with `ownerActorId = senderActorId` | job |

**Mode B: Channel-Per-Skill (Optional)**

| Channel ID | skillSlug |
|------------|-----------|
| C_SWDEV2 | swdev2 |
| C_HR | hr |

### Test Harness Matrix

#### A) Human → Skill (Gmail)

| Case | from | to | expected sender | expected skill | job owner | outbound from |
|------|------|-----|-----------------|----------------|-----------|---------------|
| A1 | alice@company.com | swdev2@yourdomain.com | Alice actor | swdev2 | Alice | swdev2@... |
| A2 | bob@external.com | hr@yourdomain.com | Bob actor (auto-provisioned) | hr | Bob | hr@... |

**Assertions for A1:**
- Job stored under `/jobs/<aliceActorId>/...`
- Reply uses `swdev2@yourdomain.com` as sender

#### B) Agent → Skill (Gmail)

| Case | from | to | expected sender | expected skill | job owner | outbound from |
|------|------|-----|-----------------|----------------|-----------|---------------|
| B1 | agent-a@yourdomain.com | hr@yourdomain.com | Agent-A actor | hr | Agent-A | hr@... |

**Assertions for B1:**
- Sender is agent actor (not human)
- Job owner is Agent-A

#### C) Human → Skill (Slack mention)

| Case | userId | text | expected sender | skill | owner | outbound identity |
|------|--------|------|-----------------|-------|-------|-------------------|
| C1 | U_ALICE | @swdev2 help me | Alice actor | swdev2 | Alice | swdev2 bot |
| C2 | U_BOB | @finance run report | Bob actor | finance | Bob | finance bot |

#### D) Agent → Skill (Slack mention)

| Case | userId | text | expected sender | skill | owner | outbound identity |
|------|--------|------|-----------------|-------|-------|-------------------|
| D1 | U_AGENT_A | @finance run report | Agent-A actor | finance | Agent-A | finance bot |

#### E) Delegation Scenarios

| Case | sender | target | metadata | expected |
|------|--------|--------|----------|----------|
| E1 | Agent-A → swdev2 | slack/gmail | `onBehalfOf=Alice, delegationChain=[Alice,Agent-A]` | owner=Agent-A, audit shows delegation |

**Assertions for E1:**
- `ownerActorId = Agent-A`
- `onBehalfOfActorId = Alice`
- ACL may check both actors

### Routing Functions (Interface)

```typescript
// Route email to skill
function routeByToAddress(toAddress: string): string | null;

// Route Slack mention to skill
function routeByMention(mention: string): string | null;

// Route Slack channel to skill (channel-per-skill mode)
function routeByChannel(channelId: string): string | null;

// Resolve actor by channel identity
function resolveActor(provider: string, externalId: string): Actor | null;

// Resolve skill's actor by skill slug
function resolveSkillActor(skillSlug: string): Actor | null;

// Generate conversation key
function conversationKey(provider: string, payload: InboundPayload): string;
```

### Access Control Baseline

- **Ownership checks**: Only owner actor (`senderActorId`) or admin can resume/respond/stream the job
- **Skill ACL**: Applied to the effective requesting context
  - Default: check `senderActor` roles/identity
  - If delegation present: optionally also check `onBehalfOf` actor
