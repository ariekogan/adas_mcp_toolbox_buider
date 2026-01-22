# WIP: Triggers Architecture & Status

**Date:** 2026-01-22
**Status:** Implemented & Verified
**Components:** DAL (Toolbox Builder) + ADAS Core (Trigger Runner)

---

## Overview

Triggers enable automated skill execution on a schedule or in response to events. They are defined in the DAL Skill Builder UI and executed by the ADAS Core trigger-runner service.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DAL (Toolbox Builder)                         │
│                                                                         │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  Triggers UI    │───▶│  DraftDomain     │───▶│  export.js        │  │
│  │  (SkillPanel)   │    │  (triggers[])    │    │  generateAdasExportPayload() │
│  └─────────────────┘    └──────────────────┘    └─────────┬─────────┘  │
│                                                           │             │
└───────────────────────────────────────────────────────────┼─────────────┘
                                                            │
                                            skill.yaml with triggers
                                                            │
                                                            ▼
                                              ┌─────────────────────────┐
                                              │    /memory volume       │
                                              │  (shared between DAL    │
                                              │   and ADAS Core)        │
                                              └────────────┬────────────┘
                                                           │
┌──────────────────────────────────────────────────────────┼──────────────┐
│                         ADAS Core                        │              │
│                                                          ▼              │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  trigger-runner │◀───│  skillLoader     │◀───│  /memory/         │  │
│  │  (scheduler)    │    │  (reads skills)  │    │  <skill>/skill.yaml│ │
│  └────────┬────────┘    └──────────────────┘    └───────────────────┘  │
│           │                                                             │
│           │ triggers job                                                │
│           ▼                                                             │
│  ┌─────────────────┐    ┌──────────────────┐                           │
│  │  ADAS Backend   │───▶│  Job Execution   │                           │
│  │  /api/jobs      │    │  (skill + prompt)│                           │
│  └─────────────────┘    └──────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Trigger Definition (DAL)

User defines triggers in the Skill Builder UI under the "Triggers" tab:

```yaml
# DraftDomain.triggers[]
- id: "Order Tracking status"
  type: schedule
  enabled: true
  concurrency: 1
  every: "PT1M"          # ISO8601 duration (1 minute)
  prompt: "Send email to customer..."
  input: {}              # Optional context data
```

### 2. Export to ADAS Core (DAL)

When skill is deployed, `generateAdasExportPayload()` includes triggers:

**File:** `apps/backend/src/services/export.js` (lines 1451-1466)

```javascript
// Add triggers if present (for ADAS trigger-runner)
if (toolbox.triggers && toolbox.triggers.length > 0) {
  const enabledTriggers = toolbox.triggers.filter(t => t.enabled);
  if (enabledTriggers.length > 0) {
    skill.triggers = enabledTriggers.map(t => ({
      id: t.id,
      type: t.type,
      enabled: t.enabled,
      concurrency: t.concurrency || 1,
      prompt: t.prompt,
      ...(t.input && Object.keys(t.input).length > 0 && { input: t.input }),
      ...(t.type === 'schedule' && { every: t.every }),
      ...(t.type === 'event' && { event: t.event }),
      ...(t.type === 'event' && t.filter && Object.keys(t.filter).length > 0 && { filter: t.filter })
    }));
  }
}
```

### 3. skill.yaml Output

```yaml
id: cs-tier-1
name: CS:Tier-1
version: 0.1.1
# ... other fields ...
triggers:
  - id: "Order Tracking status"
    type: schedule
    enabled: true
    concurrency: 1
    prompt: >-
      Send email to customer ariekogan33@gmail.com with the content of his
      latest order status...
    every: PT1M
```

### 4. Trigger Runner Execution (ADAS Core)

The trigger-runner service:
1. Loads skills from `/memory/<skill>/skill.yaml`
2. Extracts triggers and registers them with the scheduler
3. Executes jobs at scheduled intervals via ADAS Backend API

**Logs show:**
```
[INFO] [skillLoader] Loaded 5 skills
[INFO] [scheduler] Initialized with 1 schedule triggers
[INFO] [scheduler] Starting triggered job: cs-tier-1:Order Tracking status
[INFO] [scheduler] Job started: job_bxt6ak4l for trigger: cs-tier-1:Order Tracking status
[INFO] [scheduler] Job job_bxt6ak4l completed {"ok":true}
```

## Trigger Types

### Schedule Trigger
Executes at regular intervals using ISO8601 duration format.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
| type | "schedule" | Yes | Discriminator |
| enabled | boolean | Yes | Active flag |
| concurrency | number | No | Max parallel jobs (default: 1) |
| prompt | string | Yes | Goal prompt for the job |
| every | string | Yes | ISO8601 duration (PT1M, PT5M, PT1H, P1D) |
| input | object | No | Context data passed to job |

### Event Trigger (Future)
Executes in response to external events.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
| type | "event" | Yes | Discriminator |
| enabled | boolean | Yes | Active flag |
| concurrency | number | No | Max parallel jobs (default: 1) |
| prompt | string | Yes | Goal prompt for the job |
| event | string | Yes | Event type (e.g., "email.received") |
| filter | object | No | Equality filter on event.data |
| input | object | No | Context data passed to job |

## ISO8601 Duration Examples

| Duration | Meaning |
|----------|---------|
| PT30S | 30 seconds |
| PT1M | 1 minute |
| PT5M | 5 minutes |
| PT1H | 1 hour |
| PT12H | 12 hours |
| P1D | 1 day |
| P7D | 7 days |

## Current Status

### Implemented
- [x] Trigger definition in DraftDomain schema
- [x] Trigger UI in Skill Builder (Triggers tab)
- [x] Schedule trigger validation (ISO8601 format)
- [x] Export triggers to skill.yaml
- [x] Trigger-runner detection and scheduling
- [x] Job execution via ADAS Backend

### Verified Working
- **Skill:** CS:Tier-1
- **Trigger:** "Order Tracking status"
- **Schedule:** Every 1 minute (PT1M)
- **Status:** Executing successfully

### Not Yet Implemented
- [ ] Event triggers (waiting for event bus integration)
- [ ] Trigger execution history in UI
- [ ] Trigger pause/resume from UI
- [ ] Trigger metrics/monitoring

## File Locations

### DAL (Toolbox Builder)
- **Schema:** `apps/backend/src/types/DraftDomain.js` (lines 210-257)
- **Defaults:** `apps/backend/src/utils/defaults.js` (lines 325-376)
- **Validation:** `apps/backend/src/validators/schemaValidator.js` (lines 837-936)
- **Export:** `apps/backend/src/services/export.js` (lines 1451-1466)

### ADAS Core
- **Trigger Runner:** `apps/trigger-runner/` (separate service)
- **Skill Loader:** Reads from `/memory/<skill>/skill.yaml`
- **Scheduler:** Manages trigger timing and job dispatch

## Troubleshooting

### Triggers not appearing in trigger-runner
1. Check skill.yaml has `triggers:` section
2. Verify triggers have `enabled: true`
3. Restart trigger-runner to reload skills

### Trigger not executing
1. Check trigger-runner logs for errors
2. Verify ADAS Backend is accessible
3. Check job execution logs in ADAS

### Common Issues
- **0 triggers loaded:** Triggers not exported - check export.js
- **Job failed:** Check ADAS Backend logs for execution errors
- **Invalid duration:** Use ISO8601 format (PT1M, not "1 minute")

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Initial implementation - triggers now exported to skill.yaml | Claude |
