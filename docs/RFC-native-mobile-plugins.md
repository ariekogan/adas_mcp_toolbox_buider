# RFC: Native Mobile Plugins for A-Team Solutions

**Status:** Draft
**Author:** AI Dev Team
**Date:** 2026-03-09
**Version:** 0.1.0

## Related Documentation

- `docs/PLUGIN_PROTOCOL_SPEC.md` — Current iframe postMessage protocol (this RFC extends it)
- `docs/DESIGN_SPEC.md` — Overall Skill Builder design
- `docs/SOLUTION_BUILDER_ARCHITECTURE.md` — Solution deployment pipeline
- `docs/design/CONNECTOR_SYSTEM.md` — Connector architecture
- `apps/mcp-server/plugins-ui/src/shared/adas-plugin-sdk.js` — Existing web plugin SDK
- `ateam-mobile` repo — React Native host app (`/Users/arie/Projects/ateam-mobile/`)
- `ai-dev-team` repo — Example solution with UI connector (`/Users/arie/Projects/ai-dev-team/`)

---

## 1. Problem Statement

### Current State

A-Team solutions support **UI plugins** rendered as iframes (web) or WebViews (mobile). These plugins are self-contained HTML files served by UI-capable MCP connectors.

**Architecture today:**

```
┌─────────────────────────────────────────────────────┐
│  A-Team Solution                                    │
│                                                     │
│  Server-side:  MCP Connectors (backend logic/data)  │
│  Client-side:  UI Plugins (iframe/WebView — HTML)   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**What works well:**
- Single HTML file = zero build step, zero dependencies
- Solution developers (AI agents) can generate a full plugin in one artifact
- Same plugin works on web and mobile (via WebView bridge injection)
- Cross-connector MCP calls via postMessage protocol

**What doesn't work:**
- Mobile UX is suboptimal — no native gestures, no platform widgets, WebView overhead
- WebView plugins cannot access **any** native device capabilities:
  - No camera, GPS, biometrics, Bluetooth, NFC
  - No offline storage / local database
  - No background tasks or scheduled execution
  - No push notification handling logic
  - No file system access
  - No haptics or native animations
  - No inter-app communication
- Plugins are **display-only** — they can visualize data but cannot run client-side logic beyond JavaScript in a sandboxed WebView
- Mobile bridge has known limitations (mcpProxy relay issues, debug complexity)

### The Gap

Solutions today have two code layers: **server-side** (MCP connectors) and **client-side** (HTML plugins for visualization). There is no way to run **solution-specific code on the mobile device** with native access.

This means an entire class of solutions is impossible:
- Offline-first task management with sync
- QA tools with camera/screenshot capture
- Field service apps with GPS tracking
- Inventory systems with barcode/QR scanning
- Secure workflows with biometric authentication
- Smart notification handlers with client-side logic
- Local data processing and caching layers

---

## 2. Proposed Solution: Native Mobile Plugins

Introduce a **third code layer** — Native Mobile Plugins — that run as React Native components inside the `ateam-mobile` host app. These plugins are NOT just "native UI" — they are **mobile-side code execution units** that can optionally render UI.

**Architecture proposed:**

```
┌──────────────────────────────────────────────────────────────┐
│  A-Team Solution                                             │
│                                                              │
│  Server-side:   MCP Connectors (backend logic, data, tools)  │
│  Mobile-side:   Native Plugins (RN code, native APIs, UI?)   │  ← NEW
│  Client-side:   Web Plugins (iframe/WebView — HTML fallback) │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Plugin Types

| Type | Has UI | Has Native Logic | Example |
|------|--------|-----------------|---------|
| `ui` | Yes | Optional | Dashboard, analytics charts |
| `service` | No (headless) | Yes | Offline sync, notification handler |
| `hybrid` | Yes | Yes | QA camera tool, GPS tracker with map |

### Key Principles

1. **Same bridge protocol** — Native plugins use the same `PluginBridge` interface (mcpCall, mcpFetch, onCommand) as web plugins, but over direct function calls instead of postMessage serialization
2. **Capability-gated** — Plugins declare which native APIs they need; the host grants access via a sandboxed SDK
3. **Single-file convention** — To keep DX close to today's "1 HTML file" approach, native plugins follow a single-file `.plugin.tsx` convention
4. **Adaptive rendering** — Manifests can declare both web and native renderers; the host picks the best one for the platform
5. **Backward compatible** — All existing iframe plugins continue to work unchanged

---

## 3. Technical Design

### 3.1 Extended Plugin Manifest

The current manifest shape:
```typescript
// Current — web only
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  render: {
    mode: 'iframe';
    iframeUrl: string;
    external?: boolean;
  };
  channels?: string[];
  capabilities?: Record<string, unknown>;
}
```

Extended manifest:
```typescript
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;

  // Plugin type — determines lifecycle
  type?: 'ui' | 'service' | 'hybrid';  // default: 'ui'

  // Rendering — polymorphic
  render?:
    | { mode: 'iframe'; iframeUrl: string; external?: boolean }
    | { mode: 'react-native'; component: string; bundleId?: string }
    | {
        mode: 'adaptive';
        iframe: { iframeUrl: string; external?: boolean };
        reactNative: { component: string; bundleId?: string };
      };

  // Native capabilities requested
  native?: {
    camera?: boolean;
    location?: boolean;
    biometrics?: boolean;
    offline?: boolean;          // local SQLite / MMKV
    backgroundTasks?: boolean;
    fileSystem?: boolean;
    notifications?: boolean;
    bluetooth?: boolean;
    haptics?: boolean;
  };

  // Lifecycle hooks (for service/hybrid plugins)
  hooks?: {
    onAppStart?: boolean;       // run when host app launches
    onPushReceived?: boolean;   // intercept push notifications
    onConnectivity?: boolean;   // react to online/offline transitions
    onForeground?: boolean;     // app returns to foreground
    onBackground?: boolean;     // app goes to background
  };

  channels?: string[];
  capabilities?: Record<string, unknown>;
}
```

**Backward compatibility:** Existing manifests with `render.mode: 'iframe'` continue to work unchanged. The `type` field defaults to `'ui'` when omitted. The `native` and `hooks` fields are optional.

### 3.2 Plugin SDK (`@adas/plugin-sdk`)

A shared TypeScript package that both web and native plugins import. This is the **developer contract**.

```typescript
// ── Bridge (shared across web and native) ──────────────────

interface PluginContext {
  tenant: string;
  pluginId: string;
  connectorId?: string;
  user?: { id: string; name: string; roles: string[] };
}

interface PluginBridge {
  /** Wait for host initialization */
  onInit(cb: (ctx: PluginContext) => void): void;

  /** Call an MCP tool on any connector */
  mcpCall(tool: string, args: any, connectorId?: string): Promise<any>;

  /** Raw JSON-RPC to /mcp endpoint */
  mcpFetch(body: any): Promise<any>;

  /** Send a command to the host */
  sendCommand(type: string, payload: any): void;

  /** Listen for commands from the host */
  onCommand(cb: (type: string, payload: any) => void): () => void;
}

// ── Native capabilities (only available in RN plugins) ─────

interface PluginNative {
  camera: {
    takePhoto(opts?: { quality?: number; facing?: 'front' | 'back' }): Promise<{ uri: string; width: number; height: number }>;
    scanBarcode(opts?: { formats?: string[] }): Promise<{ data: string; format: string }>;
    pickImage(opts?: { multiple?: boolean }): Promise<{ uri: string }[]>;
  };

  location: {
    getCurrent(opts?: { accuracy?: 'low' | 'high' }): Promise<{ latitude: number; longitude: number; altitude?: number }>;
    watchPosition(cb: (pos: { latitude: number; longitude: number }) => void): () => void;
  };

  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    /** Local SQLite database scoped to this plugin */
    db: {
      execute(sql: string, params?: any[]): Promise<{ rows: any[]; changes: number }>;
    };
  };

  biometrics: {
    isAvailable(): Promise<boolean>;
    authenticate(opts: { reason: string }): Promise<{ success: boolean }>;
  };

  notifications: {
    schedule(opts: { title: string; body: string; trigger: { seconds?: number; date?: string } }): Promise<string>;
    cancel(id: string): Promise<void>;
    onReceived(cb: (notification: { id: string; title: string; body: string; data?: any }) => void): () => void;
  };

  haptics: {
    impact(style: 'light' | 'medium' | 'heavy'): void;
    notification(type: 'success' | 'warning' | 'error'): void;
    selection(): void;
  };

  connectivity: {
    isOnline(): boolean;
    onChange(cb: (online: boolean) => void): () => void;
  };

  fileSystem: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    pickDocument(opts?: { types?: string[] }): Promise<{ uri: string; name: string; size: number }>;
  };
}

// ── Theme tokens (matches host app theme) ──────────────────

interface ThemeTokens {
  colors: {
    bg: string; surface: string; border: string;
    text: string; textSecondary: string;
    accent: string; success: string; warning: string; error: string;
  };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  typography: { body: object; heading: object; caption: object };
  isDark: boolean;
}

// ── What every plugin receives ─────────────────────────────

interface PluginProps {
  bridge: PluginBridge;
  native: PluginNative;
  theme: ThemeTokens;
  context: PluginContext;
}

// ── Registration API ───────────────────────────────────────

namespace PluginSDK {
  /** Register a UI or hybrid plugin (has a visual component) */
  function register(id: string, config: {
    type?: 'ui' | 'hybrid';
    capabilities?: PluginManifest['native'];
    Component: React.FC<PluginProps>;
  }): RegisteredPlugin;

  /** Register a headless service plugin (no UI) */
  function registerService(id: string, config: {
    capabilities?: PluginManifest['native'];
    hooks?: PluginManifest['hooks'];
    onStart: (props: Omit<PluginProps, 'theme'>) => Promise<void> | void;
    onStop?: () => Promise<void> | void;
  }): RegisteredPlugin;
}
```

### 3.3 UI Component Library

The SDK re-exports safe React Native primitives + pre-built components. Plugins import from `@adas/plugin-sdk` — never from `react-native` directly. This solves the native dependency problem (plugins can't bring their own native modules).

**Primitives (re-exported from RN):**
- `View`, `Text`, `ScrollView`, `FlatList`, `SectionList`
- `Pressable`, `TouchableOpacity`, `TextInput`, `Image`
- `ActivityIndicator`, `Modal`, `Switch`
- `StyleSheet`, `Animated`, `Platform`

**Pre-built components (shipped with SDK):**
- `Card` — surface container with shadow/border
- `Badge` — status indicator with color mapping
- `TabBar` — horizontal tab strip
- `ListItem` — standard list row
- `SearchBar` — search input with debounce
- `EmptyState` — placeholder for empty data
- `ErrorState` — error display with retry
- `BottomSheet` — draggable sheet (wraps `@gorhom/bottom-sheet`)
- `ActionButton` — FAB-style primary action

### 3.4 Bridge Implementations

**Web bridge** (for iframe plugins — extracted from current inline JS):
```
Plugin JS → window.parent.postMessage() → PluginHost/WebView → serialize/deserialize → HTTP to Core
```

**Native bridge** (for RN plugins — direct function calls):
```
Plugin component → bridge.mcpCall() → direct fetch() to Core API → return result
```

The native bridge is **dramatically simpler** — no postMessage, no serialization, no injected JS, no iOS/Android listener differences. It's just function calls:

```typescript
// useNativeBridge.ts — what the host provides to RN plugins
function useNativeBridge(pluginId: string, connectorId?: string): PluginBridge {
  const mcpCall = async (tool: string, args: any, cId?: string) => {
    const token = getToken();
    const targetConnector = cId || connectorId;
    const res = await fetch(`${CORE_API_URL}/api/connectors/${targetConnector}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tool, args }),
    });
    const data = await res.json();
    return data.result;
  };

  const mcpFetch = async (body: any) => {
    const token = getToken();
    const res = await fetch(`${CORE_API_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  // ... onInit, sendCommand, onCommand

  return { mcpCall, mcpFetch, onInit, sendCommand, onCommand };
}
```

### 3.5 Host-Side Plugin Loader

The `ateam-mobile` app needs a new component that renders native plugins alongside the existing WebView renderer.

**Decision tree:**
```
getPlugin(id) → manifest
  │
  ├─ render.mode === 'iframe'
  │    → EmbeddedPluginWebView (existing, unchanged)
  │
  ├─ render.mode === 'react-native'
  │    → EmbeddedPluginNative (new)
  │
  └─ render.mode === 'adaptive'
       ├─ Platform.OS !== 'web' && nativePluginRegistry.has(id)
       │    → EmbeddedPluginNative
       └─ else
            → EmbeddedPluginWebView (fallback)
```

**Native plugin renderer:**
```typescript
// EmbeddedPluginNative.tsx
function EmbeddedPluginNative({ pluginId, manifest }: Props) {
  const Plugin = nativePluginRegistry.get(manifest.render.component);
  const bridge = useNativeBridge(pluginId, connectorId);
  const native = useNativeCapabilities(manifest.native);
  const theme = useTheme();
  const context = usePluginContext(pluginId);

  if (!Plugin) {
    return <ErrorState message={`Native plugin not found: ${manifest.render.component}`} />;
  }

  return (
    <PluginErrorBoundary pluginId={pluginId}>
      <Plugin bridge={bridge} native={native} theme={theme} context={context} />
    </PluginErrorBoundary>
  );
}
```

### 3.6 Plugin Registry and Bundle Loading

**Phase 1: Pre-bundled registry** (ship plugins inside the app binary):

```typescript
// src/plugins/registry.ts — ships with ateam-mobile
const NATIVE_PLUGINS: Record<string, () => Promise<RegisteredPlugin>> = {
  'devteam-dashboard': () => import('./devteam-dashboard/index'),
  'qa-capture':        () => import('./qa-capture/index'),
  'offline-sync':      () => import('./offline-sync/index'),
};

export const nativePluginRegistry = {
  has: (id: string) => id in NATIVE_PLUGINS,
  get: async (id: string) => {
    const loader = NATIVE_PLUGINS[id];
    if (!loader) return null;
    const mod = await loader();
    return mod.default;
  },
};
```

**Phase 2: Dynamic loading** (future — OTA bundle delivery):
- Plugins delivered as JS bundles via `expo-updates` or custom OTA
- Bundle URL in manifest: `render.reactNative.bundleUrl`
- Host downloads, caches, and evaluates bundles at runtime
- Requires code signing and sandboxing infrastructure

**Recommendation:** Start with Phase 1. It validates the entire architecture without solving dynamic loading. Move to Phase 2 when the plugin ecosystem grows beyond the core team.

### 3.7 Service Plugin Lifecycle

Service (headless) plugins need lifecycle management in the host app:

```typescript
// src/plugins/serviceManager.ts
class PluginServiceManager {
  private running: Map<string, RegisteredPlugin> = new Map();

  /** Start all service plugins that declare onAppStart hook */
  async startAll(manifests: PluginManifest[]) {
    const services = manifests.filter(m => m.type === 'service' || m.type === 'hybrid');
    for (const m of services) {
      if (m.hooks?.onAppStart) {
        await this.start(m);
      }
    }
  }

  /** Start a single service plugin */
  async start(manifest: PluginManifest) {
    const plugin = await nativePluginRegistry.get(manifest.render?.component || manifest.id);
    if (plugin?.onStart) {
      const bridge = createNativeBridge(manifest.id);
      const native = createNativeCapabilities(manifest.native);
      await plugin.onStart({ bridge, native, context: { ... } });
      this.running.set(manifest.id, plugin);
    }
  }

  /** Stop all running services */
  async stopAll() {
    for (const [id, plugin] of this.running) {
      if (plugin.onStop) await plugin.onStop();
    }
    this.running.clear();
  }
}
```

---

## 4. Developer Experience (DX) — What Changes for Solution Builders

### 4.1 Current DX (Web Plugin)

Building the ai-dev-team dashboard today:

| Step | What | Files | Build Step |
|------|------|-------|------------|
| 1 | Write `server.js` (MCP connector with `ui.listPlugins`, `ui.getPlugin`) | 1 file | None |
| 2 | Write `ui-dist/.../index.html` (self-contained HTML+CSS+JS) | 1 file | None |
| 3 | Deploy via `ateam_build_and_run` with `mcp_store` | — | None |

**Total: 2 files, 0 build steps, ~15 minutes for an AI agent.**

### 4.2 New DX (Native Plugin)

Building the same dashboard as a native plugin:

| Step | What | Files | Build Step |
|------|------|-------|------------|
| 1 | Write `server.js` (same MCP connector — unchanged) | 1 file | None |
| 2 | Write `ui-dist/.../index.html` (web fallback — can be simplified) | 1 file | None |
| 3 | Write `devteam-dashboard.plugin.tsx` (single-file RN plugin) | 1 file | None* |
| 4 | Register in `src/plugins/registry.ts` | 1 line | App rebuild |
| 5 | Update manifest: `render.mode: 'adaptive'` | 1 change | None |
| 6 | Deploy via `ateam_build_and_run` with `mcp_store` | — | None |

*In Phase 1, the native plugin ships with the app binary — the "build step" is the regular Expo build.

**Total: 3 files + 1 registry line, ~20-25 minutes for an AI agent.**

### 4.3 What the Plugin Code Looks Like

**Example: Dashboard (UI plugin)**
```tsx
// plugins/devteam-dashboard.plugin.tsx
import { PluginSDK, View, Text, FlatList, Pressable, StyleSheet } from '@adas/plugin-sdk';
import { useState, useEffect } from 'react';

export default PluginSDK.register('devteam-dashboard', {
  type: 'ui',

  Component({ bridge, theme }) {
    const [tasks, setTasks] = useState([]);
    const [tab, setTab] = useState('tasks');

    useEffect(() => {
      bridge.mcpCall('dashboard.tasks', {}, 'devteam-dashboard-mcp')
        .then(r => setTasks(r.tasks || []));
    }, []);

    const byStatus = (status) => tasks.filter(t => t.status === status);

    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        {/* Tab bar */}
        <View style={styles.tabs}>
          {['tasks', 'docs'].map(t => (
            <Pressable key={t} onPress={() => setTab(t)}
              style={[styles.tab, tab === t && { borderBottomColor: theme.colors.accent }]}>
              <Text style={{ color: tab === t ? theme.colors.accent : theme.colors.textSecondary }}>
                {t === 'tasks' ? 'Tasks' : 'Knowledge Base'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Task list grouped by status */}
        {tab === 'tasks' && (
          <FlatList
            data={['todo', 'in_progress', 'review', 'testing', 'done']}
            renderItem={({ item: status }) => (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {status.replace('_', ' ').toUpperCase()} ({byStatus(status).length})
                </Text>
                {byStatus(status).map(task => (
                  <View key={task.id} style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={{ color: theme.colors.text }}>{task.title}</Text>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                      {task.assignee} · {task.priority}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          />
        )}
      </View>
    );
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2d3142' },
  tab: { flex: 1, padding: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  section: { padding: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  card: { padding: 12, borderRadius: 8, marginBottom: 8 },
});
```

**Example: Offline sync (headless service)**
```tsx
// plugins/offline-sync.plugin.tsx
import { PluginSDK } from '@adas/plugin-sdk';

export default PluginSDK.registerService('offline-sync', {
  capabilities: { offline: true },
  hooks: { onAppStart: true, onConnectivity: true },

  async onStart({ bridge, native }) {
    // Initialize local DB
    await native.storage.db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, title TEXT, status TEXT,
        assignee TEXT, updated_at TEXT, synced INTEGER DEFAULT 0
      )
    `);

    // Sync on connectivity change
    native.connectivity.onChange(async (online) => {
      if (!online) return;
      try {
        const remote = await bridge.mcpCall('tasks.list', {}, 'task-board-mcp');
        for (const t of remote.tasks || []) {
          await native.storage.db.execute(
            `INSERT OR REPLACE INTO tasks (id, title, status, assignee, updated_at, synced)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [t.id, t.title, t.status, t.assignee, t.updated_at]
          );
        }
      } catch (e) {
        // Offline — use cached data
      }
    });
  },
});
```

**Example: QA capture (hybrid — UI + camera)**
```tsx
// plugins/qa-capture.plugin.tsx
import { PluginSDK, View, Text, Pressable, Image, StyleSheet } from '@adas/plugin-sdk';
import { useState } from 'react';

export default PluginSDK.register('qa-capture', {
  type: 'hybrid',
  capabilities: { camera: true, haptics: true },

  Component({ bridge, native, theme }) {
    const [photos, setPhotos] = useState([]);

    const capture = async () => {
      native.haptics.impact('light');
      const result = await native.camera.takePhoto({ quality: 0.8 });
      setPhotos(prev => [...prev, result]);

      // Attach to current QA task via MCP
      await bridge.mcpCall('tasks.add_comment', {
        task_id: 'current-task',
        author: 'qa',
        text: `Bug screenshot: ${result.uri}`,
      }, 'task-board-mcp');
    };

    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <FlatList
          data={photos}
          numColumns={2}
          renderItem={({ item }) => (
            <Image source={{ uri: item.uri }} style={styles.thumb} />
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
              No screenshots yet. Tap the button below to capture.
            </Text>
          }
        />
        <Pressable style={[styles.fab, { backgroundColor: theme.colors.accent }]} onPress={capture}>
          <Text style={{ color: '#fff', fontSize: 24 }}>+</Text>
        </Pressable>
      </View>
    );
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  thumb: { flex: 1, height: 150, margin: 4, borderRadius: 8 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56,
         borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
});
```

---

## 5. A-Team Platform Integration

### 5.1 Connector Manifest Changes

The MCP connector's `ui.getPlugin` response gains new optional fields:

```javascript
// Current (web only)
case "ui.getPlugin":
  return {
    id: "devteam-dashboard",
    name: "Dev Team Dashboard",
    version: "1.0.0",
    render: { mode: "iframe", iframeUrl: "/ui/devteam-dashboard/1.0.0/index.html" },
    channels: ["command"],
    capabilities: { commands: [] },
  };

// Extended (adaptive: web + native)
case "ui.getPlugin":
  return {
    id: "devteam-dashboard",
    name: "Dev Team Dashboard",
    version: "1.0.0",
    type: "ui",
    render: {
      mode: "adaptive",
      iframe: { iframeUrl: "/ui/devteam-dashboard/1.0.0/index.html" },
      reactNative: { component: "devteam-dashboard" },
    },
    native: { offline: true, haptics: true },
    channels: ["command"],
    capabilities: { commands: [] },
  };
```

### 5.2 Platform Discovery Flow

```
1. ateam-mobile calls cp.listContextPlugins → gets plugin summaries
2. For each plugin, calls cp.getContextPlugin(id) → gets full manifest
3. Host checks manifest.render.mode:
   a. 'iframe' → EmbeddedPluginWebView (existing)
   b. 'react-native' → EmbeddedPluginNative (new)
   c. 'adaptive' → check nativePluginRegistry
        → has native bundle? → EmbeddedPluginNative
        → no native bundle? → EmbeddedPluginWebView (fallback)
4. For service/hybrid plugins with hooks.onAppStart:
   → PluginServiceManager.start() at app boot
```

### 5.3 Solution Definition Changes

The solution definition (`aiDevTeamSolution.js`) is **unchanged**. Native plugins are a connector/deployment concern, not a solution architecture concern. The solution still references connectors by ID, and the connector serves the (extended) manifest.

### 5.4 Deployment via `ateam_build_and_run`

Web plugin deployment (unchanged):
```javascript
mcp_store: {
  "devteam-dashboard-mcp": [
    { path: "server.js", content: "..." },
    { path: "package.json", content: "..." },
    { path: "ui-dist/devteam-dashboard/1.0.0/index.html", content: "..." },
  ]
}
```

Native plugin deployment adds a new `native_plugins` section to the `mcp_store` file list:
```javascript
mcp_store: {
  "devteam-dashboard-mcp": [
    { path: "server.js", content: "..." },
    { path: "package.json", content: "..." },
    // Web fallback (still required for web/desktop)
    { path: "ui-dist/devteam-dashboard/1.0.0/index.html", content: "..." },
    // Native plugin source (for Phase 2 OTA delivery)
    { path: "native/devteam-dashboard.plugin.tsx", content: "..." },
  ]
}
```

In Phase 1 (pre-bundled), the `native/` files in `mcp_store` serve as **source of record** — the actual compiled bundle ships with the app binary. In Phase 2 (OTA), the platform would compile and serve these as downloadable bundles.

---

## 6. Implementation Plan

### Phase 1: Foundation (MVP)

**Goal:** One real native plugin working end-to-end with pre-bundled registry.

#### Step 1.1: Plugin SDK Package
- **What:** Create `@adas/plugin-sdk` as a local package in `ateam-mobile`
- **Where:** `/packages/plugin-sdk/` or `ateam-mobile/src/plugin-sdk/`
- **Contains:**
  - TypeScript interfaces (`PluginBridge`, `PluginNative`, `PluginProps`, `ThemeTokens`)
  - `PluginSDK.register()` and `PluginSDK.registerService()` functions
  - Re-exported RN primitives (`View`, `Text`, `FlatList`, etc.)
  - Pre-built components (`Card`, `Badge`, `TabBar`, etc.)
- **Verification:** Types compile, SDK can be imported in a test file

#### Step 1.2: Native Bridge Hook
- **What:** Implement `useNativeBridge(pluginId, connectorId)` in `ateam-mobile`
- **Where:** `ateam-mobile/src/hooks/useNativeBridge.ts`
- **Contains:**
  - `mcpCall()` — direct HTTP to `/api/connectors/:id/call`
  - `mcpFetch()` — direct HTTP to `/mcp`
  - `onInit()`, `sendCommand()`, `onCommand()`
- **Verification:** Unit test that mocks fetch and validates MCP call flow

#### Step 1.3: Native Capabilities Hook
- **What:** Implement `useNativeCapabilities(manifest.native)` in `ateam-mobile`
- **Where:** `ateam-mobile/src/hooks/useNativeCapabilities.ts`
- **Contains:**
  - Camera: wraps `expo-image-picker` / `expo-camera`
  - Location: wraps `expo-location`
  - Storage: wraps `expo-sqlite` + `@react-native-async-storage`
  - Haptics: wraps `expo-haptics` (already installed)
  - Biometrics: wraps `expo-local-authentication`
  - Connectivity: wraps `@react-native-community/netinfo`
  - Notifications: wraps `expo-notifications` (already installed)
- **Verification:** Each capability tested on iOS simulator

#### Step 1.4: Plugin Renderer Components
- **What:** New components for loading and rendering native plugins
- **Where:**
  - `ateam-mobile/src/components/home/EmbeddedPluginNative.tsx`
  - `ateam-mobile/src/plugins/registry.ts`
  - `ateam-mobile/src/plugins/serviceManager.ts`
- **Contains:**
  - `EmbeddedPluginNative` — wraps plugin component with bridge, native, theme props
  - `PluginErrorBoundary` — catches plugin crashes without killing the host
  - `nativePluginRegistry` — lazy-loading map of plugin ID → component
  - `PluginServiceManager` — lifecycle for headless plugins
- **Verification:** Renders a "hello world" native plugin successfully

#### Step 1.5: Host Integration
- **What:** Update home tab to use adaptive renderer
- **Where:**
  - `ateam-mobile/app/(tabs)/index.tsx` — add native plugin rendering path
  - `ateam-mobile/src/api/plugins.ts` — extend `PluginManifest` type
- **Contains:**
  - Updated `PluginManifest` interface with `type`, `native`, `hooks` fields
  - Adaptive rendering logic in the plugin display component
  - Service plugin startup in `_layout.tsx` (app boot)
- **Verification:** Host correctly routes to native or WebView based on manifest

#### Step 1.6: First Native Plugin — Dashboard
- **What:** Port `devteam-dashboard` as an RN plugin (single-file)
- **Where:** `ateam-mobile/src/plugins/devteam-dashboard/index.tsx`
- **Contains:**
  - Task list grouped by status (replacing kanban — mobile-optimized)
  - Knowledge base browser
  - Pull-to-refresh
  - Haptic feedback on interactions
- **Verification:**
  - Plugin loads and displays tasks from `task-board-mcp`
  - Plugin loads and displays docs from `project-knowledge-mcp`
  - Fallback to WebView works when native bundle not found

#### Step 1.7: Update Connector Manifest
- **What:** Update `devteam-dashboard-mcp` to serve adaptive manifest
- **Where:** `ai-dev-team/mcp-server-dashboard/server.js`
- **Contains:**
  - Extended `PLUGIN_MANIFEST` with `mode: 'adaptive'`
  - `type: 'ui'`, `native: { haptics: true }`
- **Verification:** `ui.getPlugin` returns adaptive manifest

### Phase 2: Service Plugins + More Capabilities

#### Step 2.1: Service Plugin Infrastructure
- **What:** Full lifecycle management for headless plugins
- **Contains:** App boot startup, background task scheduling, connectivity hooks
- **Verification:** Offline sync plugin starts on app launch, syncs on reconnect

#### Step 2.2: Second Plugin — Offline Task Sync
- **What:** Headless service that caches tasks locally via SQLite
- **Verification:** Tasks available offline, sync when back online

#### Step 2.3: Third Plugin — QA Capture
- **What:** Hybrid plugin with camera + UI
- **Verification:** Take photo, attach to task via MCP call

### Phase 3: Dynamic Loading (Future)

#### Step 3.1: Bundle Compilation Pipeline
- **What:** Server-side Metro bundler that compiles `.plugin.tsx` → JS bundle
- **Verification:** Bundle loads dynamically via `eval()` or `require()`

#### Step 3.2: OTA Bundle Delivery
- **What:** Plugin bundles served from A-Team Core, cached locally
- **Contains:** Bundle URL in manifest, download + cache + versioning, code signing
- **Verification:** Deploy new plugin version without app store update

#### Step 3.3: Plugin Marketplace
- **What:** Browse / install / uninstall plugins from within the app
- **Verification:** User can add a third-party plugin without app rebuild

---

## 7. Build, Verification & Operations

### 7.1 Build Process

**Development:**
```bash
# In ateam-mobile/
npm start                    # Expo dev server
# Plugin changes hot-reload via Metro (same as any RN component)
```

**Production:**
```bash
# Build with native plugins pre-bundled
eas build --platform ios     # or android
# Plugins in src/plugins/ are compiled into the app binary
```

### 7.2 Verification Checklist

For each native plugin, verify:

- [ ] **Bridge connectivity** — plugin can call `bridge.mcpCall()` and get results
- [ ] **Native capabilities** — requested capabilities work (camera, storage, etc.)
- [ ] **Error boundary** — plugin crash doesn't crash the host app
- [ ] **Theme compliance** — plugin uses `theme` tokens, supports light/dark
- [ ] **Web fallback** — with native bundle removed, adaptive mode falls back to WebView
- [ ] **Memory** — no leaks from mounting/unmounting plugin components
- [ ] **Service lifecycle** — service plugins start/stop cleanly
- [ ] **Offline behavior** — graceful degradation when MCP calls fail

### 7.3 Logging & Debugging

**Plugin bridge logging:**
```typescript
// All MCP calls through native bridge are logged
console.log(`[NativeBridge:${pluginId}] mcpCall ${tool} → ${connectorId}`);
console.log(`[NativeBridge:${pluginId}] result: ${status} (${elapsed}ms)`);
console.error(`[NativeBridge:${pluginId}] error: ${error.message}`);
```

**Plugin lifecycle logging:**
```typescript
console.log(`[PluginLoader] Loading native plugin: ${pluginId}`);
console.log(`[PluginLoader] Fallback to WebView: ${pluginId} (no native bundle)`);
console.log(`[ServiceManager] Starting service: ${pluginId}`);
console.log(`[ServiceManager] Service stopped: ${pluginId}`);
```

**Flipper / React Native Debugger:**
- Native plugins are regular RN components — full debugging support
- Bridge calls visible in Network tab (direct HTTP, not postMessage)
- Component tree visible in React DevTools

**A-Team Platform logs:**
```
GET /deploy/solutions/:id/logs?skill_id=X    # Server-side execution logs
GET /deploy/solutions/:id/metrics             # Timing and bottlenecks
GET /deploy/solutions/:id/health              # Live health check
```

### 7.4 Error Handling

**Plugin crash isolation:**
```typescript
class PluginErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`[Plugin:${this.props.pluginId}] Crash:`, error, info);
    // Optional: report to A-Team Core
  }

  render() {
    if (this.state.hasError) {
      return <PluginCrashScreen pluginId={this.props.pluginId} error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

**Capability unavailability:**
```typescript
// If a capability is not available (e.g., camera on simulator), the SDK returns
// graceful errors instead of crashing:
native.camera.takePhoto()
  // → throws { code: 'UNAVAILABLE', message: 'Camera not available on this device' }
```

---

## 8. Security Considerations

### 8.1 Capability Sandboxing

Native plugins declare capabilities in their manifest. The host **only provides** the capabilities that were declared. Attempting to access undeclared capabilities throws a runtime error:

```typescript
// Plugin declares: native: { camera: true }
// Plugin tries: native.location.getCurrent()
// → throws: "Capability 'location' not declared in plugin manifest"
```

### 8.2 Plugin Isolation

- Each plugin gets its own storage namespace (SQLite DB, AsyncStorage keys)
- Plugins cannot access each other's storage
- Plugins cannot access host app state directly
- File system access is scoped to a plugin-specific directory

### 8.3 MCP Access

Native plugins have the same MCP access as web plugins — they can call any connector registered in the solution. Access control is enforced server-side by A-Team Core (grants, security contracts).

### 8.4 Code Signing (Phase 3)

When dynamic loading is introduced:
- Bundles must be signed by the A-Team platform
- Host verifies signature before evaluating bundle
- Compromised bundles are rejected with clear error

---

## 9. Migration Guide

### For Existing Web Plugins

**No changes required.** All existing iframe plugins continue to work. To add native support:

1. Write the `.plugin.tsx` file
2. Register in `nativePluginRegistry`
3. Update connector manifest from `mode: 'iframe'` to `mode: 'adaptive'`
4. Keep the HTML file as web fallback

### For New Plugins

Solution developers choose:
- **Web-only** (`mode: 'iframe'`) — simplest, write one HTML file
- **Native-only** (`mode: 'react-native'`) — best mobile UX, no web fallback
- **Adaptive** (`mode: 'adaptive'`) — both web and native, host picks best
- **Headless** (`type: 'service'`) — no UI, just native logic

---

## 10. Open Questions

1. **Should the Plugin SDK be a separate npm package or live inside `ateam-mobile`?**
   - Separate package enables sharing with other RN hosts
   - Inside `ateam-mobile` is simpler for Phase 1

2. **How to handle plugin SDK version compatibility?**
   - If SDK evolves, older plugins may break
   - Versioned SDK API with backward compatibility guarantees?

3. **Should Phase 2 OTA loading use Expo Updates, CodePush, or a custom solution?**
   - Expo Updates integrates best with current Expo stack
   - Custom solution gives more control over per-plugin versioning

4. **Should service plugins have resource limits (CPU, memory, battery)?**
   - Runaway background plugins could drain battery
   - Implement a watchdog / resource budget system?

5. **How do native plugins interact with the chat overlay?**
   - Current WebView plugins have a message overlay
   - Native plugins could integrate more deeply (inline responses, action buttons)

---

## Appendix A: File Inventory

### ateam-mobile (host app) — new/modified files

| File | Status | Purpose |
|------|--------|---------|
| `src/plugin-sdk/index.ts` | NEW | SDK types + registration API |
| `src/plugin-sdk/components.ts` | NEW | Pre-built UI components |
| `src/plugin-sdk/primitives.ts` | NEW | Re-exported RN primitives |
| `src/hooks/useNativeBridge.ts` | NEW | Bridge for native plugins |
| `src/hooks/useNativeCapabilities.ts` | NEW | Native API wrappers |
| `src/components/home/EmbeddedPluginNative.tsx` | NEW | Native plugin renderer |
| `src/plugins/registry.ts` | NEW | Plugin ID → component map |
| `src/plugins/serviceManager.ts` | NEW | Headless plugin lifecycle |
| `src/plugins/devteam-dashboard/index.tsx` | NEW | First native plugin |
| `src/api/plugins.ts` | MODIFIED | Extended PluginManifest type |
| `app/(tabs)/index.tsx` | MODIFIED | Adaptive renderer routing |
| `app/_layout.tsx` | MODIFIED | Service plugin startup |

### ai-dev-team (solution) — modified files

| File | Status | Purpose |
|------|--------|---------|
| `mcp-server-dashboard/server.js` | MODIFIED | Adaptive manifest in `ui.getPlugin` |

### A-Team Platform — future changes

| Component | Status | Purpose |
|-----------|--------|---------|
| `cp.getContextPlugin` response | EXTENDED | Accept new manifest fields |
| Plugin health check | EXTENDED | Validate native manifest fields |
| `mcp_store` convention | EXTENDED | Accept `native/` directory |
| Skill Builder UI | EXTENDED | Show native plugin status |

---

## Appendix B: Comparison with Current Connector-UI Pattern

| Aspect | Current (Web Only) | Proposed (Web + Native) |
|--------|-------------------|------------------------|
| Manifest `render.mode` | `'iframe'` only | `'iframe'` / `'react-native'` / `'adaptive'` |
| Plugin artifact | Single HTML file | HTML + `.plugin.tsx` (or just one) |
| Build required | No | No (Phase 1: pre-bundled) |
| Native APIs | None | Camera, GPS, biometrics, offline, etc. |
| Headless plugins | Impossible | Yes (`type: 'service'`) |
| Bridge transport | postMessage (serialized) | Direct function calls |
| Deployment | `mcp_store` `ui-dist/` | Same + `native/` (source of record) |
| Web fallback | N/A (web only) | Automatic via `adaptive` mode |
| Plugin isolation | iframe sandbox | ErrorBoundary + capability gating |
