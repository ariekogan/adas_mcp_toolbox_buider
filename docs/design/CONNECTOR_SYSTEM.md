# DAL Connector System Design

## Overview

The Connector System enables semi/non-developers to add real integrations to their AI agents without writing code.

Two paths:
1. **Pre-built Connectors** - One-click setup for popular services (Gmail, Slack, Shopify)
2. **Custom MCP Bridge** - Connect any existing MCP server

---

## User Journey: Pre-built Connector (Gmail Example)

### Step 1: User Describes Need

```
User: "I need my agent to read and respond to customer support emails"

DAL: "I can help you connect to email. Which provider do you use?"

     [Gmail]  [Outlook]  [Other/Custom]
```

### Step 2: One-Click OAuth Setup

```
User clicks: [Gmail]

DAL: "Let's connect your Gmail account."

     [Connect Gmail Account]

     "This will:"
     • Allow reading emails
     • Allow sending emails
     • Allow searching emails

     "Your credentials stay on your machine. We never see your emails."
```

**Behind the scenes:**
1. DAL backend spawns Gmail MCP server (docker or npx)
2. Opens OAuth flow in browser
3. User authenticates with Google
4. Credentials stored locally (~/.adas/connectors/gmail/)
5. MCP server confirms connection

### Step 3: Capability Selection

```
DAL: "Gmail connected! Here's what your agent can do:"

     Email Reading
     ☑ Read inbox emails
     ☑ Search emails by sender, subject, date
     ☑ Get email details and attachments

     Email Sending
     ☑ Send new emails
     ☑ Reply to emails
     ☐ Forward emails

     Email Management
     ☐ Delete emails (risky - disabled by default)
     ☐ Manage labels
     ☐ Create filters

     [Continue with selected capabilities]
```

### Step 4: Policy Configuration (Plain Language)

```
DAL: "Let's set some safety rules for sending emails:"

     When should your agent ask for approval before sending?

     ○ Always ask me first (safest)
     ○ Ask only for new recipients I haven't emailed before
     ○ Ask only if the email seems unusual
     ○ Never ask, I trust the agent (not recommended)

     ─────────────────────────────────────────────

     Are there any email addresses that should NEVER receive emails?

     [Add blocked addresses...]

     ─────────────────────────────────────────────

     Should there be a daily limit on emails sent?

     [No limit]  [10/day]  [50/day]  [Custom...]
```

### Step 5: Tool Generation

DAL automatically creates tools:

```yaml
tools:
  - id: "tool-gmail-read"
    name: "read_emails"
    description: "Read emails from inbox"
    source:
      type: connector
      connector_id: "gmail"
      mcp_tool: "search_emails"  # Maps to actual MCP tool
    inputs:
      - name: "query"
        type: string
        description: "Search query (e.g., 'from:support@customer.com')"
      - name: "limit"
        type: number
        default: 20
    policy:
      allowed: always
      requires_approval: never

  - id: "tool-gmail-send"
    name: "send_email"
    description: "Send an email reply to a customer"
    source:
      type: connector
      connector_id: "gmail"
      mcp_tool: "send_email"
    inputs:
      - name: "to"
        type: string
        required: true
      - name: "subject"
        type: string
        required: true
      - name: "body"
        type: string
        required: true
    policy:
      allowed: always
      requires_approval: always  # User chose "always ask"
      guardrails:
        blocked_recipients: ["legal@company.com", "ceo@company.com"]
        rate_limit: 50  # per day
```

### Step 6: Test in Playground

```
DAL: "Let's test your email tools!"

     Try asking your agent:
     • "Check my inbox for unread emails"
     • "Find emails from john@customer.com"

     ┌─────────────────────────────────────────┐
     │  Agent Playground                        │
     ├─────────────────────────────────────────┤
     │                                          │
     │  You: Check my inbox                     │
     │                                          │
     │  Agent: I found 12 unread emails:        │
     │  1. From: sarah@acme.com                 │
     │     Subject: Order #1234 not delivered   │
     │  2. From: mike@bigcorp.com               │
     │     Subject: Refund request              │
     │  ...                                     │
     │                                          │
     └─────────────────────────────────────────┘
```

---

## User Journey: Custom MCP Bridge

For users who have their own MCP server (built by their dev team):

### Step 1: Connect Existing MCP

```
User: "I have an MCP server for our order system"

DAL: "Great! How do I connect to your MCP server?"

     Connection type:
     ○ Local command (runs on this machine)
     ○ Remote URL (SSE/WebSocket endpoint)
     ○ Docker container
```

### Step 2: Provide Connection Details

```
User selects: Local command

DAL: "What command starts your MCP server?"

     Command: [python /path/to/orders_mcp.py        ]

     Environment variables (optional):
     [DATABASE_URL] = [postgresql://...]
     [Add another...]

     [Test Connection]
```

### Step 3: Discover Tools

```
DAL: "Connected! I discovered these tools in your MCP server:"

     ┌─────────────────────────────────────────────────────────┐
     │ Tool: get_order                                         │
     │ Description: Retrieve order details by order ID         │
     │ Inputs: order_id (string, required)                     │
     │ Output: Order object with status, items, shipping       │
     │                                                         │
     │ [Import this tool]  [Skip]                              │
     └─────────────────────────────────────────────────────────┘

     ┌─────────────────────────────────────────────────────────┐
     │ Tool: list_customer_orders                              │
     │ Description: Get all orders for a customer              │
     │ Inputs: customer_email (string, required)               │
     │ Output: Array of orders                                 │
     │                                                         │
     │ [Import this tool]  [Skip]                              │
     └─────────────────────────────────────────────────────────┘

     ┌─────────────────────────────────────────────────────────┐
     │ Tool: process_refund                                    │
     │ Description: Process a refund for an order              │
     │ Inputs: order_id, amount, reason                        │
     │ Output: Refund confirmation                             │
     │                                                         │
     │ [Import this tool]  [Skip]                              │
     └─────────────────────────────────────────────────────────┘
```

### Step 4: Configure Policies

```
DAL: "You imported 'process_refund'. This seems like a sensitive action."

     When should approval be required?

     ○ Always require approval
     ○ Require approval if amount > $[___]
     ○ Never require approval

     Who can approve?

     ☑ The user chatting with the agent
     ☐ A manager (via Slack notification)
     ☐ Auto-approve after review period
```

### Step 5: Rename/Customize (Optional)

```
DAL: "Would you like to customize how this tool appears to your agent?"

     Original name: get_order
     Display name:  [Look up order status    ]

     Original description: Retrieve order details by order ID
     Better description:   [Find a customer's order by their order
                            number to check status, items, and
                            shipping information              ]
```

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DAL Builder UI                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DAL Backend                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Connector Manager                        │  │
│  │  - Install/manage MCP servers                              │  │
│  │  - Handle OAuth flows                                      │  │
│  │  - Store credentials securely                              │  │
│  │  - Discover tools from MCP servers                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │                   Connector Registry                       │  │
│  │                                                            │  │
│  │  Pre-built:           Custom:                              │  │
│  │  ├── gmail            └── (user-provided MCP servers)      │  │
│  │  ├── slack                                                 │  │
│  │  ├── shopify                                               │  │
│  │  └── notion                                                │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server Layer                           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Gmail MCP   │  │  Slack MCP   │  │  Custom Orders MCP   │   │
│  │  (managed)   │  │  (managed)   │  │  (user-provided)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│         │                 │                    │                 │
│         ▼                 ▼                    ▼                 │
│      Gmail API       Slack API          User's Database          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Connector Definition Schema

```yaml
# Pre-built connector definition (internal)
connector:
  id: "gmail"
  name: "Gmail"
  description: "Connect to Gmail for reading and sending emails"
  icon: "gmail-icon.svg"

  # How to install/run the MCP server
  mcp_server:
    package: "@gongrzhe/server-gmail-autoauth-mcp"
    install_method: npx  # or docker

  # OAuth configuration
  auth:
    type: oauth2
    provider: google
    scopes:
      - "https://www.googleapis.com/auth/gmail.readonly"
      - "https://www.googleapis.com/auth/gmail.send"
      - "https://www.googleapis.com/auth/gmail.modify"
    credentials_path: "~/.adas/connectors/gmail/"

  # Curated tool groups (user-friendly presentation)
  capability_groups:
    - name: "Email Reading"
      description: "Read and search your emails"
      tools:
        - mcp_tool: "search_emails"
          display_name: "Search emails"
          default_enabled: true
          risk_level: low
        - mcp_tool: "read_email"
          display_name: "Read email content"
          default_enabled: true
          risk_level: low

    - name: "Email Sending"
      description: "Send and reply to emails"
      tools:
        - mcp_tool: "send_email"
          display_name: "Send email"
          default_enabled: true
          risk_level: medium
          default_policy:
            requires_approval: always
        - mcp_tool: "draft_email"
          display_name: "Create draft"
          default_enabled: true
          risk_level: low

    - name: "Email Management"
      description: "Organize and manage emails"
      tools:
        - mcp_tool: "delete_email"
          display_name: "Delete email"
          default_enabled: false  # Risky - off by default
          risk_level: high
          default_policy:
            requires_approval: always
        - mcp_tool: "modify_labels"
          display_name: "Manage labels"
          default_enabled: false
          risk_level: low
```

---

## Custom MCP Bridge Schema

```yaml
# User-configured MCP connection
connector:
  id: "custom-orders-mcp"
  name: "Orders System"
  type: custom_mcp

  connection:
    method: local_command
    command: "python"
    args: ["/home/user/mcp/orders_server.py"]
    env:
      DATABASE_URL: "postgresql://..."

  # Discovered tools (populated after connection)
  discovered_tools:
    - name: "get_order"
      description: "Retrieve order by ID"
      inputs: [...]
      imported: true
      custom_display_name: "Look up order"
      policy:
        requires_approval: never

    - name: "process_refund"
      description: "Process refund"
      inputs: [...]
      imported: true
      policy:
        requires_approval: always
        conditions:
          - when: "amount > 100"
            action: require_manager_approval
```

---

## Implementation Phases

### Phase 1: MCP Discovery (Foundation)
- [ ] Connect to any MCP server (local command)
- [ ] Discover and list available tools
- [ ] Import tools into DAL domain
- [ ] Configure policies via DAL UI

### Phase 2: Pre-built Gmail Connector
- [ ] Auto-install Gmail MCP server
- [ ] Handle OAuth flow
- [ ] Curated capability groups
- [ ] Sensible default policies

### Phase 3: More Connectors
- [ ] Slack
- [ ] Notion
- [ ] Shopify (for e-commerce use cases)

### Phase 4: Remote MCP Support
- [ ] Connect to remote MCP servers (SSE/WebSocket)
- [ ] Docker-based MCP servers
- [ ] Credential vault integration

---

## Open Questions

1. **Credential Storage**: Local file vs encrypted vault?
2. **Multi-user**: How to handle shared connectors in a team?
3. **Updates**: How to update MCP servers without breaking configs?
4. **Offline**: Should connectors work when DAL Builder is offline?
