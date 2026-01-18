# Connector System - Test Guide

## What Was Built

### Backend
1. **MCP Connector Service** (`apps/backend/src/services/mcpConnector.js`)
   - Manages connections to MCP servers
   - Discovers tools via MCP protocol (JSON-RPC over stdio)
   - Supports multiple simultaneous connections

2. **Connector Routes** (`apps/backend/src/routes/connectors.js`)
   - `GET /api/connectors` - List active connections
   - `POST /api/connectors/connect` - Connect to custom MCP server
   - `POST /api/connectors/disconnect/:id` - Disconnect
   - `GET /api/connectors/:id/tools` - Get discovered tools
   - `POST /api/connectors/:id/call` - Call a tool
   - `POST /api/connectors/:id/import-to-domain` - Import tools to DAL
   - `GET /api/connectors/prebuilt` - List pre-built connectors
   - `POST /api/connectors/prebuilt/:id/connect` - Connect pre-built

### Frontend
1. **ConnectorPanel** (`apps/frontend/src/components/ConnectorPanel.jsx`)
   - UI for connecting to MCP servers
   - Shows discovered tools
   - Allows selecting and importing tools

2. **SkillPanel** updated with "Connectors" tab

## How to Test

### 1. Start the development environment

```bash
docker compose -f docker-compose.dev.yml up
```

### 2. Open the UI

Navigate to http://localhost:3000

### 3. Create or select a skill

Click "New Skill" or select an existing one.

### 4. Go to Connectors tab

Click the "Connectors" tab in the right panel.

### 5. Test with Filesystem MCP (easiest)

Click "Connect" on the Filesystem connector. This should:
- Start the MCP server
- Discover available tools
- Show them in the UI

### 6. Test with Gmail MCP (requires setup)

First, authenticate Gmail MCP:
```bash
npx @gongrzhe/server-gmail-autoauth-mcp auth
```

Then click "Connect" on Gmail in the UI.

## Test with curl

```bash
# List pre-built connectors
curl http://localhost:4000/api/connectors/prebuilt

# Connect to filesystem MCP (adjust path as needed)
curl -X POST http://localhost:4000/api/connectors/connect \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "name": "Filesystem"
  }'

# List active connections
curl http://localhost:4000/api/connectors

# Get tools from a connection
curl http://localhost:4000/api/connectors/filesystem/tools
```

## Expected Output

When connecting to Gmail MCP, you should see tools like:
- `search_emails` - Search Gmail
- `send_email` - Send emails
- `read_email` - Read email content
- `draft_email` - Create drafts
- `modify_labels` - Manage labels
- etc.

## Next Steps

1. **Actually import tools to domain** - Currently just logs, needs to add to skill.tools
2. **OAuth flow for Gmail** - Handle auth in UI instead of CLI
3. **Tool policy configuration** - Set approval requirements per tool
4. **Persist connections** - Remember connections across restarts
