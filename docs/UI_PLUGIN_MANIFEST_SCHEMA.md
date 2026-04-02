# UI Plugin Manifest Schema

**Status:** Active
**Date:** March 2026

> This schema defines the exact structure of UI plugin manifests returned by `ui.listPlugins` and `ui.getPlugin` tools. Add this to `GET /spec/solution → ui_plugins` section.

---

## Plugin Manifest Schema

### Complete Type Definition

```typescript
interface PluginManifest {
  // REQUIRED: Unique plugin identifier
  id: string;
  // Format: "mcp:<connector-id>:<plugin-name>"
  // Example: "mcp:ecommerce-mcp:order-dashboard"
  // Constraints:
  //   - Must start with "mcp:"
  //   - Connector ID must match declared platform_connectors[].id
  //   - Plugin name must match the directory in ui-dist/

  // REQUIRED: Display name for UI
  name: string;
  // Example: "Order Dashboard"
  // Constraints:
  //   - 1-100 characters
  //   - Human-readable (no special chars except spaces, hyphens, underscores)

  // REQUIRED: Semantic version
  version: string;
  // Format: "MAJOR.MINOR.PATCH" (semver)
  // Example: "1.0.0", "2.1.5"
  // Constraints:
  //   - Must match directory structure: ui-dist/{pluginId}/index.html
  //   - Numeric only (no 'v' prefix, no prerelease tags like -beta)

  // Optional: Brief description
  description?: string;
  // Example: "Real-time order tracking and status management"
  // Constraints: 1-500 characters

  // REQUIRED: Rendering configuration (polymorphic)
  render: RenderConfig;

  // Optional: Plugin type (determines lifecycle & behavior)
  type?: 'ui' | 'service' | 'hybrid';
  // Default: 'ui'
  // 'ui' = visual dashboard
  // 'service' = headless (no UI, background task)
  // 'hybrid' = both UI and background logic

  // Optional: Native device capabilities requested
  capabilities?: PluginCapabilities;

  // Optional: Communication channels
  channels?: string[];
  // Example: ["order-updates", "payment-status"]
  // Constraints: lowercase alphanumeric and hyphens only

  // Optional: Commands the plugin handles
  // Allows AI planner to call plugin methods
  commands?: PluginCommand[];
}

// ─────────────────────────────────────────────

interface RenderConfig {
  // Polymorphic: exactly ONE of these must be present
  mode: 'iframe' | 'react-native' | 'adaptive';
}

// For iframe-based plugins (web)
interface IframeRenderConfig extends RenderConfig {
  mode: 'iframe';

  // REQUIRED: URL path to HTML file
  iframeUrl: string;
  // Format: "/ui/{pluginId}/{version}/index.html"
  // Example: "/ui/order-dashboard/1.0.0/index.html"
  // Constraints:
  //   - Must start with /ui/
  //   - Must NOT include the /mcp-ui/{tenant}/{connectorId}/ prefix
  //   - Platform auto-prepends the prefix when serving
  //   - File MUST exist in connector's mcp_store

  // Optional: Allow framing from external origins
  external?: boolean;
  // Default: false
  // If true: iframe can be embedded on external domains
  // If false: only served within A-Team (X-Frame-Options: SAMEORIGIN)
}

// For native mobile plugins (React Native)
interface ReactNativeRenderConfig extends RenderConfig {
  mode: 'react-native';

  // REQUIRED: Registered component name
  component: string;
  // Example: "OrderDashboard" or "my-dashboard"
  // Constraints:
  //   - Must match PluginSDK.register(name, {...})
  //   - Must be imported and registered in ateam-mobile
  //   - No file path — just the component identifier

  // Optional: Bundle identifier
  bundleId?: string;
  // For future use: separate bundle for this plugin
}

// For adaptive plugins (both platforms)
interface AdaptiveRenderConfig extends RenderConfig {
  mode: 'adaptive';

  // REQUIRED: Configuration for iframe fallback
  iframe: IframeRenderConfig;

  // REQUIRED: Configuration for native mobile
  reactNative: ReactNativeRenderConfig;

  // Platform choice logic:
  // - Web/browser → use iframe config
  // - React Native app → use reactNative config
  // - Fallback → use iframe config if reactNative unavailable
}

// ─────────────────────────────────────────────

interface PluginCapabilities {
  haptics?: boolean;
  // Android/iOS: vibration feedback
  // Web: (ignored)

  camera?: boolean;
  // Native: access device camera
  // Web: (ignored)

  location?: boolean;
  // Native: GPS/location services
  // Web: (ignored)

  storage?: boolean;
  // Native: local file system
  // Web: localStorage/IndexedDB

  notifications?: boolean;
  // Native: push notifications
  // Web: browser notifications
}

// ─────────────────────────────────────────────

interface PluginCommand {
  // Command identifier
  name: string;
  // Example: "highlight_order", "refresh_data"
  // Constraints: lowercase alphanumeric and underscores only

  // Human-readable description
  description: string;
  // Example: "Highlight a specific order in the dashboard"

  // JSON Schema for command arguments
  input_schema?: {
    type: 'object';
    properties: Record<string, JSONSchema>;
    required?: string[];
    additionalProperties?: boolean;
  };
  // Example:
  // {
  //   type: "object",
  //   properties: {
  //     order_id: { type: "string", description: "The order ID to highlight" },
  //     highlight_color: { type: "string", enum: ["red", "blue", "green"] }
  //   },
  //   required: ["order_id"]
  // }
}

type JSONSchema = any; // Standard JSON Schema properties
```

---

## Validation Rules

### Required Fields

All plugins MUST have:

```typescript
✓ id          string    mcp:<connector>:<name>
✓ name        string    1-100 chars
✓ version     string    X.Y.Z semver
✓ render      object    mode + config
```

### ID Format Validation

```
Pattern: ^mcp:[a-z0-9-]+:[a-z0-9-]+$

Valid:
  ✓ "mcp:ecommerce-mcp:order-dashboard"
  ✓ "mcp:crm:customer-view"
  ✓ "mcp:my-connector:plugin-1"

Invalid:
  ✗ "ecommerce-mcp:order-dashboard"    (missing "mcp:")
  ✗ "mcp:EcommerceMCP:OrderDashboard"  (uppercase)
  ✗ "mcp:ecommerce_mcp:plugin"         (underscores not allowed)
  ✗ "order-dashboard"                  (bare name, no prefix)
```

### Render Config Validation

**For `mode: "iframe"`:**
```typescript
✓ render: {
    mode: "iframe",
    iframeUrl: "/ui/my-plugin/1.0.0/index.html",
    external?: false
  }

✗ render: {
    mode: "iframe",
    iframeUrl: "my-plugin.html"  // Must start with /ui/
  }

✗ render: {
    mode: "iframe",
    url: "/ui/my-plugin/1.0.0/index.html"  // Wrong field name (use iframeUrl)
  }

✗ render: {
    mode: "iframe"
    // Missing iframeUrl
  }
```

**For `mode: "react-native"`:**
```typescript
✓ render: {
    mode: "react-native",
    component: "MyPluginComponent"
  }

✗ render: {
    mode: "react-native",
    component: "./my-plugin"  // No file path
  }

✗ render: {
    mode: "react-native",
    componentName: "MyPlugin"  // Wrong field name (use component)
  }
```

**For `mode: "adaptive"`:**
```typescript
✓ render: {
    mode: "adaptive",
    iframe: { iframeUrl: "/ui/plugin/1.0.0/index.html" },
    reactNative: { component: "MyPlugin" }
  }

✗ render: {
    mode: "adaptive",
    iframe: { iframeUrl: "..." }
    // Missing reactNative config
  }
```

### File Path Validation

For iframe plugins, validate file existence:

```
Given:
  connector_id = "ecommerce-mcp"
  plugin_id = "mcp:ecommerce-mcp:order-dashboard"
  version = "1.0.0"
  iframeUrl = "/ui/order-dashboard/1.0.0/index.html"

Expected file location:
  _builder/{connectorId}/ui-dist/order-dashboard/1.0.0/index.html
  → _builder/ecommerce-mcp/ui-dist/order-dashboard/1.0.0/index.html

Served at:
  /mcp-ui/{tenant}/{connectorId}/{path}
  → /mcp-ui/main/ecommerce-mcp/ui/order-dashboard/1.0.0/index.html

Validation:
  1. File MUST exist in mcp_store
  2. File size MUST be < 10MB
  3. Must be valid HTML (not empty)
  4. Check via HTTP HEAD to /mcp-ui/... during deploy
```

### Version Format Validation

```typescript
Pattern: ^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$

Valid:
  ✓ "1.0.0"
  ✓ "2.1.5"
  ✓ "0.0.1"
  ✓ "10.100.1000"

Invalid:
  ✗ "v1.0.0"       (no 'v' prefix)
  ✗ "1.0"          (incomplete)
  ✗ "1.0.0-beta"   (no prerelease)
  ✗ "latest"       (not semver)
```

### Capabilities Validation

```typescript
// All properties are optional booleans
capabilities: {
  haptics?: boolean,
  camera?: boolean,
  location?: boolean,
  storage?: boolean,
  notifications?: boolean
}

// Invalid:
✗ capabilities: {
    haptics: "yes"  // Must be boolean
  }

✗ capabilities: {
    bluetooth: true  // Unknown capability
  }
```

### Commands Validation

```typescript
commands: [
  {
    name: "highlight_order",  // lowercase_underscore only
    description: "Highlight an order",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" }
      },
      required: ["order_id"]
    }
  }
]

// Invalid:
✗ {
    name: "HighlightOrder"  // Must be lowercase_underscore
  }

✗ {
    name: "highlight order"  // Spaces not allowed
  }

✗ {
    // Missing description
    name: "refresh"
  }
```

---

## Validation Errors & Messages

### Missing Required Field

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_manifest_required_field",
  "message": "Plugin 'mcp:ecommerce-mcp:dashboard' is missing required field: 'render'",
  "plugin_id": "mcp:ecommerce-mcp:dashboard",
  "missing_field": "render"
}
```

### Invalid ID Format

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_id_format",
  "message": "Plugin ID 'ecommerce-dashboard' does not match format 'mcp:<connector>:<name>'",
  "plugin_id": "ecommerce-dashboard",
  "pattern": "^mcp:[a-z0-9-]+:[a-z0-9-]+$"
}
```

### Connector Not Found

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_connector_exists",
  "message": "Plugin 'mcp:unknown-mcp:dashboard' references connector 'unknown-mcp' which is not declared",
  "plugin_id": "mcp:unknown-mcp:dashboard",
  "connector_id": "unknown-mcp"
}
```

### iframeUrl File Not Found

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_iframe_file_not_found",
  "message": "Plugin 'mcp:ecommerce-mcp:dashboard' iframeUrl '/ui/dashboard/1.0.0/index.html' file not found in mcp_store",
  "plugin_id": "mcp:ecommerce-mcp:dashboard",
  "iframeUrl": "/ui/dashboard/1.0.0/index.html",
  "expected_path": "_builder/ecommerce-mcp/ui-dist/dashboard/1.0.0/index.html"
}
```

### Invalid Version Format

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_version_format",
  "message": "Plugin version 'latest' is not valid semver. Must be X.Y.Z (e.g., '1.0.0')",
  "version": "latest",
  "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$"
}
```

### React Native Component Not Registered

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_component_not_registered",
  "message": "Plugin 'mcp:mobile-mcp:dashboard' render.component 'UnknownDashboard' is not registered in ateam-mobile",
  "plugin_id": "mcp:mobile-mcp:dashboard",
  "component": "UnknownDashboard",
  "registered_components": ["OrderDashboard", "TaskBoard", "...]
}
```

### Render Config Invalid

```json
{
  "error": "PLUGIN_MANIFEST_INVALID",
  "check": "plugin_render_config_invalid",
  "message": "Plugin 'mcp:web-mcp:dashboard' render.mode 'webview' is invalid. Must be one of: 'iframe', 'react-native', 'adaptive'",
  "plugin_id": "mcp:web-mcp:dashboard",
  "mode": "webview",
  "valid_modes": ["iframe", "react-native", "adaptive"]
}
```

---

## Example: Valid Complete Manifest

### Iframe Plugin (Web Only)

```json
{
  "id": "mcp:ecommerce-mcp:order-dashboard",
  "name": "Order Dashboard",
  "version": "1.2.3",
  "description": "Real-time order tracking and management",
  "type": "ui",
  "render": {
    "mode": "iframe",
    "iframeUrl": "/ui/order-dashboard/1.2.3/index.html"
  },
  "channels": ["order-updates", "payment-status"],
  "commands": [
    {
      "name": "highlight_order",
      "description": "Highlight a specific order",
      "input_schema": {
        "type": "object",
        "properties": {
          "order_id": {
            "type": "string",
            "description": "Order ID to highlight"
          }
        },
        "required": ["order_id"]
      }
    }
  ]
}
```

### React Native Plugin (Mobile Only)

```json
{
  "id": "mcp:mobile-mcp:task-board",
  "name": "Task Board",
  "version": "2.0.0",
  "description": "Mobile-optimized task management",
  "type": "ui",
  "render": {
    "mode": "react-native",
    "component": "TaskBoardPlugin"
  },
  "capabilities": {
    "haptics": true,
    "notifications": true
  },
  "commands": [
    {
      "name": "focus_task",
      "description": "Focus on a specific task",
      "input_schema": {
        "type": "object",
        "properties": {
          "task_id": {
            "type": "string"
          }
        },
        "required": ["task_id"]
      }
    }
  ]
}
```

### Adaptive Plugin (Both Platforms)

```json
{
  "id": "mcp:universal-mcp:dashboard",
  "name": "Universal Dashboard",
  "version": "1.5.0",
  "description": "Works on web and mobile",
  "type": "ui",
  "render": {
    "mode": "adaptive",
    "iframe": {
      "iframeUrl": "/ui/dashboard/1.5.0/index.html"
    },
    "reactNative": {
      "component": "DashboardPlugin"
    }
  }
}
```

---

## Validation Checklist

- [ ] `id` matches pattern `mcp:[a-z0-9-]+:[a-z0-9-]+`
- [ ] `name` is 1-100 characters
- [ ] `version` matches semver pattern `X.Y.Z`
- [ ] `render` is present and has valid `mode`
- [ ] For iframe: `render.iframeUrl` starts with `/ui/`
- [ ] For iframe: file exists in `mcp_store`
- [ ] For react-native: `render.component` is registered
- [ ] Connector ID from `id` exists in `platform_connectors`
- [ ] `type` is one of: `ui`, `service`, `hybrid` (or omitted)
- [ ] All `capabilities` are valid boolean flags
- [ ] All `commands` have `name` and `description`
- [ ] Command `name` matches `^[a-z0-9_]+$`

---

## Integration with GET /spec/solution

This schema should be added to the `GET /spec/solution` response under:

```
solution_spec.ui_plugins.manifest_validation_schema
```

And referenced in:

```
solution_spec.key_concepts.ui_capable_connectors.manifest_contract
```

See `docs/UI_PLUGIN_DEVELOPMENT_GUIDE.md` for implementation examples.
