# Building Mobile-First Solutions with A-Team

**For:** External Solution Developers
**Version:** 1.0.0
**Last Updated:** March 15, 2026

---

## Quick Navigation

- **Building a standard solution?** → Skip this, use `/spec/solution`
- **Adding UI dashboards?** → Jump to [UI Plugins Section](#-ui-plugins-for-interactive-dashboards)
- **Building for mobile?** → Jump to [Mobile Solutions Section](#-mobile-first-solutions)
- **Adding background tasks?** → Jump to [Functional Connectors Section](#-functional-connectors-background-tasks)

---

## 🎯 Do You Need This Guide?

| Your Use Case | Read This? |
|---|---|
| Building standard multi-skill solution (web + API) | ❌ No, use `/spec/solution` |
| Adding interactive dashboards/UI | ✅ Yes, [UI Plugins](#-ui-plugins-for-interactive-dashboards) |
| Building mobile-first app | ✅ Yes, [Mobile Solutions](#-mobile-first-solutions) |
| Background data collection/sync | ✅ Yes, [Functional Connectors](#-functional-connectors-background-tasks) |

---

## 🎨 UI Plugins for Interactive Dashboards

### What Are UI Plugins?

Interactive dashboards that your skills can present to users. Think:
- Order management dashboard
- Inventory tracker
- Analytics visualization
- Form builders
- Real-time monitoring

### Three Rendering Modes

```
┌─────────────────────────────────────────┐
│        Your Skill Says:                  │
│  "Show the order dashboard"              │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ↓             ↓
    WEB APP      MOBILE APP
    (iframe)     (React Native)
```

### For Web Users

```json
{
  "ui_plugins": [{
    "id": "mcp:your-connector:order-dashboard",
    "name": "Order Dashboard",
    "version": "1.0.0",
    "render": {
      "mode": "iframe",
      "iframeUrl": "/ui/order-dashboard/1.0.0/index.html"
    }
  }]
}
```

**What you provide:**
- `iframeUrl` — Path to HTML file in your connector
- HTML + CSS + JavaScript (any framework: React, Vue, vanilla)
- Calls connector tools via `postMessage` API

**Deployment:**
```bash
ateam_build_and_run solution.json skills/*
# System auto-uploads HTML file to Core
```

---

### For Mobile Users (React Native)

```json
{
  "ui_plugins": [{
    "id": "mcp:your-connector:order-dashboard",
    "name": "Order Dashboard",
    "version": "1.0.0",
    "render": {
      "mode": "react-native",
      "component": "OrderDashboard"
    }
  }]
}
```

**What you provide:**
- React Native component file (TypeScript/JavaScript)
- Uses `useApi()` hook to call connector tools
- System auto-bundles and serves from Core

**Build Step:**
```typescript
// your-connector/rn-src/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { PluginSDK, useApi } from '@adas/plugin-sdk';

function OrderDashboard({ bridge, native, theme }) {
  const api = useApi(bridge);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    api.call('orders.list', {}).then(setOrders);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={orders}
        renderItem={({ item }) => (
          <Text style={{ color: theme.colors.text }}>{item.name}</Text>
        )}
      />
    </View>
  );
}

export default PluginSDK.register('OrderDashboard', { component: OrderDashboard });
```

**Config in package.json:**
```json
{
  "scripts": {
    "build": "node esbuild.config.mjs"
  }
}
```

**esbuild.config.mjs:**
```javascript
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['rn-src/index.tsx'],
  bundle: true,
  outfile: 'rn-bundle/index.bundle.js',
  format: 'cjs',  // ← MUST be CommonJS
  platform: 'neutral',
  target: 'es2020',
  external: ['react', 'react-native', '@adas/plugin-sdk'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  minify: false,
});
```

**Deployment:**
```bash
ateam_build_and_run solution.json skills/*
# System auto-runs: npm install → npm run build → uploads bundle
```

---

### For Both Web AND Mobile (Adaptive Mode)

```json
{
  "ui_plugins": [{
    "id": "mcp:your-connector:order-dashboard",
    "name": "Order Dashboard",
    "version": "1.0.0",
    "render": {
      "mode": "adaptive",
      "iframeUrl": "/ui/order-dashboard/1.0.0/index.html",
      "reactNative": {
        "component": "OrderDashboard"
      }
    }
  }]
}
```

**Deployment:**
```bash
ateam_build_and_run solution.json skills/*
# System handles both:
# - Uploads HTML for web
# - Builds and uploads React Native bundle for mobile
```

---

## 📱 Mobile-First Solutions

### What Makes a Solution "Mobile-First"?

Your solution is optimized for mobile (ateam-mobile app) with:
- ✅ UI plugins for rich dashboards
- ✅ Functional connectors for background tasks
- ✅ Skills that work offline/async
- ✅ Device capability access

### Real Example: Personal Assistant

```
┌─────────────────────────────────────────┐
│         Personal Assistant              │
│         (mobile-pa solution)            │
├─────────────────────────────────────────┤
│  SKILLS:                                │
│  • schedule-meeting                     │
│  • get-directions                       │
│  • manage-calendar                      │
│  • check-battery                        │
│                                         │
│  UI PLUGINS:                            │
│  • calendar-dashboard (show events)     │
│  • maps-plugin (show directions)        │
│  • battery-monitor (show device status) │
│                                         │
│  CONNECTORS (Background):               │
│  • device-bridge (collect device data)  │
│  • calendar-sync (sync calendar)        │
│  • location-tracker (GPS background)    │
└─────────────────────────────────────────┘
```

---

## 🔧 Functional Connectors (Background Tasks)

### What Are They?

Pure JavaScript services that run in the app's background:
- Collect device data (calendar, location, battery, etc.)
- Sync to cloud
- Poll for actions
- Run independently of UI

### Real Example: Device Bridge

```typescript
// my-solution/device-bridge/index.ts
export default {
  id: 'device-bridge',
  name: 'Device Data Bridge',
  version: '1.0.0',
  type: 'background',  // Runs continuously

  // Called when app starts
  async onStart({ bridge, config }) {
    console.log('Device bridge started');
  },

  // Called periodically (every sync_interval ms)
  async onSync({ bridge, config }) {
    // Collect device data
    const calendar = await bridge.calendar.list();
    const battery = await bridge.battery.getStatus();

    // Send to cloud
    await fetch(config.relay_url, {
      method: 'POST',
      body: JSON.stringify({ calendar, battery })
    });
  },

  // Called when user returns to app (foreground)
  async onForeground({ bridge, config }) {
    console.log('App in foreground, syncing...');
  },

  // Called when app closes
  async onStop({ bridge, config }) {
    console.log('Device bridge stopping');
  }
};
```

### Available Device APIs (Bridge)

All pure JavaScript, no native code:

```typescript
// Calendar
bridge.calendar.list()           // Get events
bridge.calendar.create(event)    // Create event

// Location
bridge.location.start()          // Begin tracking
bridge.location.stop()           // Stop tracking
bridge.location.getLastKnown()   // Get cached position

// Contacts
bridge.contacts.list()           // Get all contacts
bridge.contacts.find(query)      // Search contacts

// Battery
bridge.battery.getStatus()       // Get level + charging state

// Network
bridge.network.getType()         // 'wifi' | '4g' | '3g' | 'none'

// Notifications
bridge.notifications.send(title, body)

// SMS
bridge.sms.send(number, message)

// Maps
bridge.maps.openNavigation(lat, lng)

// HTTP
bridge.http.get(url)
bridge.http.post(url, body)

// Storage
bridge.storage.get(key)
bridge.storage.set(key, value)

// Permissions
bridge.permissions.request('calendar')
bridge.permissions.check('location')

// Device
bridge.device.getInfo()          // Model, OS, version, etc.

// Logging
bridge.log.info('message')
bridge.log.error('error')
```

### Deployment

**In solution.json:**
```json
{
  "functional_connectors": [{
    "id": "device-bridge",
    "name": "Device Data Bridge",
    "module": "@your-org/device-bridge",
    "type": "background",
    "autoStart": true,
    "permissions": ["calendar", "location", "battery", "connectivity"],
    "config": {
      "relay_url": "https://your-server.com/sync",
      "device_id": "auto-generated",
      "api_key": "from-config"
    }
  }]
}
```

**Deploy:**
```bash
# 1. Publish to npm
npm publish

# 2. Deploy solution
ateam_build_and_run solution.json skills/*
```

**Mobile app auto-loads:**
- npm installs `@your-org/device-bridge`
- Connector runs in background
- Syncs device data periodically

---

## 🚀 Quick Start: Building a Mobile Solution

### Step 1: Define Your Skills

```bash
# skills/
#  ├─ schedule-meeting/skill.json
#  ├─ get-directions/skill.json
#  └─ check-battery/skill.json
```

Standard skills, nothing special. See `/spec/skill` for details.

### Step 2: Create UI Plugins (Optional)

```bash
# your-connector/
# ├─ rn-src/index.tsx          ← React Native component
# ├─ rn-bundle/                ← Auto-generated
# ├─ ui-dist/                  ← HTML files for web
# └─ esbuild.config.mjs        ← Build config
```

### Step 3: Create Connectors (Optional)

```bash
# your-connector/
# └─ index.ts                  ← Device bridge implementation
```

### Step 4: Define Solution

```json
{
  "id": "my-mobile-solution",
  "name": "My Mobile Solution",
  "linked_skills": [
    { "id": "schedule-meeting" },
    { "id": "get-directions" },
    { "id": "check-battery" }
  ],
  "ui_plugins": [{
    "id": "mcp:my-connector:dashboard",
    "render": { "mode": "react-native", "component": "Dashboard" }
  }],
  "functional_connectors": [{
    "id": "device-bridge",
    "module": "@my-org/device-bridge"
  }]
}
```

### Step 5: Deploy

```bash
ateam_build_and_run solution.json skills/*
```

### Step 6: Test

1. Mobile app discovers solution
2. Auto-loads skills
3. Auto-loads UI plugins
4. Auto-runs connectors
5. Done! 🎉

---

## ❌ Common Mistakes

### Mistake 1: Building for Mobile When You Don't Need To

```
❌ DON'T: Add functional_connectors if you only need web
✅ DO: Build standard solution, add connectors only if truly needed
```

### Mistake 2: Complex Device Data Collection

```
❌ DON'T: Try to collect everything in background
✅ DO: Only sync what skills actually need
```

### Mistake 3: Heavy UI Plugins

```
❌ DON'T: Build massive dashboard with 1000+ items
✅ DO: Paginate, lazy-load, keep responsive
```

### Mistake 4: Hardcoding URLs

```
❌ DON'T: connector.ts has hardcoded API URLs
✅ DO: Use config.relay_url, config.api_key from solution definition
```

---

## 🆘 Troubleshooting

### UI Plugin Not Showing on Mobile

**Checklist:**
- ✅ Is bundleUrl correct? (Check `/api/solutions/{id}/ui-plugins`)
- ✅ Did npm run build complete? (Check build logs)
- ✅ Is component name registered? (Check PluginSDK.register())
- ✅ Mobile app has network access?

### Connector Not Starting

**Checklist:**
- ✅ Module published to npm?
- ✅ Mobile app has module installed?
- ✅ Permissions requested in solution.json?
- ✅ onStart() implemented?

### Device API Not Working

**Checklist:**
- ✅ Correct permission requested? (calendar, location, etc.)
- ✅ User granted permission in app settings?
- ✅ API available on this platform? (Some iOS-only, some Android-only)

---

## 📚 Next Steps

### To Learn More

- **Skills:** Read `/spec/skill` and `/spec/examples/skill`
- **Solutions:** Read `/spec/solution` and `/spec/examples/solution`
- **Connectors:** Read `/spec/connector` and `/spec/examples/connector`
- **UI Plugins:** Read `/spec/ui-plugins` and `/spec/examples/ui-plugin`
- **Mobile Connectors:** Read `/spec/mobile-connector` (if building background services)

### To Build

1. Create your skills
2. Create UI plugins (optional)
3. Create connectors (optional)
4. Write solution.json
5. `ateam_build_and_run solution.json skills/*`
6. Test in mobile app

### To Deploy

```bash
# Local dev
npm run dev

# Production
git push origin main
# GitHub Actions auto-builds and deploys
# Solution available at app.ateam-ai.com/builder/
```

---

## 🎯 You're Ready!

You now know:
- ✅ When to use UI plugins
- ✅ How to build them (web + mobile)
- ✅ When to use functional connectors
- ✅ How to build them
- ✅ How to deploy everything together

**Next:** Create your first mobile-first solution! 🚀

---

## Questions?

All specs are available via HTTP (no auth required):
- `GET /spec/skill` — Skill specification
- `GET /spec/solution` — Solution specification
- `GET /spec/connector` — Connector specification
- `GET /spec/ui-plugins` — UI plugin specification
- `GET /spec/mobile-connector` — Mobile connector specification
- `GET /spec/examples/*` — Working examples

Happy building! 🎉
