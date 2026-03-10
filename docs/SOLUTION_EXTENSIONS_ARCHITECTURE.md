# Solution Extensions Architecture: Unified Framework

**Author's Note:** This document explains the architectural principle that unifies how A-Team Core and Mobile App handle solution-owned extensions.

---

## Core Insight

**Core and Mobile use the same architectural pattern for runtime extensions:**

| Layer | Core | Mobile |
|-------|------|--------|
| **Loaded Item Type** | Connectors (MCP servers) | UI Plugins (React components) |
| **Where It Runs** | Docker container in Core | React Native process on mobile |
| **Deployment Model** | Deploy with solution | Deploy with solution |
| **Load Time** | Runtime (not baked in) | Runtime (not baked in) |
| **Ownership** | Solution-owned | Solution-owned |
| **Invocation** | Skills call tools | Plugins call via bridge |
| **API** | Public A-Team MCP | Public A-Team MCP |

---

## The Pattern: Solution Extensions

### What is a Solution Extension?

A solution extension is **any capability that a solution provides beyond its core skills**, deployed as part of the solution definition.

```
Solution Definition
{
  id: "my-solution",
  name: "My Solution",

  // Core Skills (orchestration logic)
  skills: [...]

  // Extensions: What this solution ADDS to the platform
  connectors: [...]      ← Backend extensions (Core hosts)
  ui_plugins: [...]      ← Frontend extensions (Mobile hosts)
}
```

### Pattern Structure

```
Deploy Solution
    ↓
┌───────────────────────────────┐
│  Solution Definition (JSON)   │
├───────────────────────────────┤
│ skills: [...]                 │
│ connectors: [...]             │
│ ui_plugins: [...]             │
└───────────────────────────────┘
    │
    ├─ Core reads connectors
    │  └─ Creates MCP mounts
    │     └─ Loads at runtime ✅
    │
    └─ Mobile reads ui_plugins
       └─ Fetches manifests
          └─ Loads at runtime ✅
```

---

## How Core Loads Connectors

### Deployment Flow

```
1. Solution Definition
   {
     "id": "task-stats-solution",
     "connectors": [
       { "id": "task-board-mcp", "transport": "stdio" },
       { "id": "project-knowledge-mcp", "transport": "stdio" }
     ]
   }

2. AI Agent Deploys via Skill Builder
   // In Skill Builder UI:
   - Create solution
   - Add connectors
   - Define skills
   - Click Deploy

   // Via API:
   await ateam_build_and_run({ solution, skills })

3. Core Receives Deployment
   → Parses connectors array
   → Creates MCP mounts
   → Registers with MCP server
   → Available for skills to call

4. Skills Call Connectors
   // Skill system prompt:
   // "You can call task-board-mcp.tasks.list()"

   // Execution:
   // skill → calls tool → Core MCP server → connector → returns data

5. Data Flow
   Skill → MCP Protocol → Connector → SQLite/API → Response
```

### Key Characteristics

✅ **Defined in solution.json**
✅ **Deployed with solution (no manual MCP setup)**
✅ **Loaded at runtime (not baked into Core)**
✅ **Owned by solution (solution controls versions)**
✅ **Called by skills via MCP protocol**
✅ **Can be updated without Core rebuild**

---

## How Mobile Loads Plugins

### Deployment Flow

```
1. Solution Definition
   {
     "id": "task-stats-solution",
     "ui_plugins": [
       {
         "id": "task-stats-widget",
         "name": "Task Stats Dashboard",
         "render": "react-native",
         "capabilities": { "requires": ["task-board-mcp"] }
       }
     ]
   }

2. AI Agent Deploys via Skill Builder
   // In Skill Builder UI:
   - Create solution
   - Add UI plugins section
   - Define plugins
   - Click Deploy

   // Via API:
   await ateam_build_and_run({ solution, skills })

3. Core Receives Deployment
   → Parses ui_plugins array
   → Stores in solution document (MongoDB)
   → Serves via REST API endpoint

4. Mobile App Fetches at Runtime
   // Plugins Tab loads:
   useRemotePlugins()
   → GET /api/solutions/current/ui-plugins
   → Core returns plugin manifests
   → Mobile renders in Plugins tab

5. Data Flow
   Plugin → useRemotePlugins() → Core API → Plugin Manifest
   Plugin → bridge.mcpCall() → Core MCP → Connector → Data
```

### Key Characteristics

✅ **Defined in solution.json**
✅ **Deployed with solution (no manual plugin setup)**
✅ **Loaded at runtime (not baked into mobile)**
✅ **Owned by solution (solution controls versions)**
✅ **Called by components via native bridge**
✅ **Can be updated without app rebuild**

---

## Side-by-Side Comparison

### Core Connectors

```typescript
// Skill calls a connector
const result = await skill.callTool({
  connector: "task-board-mcp",
  tool: "tasks.list",
  input: {}
});

// Flow: Skill → MCP Server → Connector → Data
// Location: Runs in Core's Docker container
// Type: Backend service
// Deployed by: Core MCP server (stdio transport)
```

### Mobile Plugins

```typescript
// Plugin calls a connector via bridge
const result = await bridge.mcpCall(
  "tasks.list",           // Tool name
  {},                     // Input
  "task-board-mcp"        // Connector ID
);

// Flow: Plugin → Native Bridge → Core MCP → Connector → Data
// Location: Runs in Mobile app React Native process
// Type: Frontend component
// Deployed by: Mobile app (fetched from Core API)
```

---

## Skill Builder's Role

### In the Solution Extension Architecture

```
┌─────────────────────────────────────────────┐
│  Skill Builder (adas_mcp_toolbox_builder)   │
├─────────────────────────────────────────────┤
│                                              │
│ 1. UI for defining solutions                │
│    - Add connectors section                 │
│    - Define what connectors solution needs  │
│                                              │
│ 2. UI for defining ui_plugins               │
│    - Add ui_plugins section                 │
│    - Define what plugins solution provides  │
│                                              │
│ 3. Validation                               │
│    - Validate connector definitions         │
│    - Validate ui_plugin definitions         │
│    - Ensure references are consistent       │
│                                              │
│ 4. Deployment                               │
│    - Send to Core API                       │
│    - Core handles: connectors, ui_plugins   │
│                                              │
└─────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
    ┌─────────────┐       ┌──────────────┐
    │ A-Team Core │       │ Mobile App   │
    │             │       │              │
    │ Mounts      │       │ Fetches and  │
    │ connectors  │       │ loads plugins│
    │ at runtime  │       │ at runtime   │
    └─────────────┘       └──────────────┘
```

### Key Responsibility

The Skill Builder doesn't handle the actual loading—it just:

1. **Defines** what extensions a solution needs/provides
2. **Validates** the definition
3. **Deploys** to Core
4. Core and Mobile handle the rest (loading, execution)

---

## Complete Data Flow

### From Skill Builder to Execution

```
Developer uses Skill Builder
│
├─ Create Solution
│  ├─ Define connectors (backend)
│  ├─ Define ui_plugins (frontend)
│  └─ Define skills (logic)
│
├─ Click Deploy
│  └─ Calls: POST /deploy/solution
│
Core receives deployment
│
├─ Parse solution
├─ Create connector mounts (MCP)
├─ Store ui_plugins metadata
└─ Register in MongoDB
│
Now solutions can be used:
│
├─ Skills call connectors
│  └─ Via Core's MCP server
│
└─ Mobile plugins call connectors
   └─ Via native bridge → Core API
```

---

## Why This Architecture is Powerful

### Problem Solved

**Before:** Solutions could only provide backend logic (skills).

**Now:** Solutions can extend both backend AND frontend.

### What Enables This

1. **Solution Ownership**
   - Solutions define what they need (connectors, plugins)
   - No manual DevOps setup required
   - Skill Builder handles definition

2. **Runtime Loading**
   - Core loads connectors dynamically
   - Mobile loads plugins dynamically
   - No app/Core rebuilds needed
   - Deploy solution → extensions appear instantly

3. **Platform Abstraction**
   - Core handles backend extensions
   - Mobile handles frontend extensions
   - Skill Builder abstracts complexity
   - Developers use one interface

4. **Unified API**
   - Both deployed via Skill Builder
   - Both defined in same solution.json
   - Same `ateam_build_and_run()` call deploys both

### Real-World Scenario

**Task Management Solution wants to:**
- Provide task data (backend) → Connector in Core
- Display task board (frontend) → Plugin on Mobile
- Users see integrated experience without app rebuild

```javascript
// Skill Builder creates this
const solution = {
  id: "task-management",
  connectors: [
    // Core will mount these
    { id: "task-board-mcp" },
    { id: "task-analytics-mcp" }
  ],
  ui_plugins: [
    // Mobile will load these
    { id: "task-board-widget" },
    { id: "task-analytics-dashboard" }
  ],
  skills: [
    // Both use these
    { id: "task-orchestrator" }
  ]
};

// Skill Builder deploys it
POST /deploy/solution { solution, skills }

// Result:
// ✅ Core mounts connectors (backend ready)
// ✅ Mobile can fetch plugins (frontend ready)
// ✅ One deployment, full functionality
```

---

## Architecture Diagram

```
┌────────────────────────────────────────────────┐
│  Developer / AI Agent                          │
└────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────┐
│  Skill Builder (adas_mcp_toolbox_builder)      │
│  - Solution editor                             │
│  - Define connectors                           │
│  - Define ui_plugins                           │
│  - Define skills                               │
│  - Deploy button                               │
└────────────────────────────────────────────────┘
              │ Deploy
              ▼
      ┌───────────────────┐
      │  A-Team Core API  │
      │  POST /deploy     │
      └───────────────────┘
         │              │
         │ Parse        │ Parse
         ▼              ▼
    ┌─────────────┐  ┌──────────────┐
    │   Connectors│  │  UI Plugins  │
    │             │  │              │
    │ MCP Mounts  │  │ Store in DB  │
    │ (Docker)    │  │ Serve API    │
    └─────────────┘  └──────────────┘
         │                    │
         ▼                    ▼
    ┌─────────────┐  ┌──────────────┐
    │  Core System│  │ Mobile App   │
    │             │  │              │
    │ Skills call │  │ Plugins      │
    │ tools       │  │ loaded via   │
    │             │  │ Core API     │
    └─────────────┘  └──────────────┘
```

---

## Implementation Roadmap

### Phase 1: Core Connectors ✅
- ✅ Solution can define connectors
- ✅ Core mounts and serves connectors
- ✅ Skills can call connectors

### Phase 2: Mobile UI Plugins ✅
- ✅ Solution can define ui_plugins
- ✅ Core stores and serves plugin metadata
- ✅ Mobile fetches and loads plugins
- ✅ Plugins call connectors via bridge

### Phase 3: Enhanced Extensions
- 🔶 Plugin versioning and pinning
- 🔶 Plugin marketplace in mobile app
- 🔶 Device API extensions (camera, GPS)
- 🔶 Real-time sync extensions (WebSocket)

---

## For Skill Builder Developers

### When Adding New Extension Types

Follow this pattern:

1. **Define in solution schema**
   - Add to solution.json schema
   - Add to spec validation
   - Add examples

2. **Add UI in Skill Builder**
   - Panel to define extensions
   - Validation UI
   - Test interface

3. **Add deployment logic**
   - Parse extensions from solution
   - Send to Core API
   - Handle deployment response

4. **Add documentation**
   - How to use in Skill Builder
   - How it works on platform
   - Complete example

Example: If adding "notification-channels" extension type

```javascript
// 1. Schema
{
  notification_channels: [
    { id: "email-channel", provider: "sendgrid" },
    { id: "sms-channel", provider: "twilio" }
  ]
}

// 2. Skill Builder UI
// Form to add/edit notification channels

// 3. Deployment
// POST /deploy/solution with notification_channels

// 4. Docs
// How to use, examples, architecture
```

---

## Phase 4: Functional Connectors (Background Services)

**Status:** Available in spec and validation; mobile app loader in development.

### What Are Functional Connectors?

Functional connectors are **solution-owned background services for mobile/native environments**. Unlike UI plugins (which render visual components), functional connectors:

- Run headless (no UI)
- Execute continuously or on-demand
- Handle device data collection, offline sync, background tasks
- Require native capabilities (location, calendar, contacts, battery, notifications)
- Start automatically when the mobile app selects the solution's tenant

### Example: Device-Bridge

The mobile-pa solution includes **device-bridge**, a functional connector that:

1. **Collects** real device data (calendar, contacts, location, battery, notifications)
2. **Syncs** this data to a Cloud Relay service every 60 seconds
3. **Polls** for actions from A-Team backend
4. **Executes** actions (send SMS, create calendar event, navigate, set DND)

Device-bridge runs continuously after tenant selection, feeding real device context into PA skills.

### Declaration in solution.json

```javascript
{
  functional_connectors: [
    {
      id: "device-bridge",
      name: "Device Data Bridge",
      description: "Real-time device data collection and relay sync",
      module: "@mobile-pa/device-bridge",           // NPM package
      type: "background",                            // or "service"
      autoStart: true,                               // Start on tenant selection
      permissions: ["calendar", "contacts", "location", "notifications"],
      backgroundSync: true,                          // Enable background tasks
      config: {                                      // Passed to constructor
        deviceIdPrefix: "ateam-mobile-"
      }
    }
  ]
}
```

### Mobile App Loading Flow

```
1. User selects "mobile-pa" tenant in TenantPicker
   ↓
2. Mobile app discovers functional connectors:
   GET /api/solutions/{tenantId}/functional-connectors
   ↓
3. For each connector with autoStart: true:
   - Load module from node_modules: import('@mobile-pa/device-bridge')
   - Instantiate: new DeviceBridge(config)
   - Request permissions (show system dialogs)
   - Start syncing: bridge.startSync()
   ↓
4. Connector runs in background continuously
   Phone → Device Data → Relay → A-Team Skills
   ↓
5. On logout or tenant switch:
   - Stop connector: bridge.stopSync()
   - Clear instance
```

### Supported Capabilities

| Capability | iOS | Android | Requires Permission |
|---|---|---|---|
| calendar | ✅ | ✅ | Yes |
| contacts | ✅ | ✅ | Yes |
| location | ✅ | ✅ | Yes (always-on) |
| battery | ✅ | ✅ | No |
| connectivity | ✅ | ✅ | No |
| notifications | ✅ | ✅ | Yes |
| biometrics | ✅ | ✅ | Yes |
| camera | ✅ | ✅ | Yes |
| storage | ✅ | ✅ | Yes |

### Interface Contract

All functional connectors must export a class matching:

```typescript
class FunctionalConnector {
  constructor(config: { relayUrl, deviceId, apiKey, ... })

  // Lifecycle
  requestAllPermissions(): Promise<Map<string, boolean>>
  startSync(): Promise<void>
  stopSync(): void

  // Optional
  start(): Promise<void>
  stop(): void
  syncNow(): Promise<void>
  getStatus(): { running: boolean, connectors: {...}, ... }
}
```

### Why Separate from UI Plugins?

| Aspect | UI Plugins | Functional Connectors |
|---|---|---|
| **Renders UI** | Yes | No |
| **Lifecycle** | User navigates to Plugins tab | Auto-start on tenant select |
| **Runs in background** | No | Yes |
| **Needs permissions** | Optional | Often required |
| **Persists data** | Via connector tools | May use device storage |
| **Example** | Task board dashboard | Device data collection |

### Deployment Via Skill Builder

1. Define functional_connectors in solution.json
2. Deploy: `POST /deploy/solution`
3. Core stores metadata in MongoDB
4. Mobile app fetches on tenant selection
5. Mobile loads and initializes automatically

No manual MCP setup, no DevOps required — same unified deployment pattern as UI plugins and backend connectors.

### Future: Plugin SDK Integration

Plugins can optionally access functional connector data directly:

```typescript
// In an iframe plugin:
const connectors = useContext(FunctionalConnectorsContext);
const deviceBridge = connectors.get('device-bridge');
const location = await deviceBridge.getLastLocation();
```

This allows plugins to either:
- Call skills that use connector data (indirect)
- Access connector data directly (direct, lower latency)

---

## References

- **Core System:** ai-dev-assistant repository (connector loading)
- **Mobile System:** ateam-mobile PLUGIN_SYSTEM_README.md (plugin loading)
- **Mobile Loader:** ateam-mobile functional connector loader (in development)
- **Public MCP:** Public A-Team API spec (extension definitions)
- **Builder System:** This repository (UI + validation)
- **Example:** EXAMPLE_AGENT_BUILD_PLUGIN.md (complete walkthrough)

---

**This document defines the architectural principle that makes A-Team extensible across all layers: backend (connectors), frontend (UI plugins), and mobile (functional connectors).**
