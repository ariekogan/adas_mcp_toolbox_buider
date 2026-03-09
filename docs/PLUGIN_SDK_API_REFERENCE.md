# Plugin SDK API Reference

**Status:** Active
**Date:** March 2026
**Applies to:** Native Mobile Plugins (React Native)

> Complete API reference for building native mobile UI plugins. This document covers all available methods, types, and patterns for the `PluginSDK`.

---

## Overview

Native plugins run as React Native components inside the `ateam-mobile` host app. They communicate with backend connectors through a unified API layer.

```
Plugin Component
  ↓ useApi(bridge)
Plugin SDK (useApi hook)
  ↓ bridge.mcpToolCall()
MCP Client HTTP layer
  ↓
ADAS Core API
  ↓
Connector (backend)
  ↓ tool execution
Response ← Plugin
```

---

## 1. Plugin Registration

### `PluginSDK.register(pluginId, config)`

Register a native plugin with the system.

```typescript
import { PluginSDK } from '../../plugin-sdk';
import type { PluginProps } from '../../plugin-sdk/types';

export default PluginSDK.register('my-plugin', {
  // Metadata
  type: 'ui' | 'service' | 'hybrid',     // default: 'ui'
  description?: string,
  version?: string,                       // default: '1.0.0'

  // Declare native capabilities
  capabilities?: {
    haptics?: boolean,                    // Haptic feedback
    camera?: boolean,                     // Camera access
    location?: boolean,                   // GPS access
    storage?: boolean,                    // File system
    notifications?: boolean               // Push notifications
  },

  // The component itself
  Component(props: PluginProps) {
    // Your plugin UI goes here
  }
});
```

**Example:**

```typescript
export default PluginSDK.register('devteam-dashboard', {
  type: 'ui',
  description: 'Team task board and knowledge base',
  version: '1.0.0',
  capabilities: { haptics: true },

  Component({ bridge, native, theme }: PluginProps) {
    const api = useApi(bridge);
    // ... component code
  }
});
```

---

## 2. PluginProps Interface

Component receives these props:

```typescript
interface PluginProps {
  // The bridge to call connector tools
  bridge: PluginBridge;

  // Native device APIs
  native: {
    haptics: HapticsAPI;
  };

  // Design tokens (colors, fonts, spacing)
  theme: ThemeTokens;
}
```

### `bridge: PluginBridge`

Object for calling MCP tools. Use via `useApi()` hook (see section 3).

```typescript
// Low-level access (rarely needed)
const result = await bridge.mcpToolCall('tool-name', args);
```

### `native.haptics: HapticsAPI`

Haptic feedback (requires `capabilities: { haptics: true }`):

```typescript
native.haptics.selection();  // Light selection tap
native.haptics.success();    // Success/confirmation buzz
native.haptics.warning();    // Warning vibration
native.haptics.error();      // Error/failure buzz
```

**Example:**

```typescript
<Pressable
  onPress={() => {
    native.haptics.success();
    handleAction();
  }}
>
  <Text>Delete Task</Text>
</Pressable>
```

### `theme: ThemeTokens`

Design tokens for consistent styling:

```typescript
interface ThemeTokens {
  colors: {
    bg: string;               // Primary background
    bgSecondary: string;      // Secondary background
    surface: string;          // Card/surface color
    text: string;             // Primary text
    textSecondary: string;    // Secondary text
    textMuted: string;        // Muted/disabled text
    accent: string;           // Primary action color
    border: string;           // Border color
    error: string;            // Error/danger color
    success: string;          // Success color
    warning: string;          // Warning color
    purple: string;           // Purple accent
    accentSoft: string;       // Light accent background
    purpleSoft: string;       // Light purple background
  };

  fontSize: {
    xs: number;               // Extra small (10px)
    sm: number;               // Small (12px)
    base: number;             // Base (14px)
    lg: number;               // Large (16px)
    xl: number;               // Extra large (18px)
    '2xl': number;            // 2x large (20px)
  };

  borderRadius: {
    none: number;             // 0
    sm: number;               // 4
    base: number;             // 6
    lg: number;               // 8
    xl: number;               // 12
    full: number;             // 9999
  };

  spacing: {
    xs: number;               // 4px
    sm: number;               // 8px
    md: number;               // 12px
    lg: number;               // 16px
    xl: number;               // 20px
  };
}
```

**Usage:**

```typescript
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  muted: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
});
```

---

## 3. useApi Hook

High-level API for calling connector tools. **Use this for all tool calls.**

```typescript
import { useApi } from '../../plugin-sdk';

function MyPlugin({ bridge }: PluginProps) {
  const api = useApi(bridge);

  // Call a connector tool
  const result = await api.call(toolName, args);
}
```

### `api.call(toolName, args)`

Call a connector tool and wait for result.

```typescript
const api = useApi(bridge);

try {
  const result = await api.call('tasks.list', {
    status: 'open',
    limit: 20
  });

  console.log('Returned:', result);
  // result is auto-unwrapped (no MCP envelope)
} catch (err) {
  console.error('Tool failed:', err.message);
}
```

**Parameters:**
- `toolName` (string) — Name of connector tool (e.g., `"tasks.list"`)
- `args` (object) — Tool arguments

**Returns:** Promise<any>
- Resolves with the tool result (auto-unwrapped from MCP response)
- Rejects if tool fails or times out (15 seconds)

**Example with all parameters:**

```typescript
const { title, total } = await api.call('tasks.list', {
  status: 'open',
  priority: 'high',
  assignee: 'me',
  limit: 50,
  offset: 0
});
```

### Complete Example Pattern

```typescript
function TaskDashboard({ bridge, theme }: PluginProps) {
  const api = useApi(bridge);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      // Call connector tool
      const result = await api.call('tasks.list', {
        status: 'open'
      });

      // Result is already unwrapped
      setTasks(result.tasks || []);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <ActivityIndicator />;
  }

  if (error) {
    return (
      <View>
        <Text style={{ color: theme.colors.error }}>Error: {error}</Text>
        <Button title="Retry" onPress={loadTasks} />
      </View>
    );
  }

  return (
    <FlatList
      data={tasks}
      renderItem={({ item }) => (
        <TaskCard task={item} theme={theme} />
      )}
      keyExtractor={item => item.id}
    />
  );
}
```

---

## 4. PluginBridge Interface (Low-Level)

Direct access to MCP transport. **Usually not needed** — use `useApi()` instead.

```typescript
interface PluginBridge {
  // Call an MCP tool directly
  mcpToolCall(toolName: string, args: Record<string, any>): Promise<any>;

  // Call connector-specific endpoint (if exposed)
  mcpFetch(body: any): Promise<any>;

  // Handle commands from the agent (e.g., "refresh", "focus")
  onCommand(handler: (cmd: string, args: any) => Promise<any>): void;
}
```

### `bridge.mcpToolCall(toolName, args)`

Low-level tool call. Equivalent to `useApi(bridge).call()`.

```typescript
// Low-level
const result = await bridge.mcpToolCall('tasks.list', { status: 'open' });

// High-level (preferred)
const api = useApi(bridge);
const result = await api.call('tasks.list', { status: 'open' });
```

### `bridge.onCommand(handler)`

Listen for agent commands sent to the plugin.

```typescript
bridge.onCommand(async (command, args) => {
  switch (command) {
    case 'refresh':
      await loadData();
      return { ok: true };
    case 'focus':
      scrollToTop();
      return { ok: true };
    default:
      return { ok: false, error: `Unknown command: ${command}` };
  }
});
```

---

## 5. Error Handling

### Common Errors

```typescript
try {
  const result = await api.call('my-tool', {});
} catch (err) {
  if (err.message.includes('timeout')) {
    // Tool took > 15 seconds
    console.error('Connector is slow or tool is hanging');
  } else if (err.message.includes('not found')) {
    // Tool doesn't exist in connector
    console.error('Tool "my-tool" not defined in connector');
  } else if (err.message.includes('invalid args')) {
    // Arguments don't match tool signature
    console.error('Check tool arguments:', err);
  } else {
    // Generic error
    console.error('Tool failed:', err.message);
  }
}
```

### Timeout Handling

Tools have a **15-second timeout**. Long-running operations should:

```typescript
// Show loading indicator
setLoading(true);

try {
  // This will wait up to 15 seconds
  const result = await api.call('slow-operation', {});
  setData(result);
} catch (err) {
  if (err.message.includes('timeout')) {
    setError('Operation took too long. Try again.');
  } else {
    setError(err.message);
  }
} finally {
  setLoading(false);
}
```

---

## 6. Best Practices

### Do ✅

```typescript
// 1. Use useApi() for all tool calls
const api = useApi(bridge);
const result = await api.call('tool-name', args);

// 2. Handle errors gracefully
try {
  const data = await api.call(...);
} catch (err) {
  setError(err.message);
}

// 3. Use theme tokens for styling
<Text style={{ color: theme.colors.text }} />

// 4. Provide loading states
{loading ? <Spinner /> : <Content />}

// 5. Use haptics for feedback
<Pressable onPress={() => { native.haptics.success(); action(); }}>

// 6. Memo expensive components
const TaskCard = React.memo(({ task }) => {...});
```

### Don't ❌

```typescript
// 1. Don't use bridge.mcpToolCall() directly
const result = await bridge.mcpToolCall(...); // ❌ Use useApi instead

// 2. Don't ignore errors
api.call('tool', {}); // ❌ Should have .catch() or try/catch

// 3. Don't hardcode colors
<Text style={{ color: '#333' }} /> // ❌ Use theme.colors

// 4. Don't make HTTP requests directly
fetch('http://...'); // ❌ Use api.call() instead

// 5. Don't block the UI
for (let i = 0; i < 1000000; i++) { ... } // ❌ Causes jank

// 6. Don't re-create styles every render
const styles = StyleSheet.create(...); // ❌ Should be at module level
```

---

## 7. Type Definitions

### PluginSDK.register()

```typescript
interface PluginConfig {
  type?: 'ui' | 'service' | 'hybrid';
  description?: string;
  version?: string;
  capabilities?: {
    haptics?: boolean;
    camera?: boolean;
    location?: boolean;
    storage?: boolean;
    notifications?: boolean;
  };
  Component: React.FC<PluginProps>;
}
```

### Tool Result Types

Tool results are automatically unwrapped. Common patterns:

```typescript
// List tools return wrapped results
const { tasks, total } = await api.call('tasks.list', {});
// Type: { tasks: Task[], total: number }

// Get tools return single objects
const task = await api.call('tasks.get', { id: '123' });
// Type: Task

// Action tools return status
const { ok, error } = await api.call('tasks.create', { title: 'New' });
// Type: { ok: boolean, error?: string }

// Batch tools return arrays
const results = await api.call('tasks.batch-update', { updates: [...] });
// Type: Task[]
```

---

## 8. Testing

### Mock useApi for Unit Tests

```typescript
import { renderHook, act } from '@testing-library/react-native';

test('loads tasks', async () => {
  const mockApi = {
    call: jest.fn().mockResolvedValue({
      tasks: [{ id: '1', title: 'Task 1' }]
    })
  };

  // Mock useApi to return mockApi
  jest.mock('../../plugin-sdk', () => ({
    useApi: () => mockApi
  }));

  // ... test component
  expect(mockApi.call).toHaveBeenCalledWith('tasks.list', expect.any(Object));
});
```

### Simulate Plugin in Dev

```typescript
// In your plugin component, during development:
const mockBridge: PluginBridge = {
  mcpToolCall: async (toolName, args) => {
    console.log('Mock call:', toolName, args);
    // Return mock data
    if (toolName === 'tasks.list') {
      return {
        tasks: [
          { id: '1', title: 'Mock Task', status: 'open' }
        ]
      };
    }
  },
  onCommand: () => {}
};

const api = useApi(mockBridge);
```

---

## 9. Manifest Contract

When your plugin is deployed, the connector's `ui.listPlugins` must return:

```typescript
{
  "plugins": [
    {
      "id": "mcp:my-connector:my-plugin",
      "name": "My Plugin",
      "version": "1.0.0",
      "type": "ui",
      "description": "Does cool stuff",
      "render": {
        "mode": "react-native",
        "component": "MyPluginComponent"
      }
    }
  ]
}
```

**Validation:**
- `id` — Must match `PluginSDK.register(id, ...)`
- `render.component` — Must be registered via SDK
- `render.mode` — Must be `"react-native"`

---

## See Also

- `docs/UI_PLUGIN_DEVELOPMENT_GUIDE.md` — Full development tutorial
- `docs/PLUGIN_PROTOCOL_SPEC.md` — postMessage protocol (web plugins)
- `ateam-mobile/src/plugin-sdk/types.ts` — Full type definitions
- `ateam-mobile/src/plugins/devteam-dashboard/index.tsx` — Production example
