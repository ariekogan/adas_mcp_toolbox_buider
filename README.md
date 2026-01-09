# ADAS MCP Toolbox Builder

A conversational AI application that helps non-technical users create custom MCP (Model Context Protocol) servers through guided conversation.

## Features

- **Guided Conversation** - AI chatbot that persistently guides users through tool definition
- **Visual Toolbox Panel** - Real-time display of the toolbox being built
- **Mock-First Development** - Every tool works in simulation before export
- **MCP Export** - Generates real, deployable MCP servers (Python/FastMCP)
- **LLM Agnostic** - Works with Claude (Anthropic) or GPT-4 (OpenAI)

## Quick Start

### 1. Clone and Configure

```bash
git clone <your-repo-url>
cd adas_mcp_toolbox_builder
cp .env.example .env
```

Edit `.env` and add your API key:
```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-actual-key
```

### 2. Create Memory Directory

```bash
mkdir -p memory
```

### 3. Run with Docker

**Development (with hot reload):**
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
- Frontend: http://localhost:3310
- Backend: http://localhost:4300

**Production:**
```bash
docker-compose up --build
```
- Frontend: http://localhost:3300
- Backend: http://localhost:4300

## Project Structure

```
adas_mcp_toolbox_builder/
├── docker-compose.yml        # Production compose
├── docker-compose.dev.yml    # Development overlay
├── .env.example              # Configuration template
├── memory/                   # Persistent storage (gitignored)
│
├── apps/
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── server.js           # Express entry
│   │       ├── routes/
│   │       │   ├── chat.js         # POST /api/chat
│   │       │   ├── projects.js     # CRUD /api/projects
│   │       │   ├── mock.js         # POST /api/mock/:toolId
│   │       │   └── export.js       # GET /api/export/:id
│   │       ├── services/
│   │       │   ├── llm/            # LLM adapters
│   │       │   ├── conversation.js # Build LLM requests
│   │       │   ├── state.js        # State management
│   │       │   └── export.js       # MCP code generation
│   │       ├── store/
│   │       │   └── projects.js     # File persistence
│   │       └── prompts/
│   │           └── system.js       # System prompt
│   │
│   └── frontend/
│       ├── Dockerfile
│       ├── package.json
│       ├── vite.config.js
│       ├── nginx.conf
│       └── src/
│           ├── App.jsx
│           ├── components/         # UI components
│           ├── hooks/              # React hooks
│           └── api/                # API client
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_HOST_PORT` | Frontend port (prod) | 3300 |
| `BACKEND_HOST_PORT` | Backend API port | 4300 |
| `VITE_DEV_HOST_PORT` | Frontend port (dev) | 3310 |
| `LLM_PROVIDER` | `anthropic` or `openai` | anthropic |
| `ANTHROPIC_API_KEY` | Your Anthropic API key | - |
| `ANTHROPIC_MODEL` | Claude model to use | claude-sonnet-4-20250514 |
| `OPENAI_API_KEY` | Your OpenAI API key | - |
| `OPENAI_MODEL` | GPT model to use | gpt-4-turbo |
| `MEMORY_PATH` | Persistent storage path | ./memory |
| `LOG_LEVEL` | Logging level | debug |

## How It Works

### Conversation Flow

1. **Problem Discovery** - Understand the core problem
2. **Scenario Exploration** - Collect real-world usage scenarios (min 2)
3. **Tools Proposal** - AI proposes tools based on scenarios
4. **Tool Definition** - Define each tool in detail
5. **Mock Testing** - Validate tools with simulated data
6. **Export** - Generate deployable MCP server

### UI Layout

```
┌─────────────┬─────────────────────┬─────────────────────┐
│  Projects   │    Chat Panel       │   Toolbox Panel     │
│             │                     │                     │
│  [+ New]    │  Guided             │  Progress           │
│             │  conversation       │  Scenarios          │
│  > Project1 │  with AI            │  Tools              │
│    Project2 │                     │  Mock testing       │
│             │                     │  Export             │
└─────────────┴─────────────────────┴─────────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create new project |
| GET | `/api/projects/:id` | Get project details |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/chat` | Send chat message |
| POST | `/api/mock/:projectId/:toolId` | Run mock test |
| GET | `/api/export/:projectId` | Export MCP server |
| GET | `/api/export/:projectId/download/:version` | Download export |

## Development

### Without Docker

**Backend:**
```bash
cd apps/backend
pnpm install
pnpm dev
```

**Frontend:**
```bash
cd apps/frontend
pnpm install
pnpm dev
```

### Testing

```bash
# Health check
curl http://localhost:4300/api/health

# List projects
curl http://localhost:4300/api/projects
```

## Generated MCP Server

When you export a toolbox, you get:

- `mcp_server.py` - FastMCP server with all tools
- `requirements.txt` - Python dependencies
- `Dockerfile` - Container setup
- `README.md` - Setup instructions
- `claude_desktop_config.json` - Claude Desktop config

## License

MIT
