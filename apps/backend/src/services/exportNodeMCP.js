/**
 * Node.js MCP Template Generator
 *
 * Generates a complete, runnable Node.js MCP server scaffold from a DraftSkill's
 * tool definitions. The output matches the production MCP pattern used across
 * ADAS solutions (stdio JSON-RPC, better-sqlite3, ESM).
 *
 * Usage:
 *   const files = generateNodeMCPFiles(skill);
 *   // Returns [{name: "server.js", content: "..."}, ...]
 */

// ── Helpers ────────────────────────────────────────────────────────────

/** Slugify a name: "Customer Support Tier 1" → "customer-support-tier-1" */
function slugify(name) {
  return (name || 'my-skill')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Derive the MCP domain from tool names. Returns first segment of most common prefix. */
function deriveDomain(tools) {
  const segments = tools
    .map(t => t.name?.split('.')[0])
    .filter(Boolean);
  if (!segments.length) return 'my';
  // Most frequent first segment
  const freq = {};
  for (const s of segments) freq[s] = (freq[s] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

/** Extract unique entities from tool names: "orders.order.get" → "order" */
function deriveEntities(tools) {
  const entities = new Map();
  for (const tool of tools) {
    const parts = (tool.name || '').split('.');
    if (parts.length >= 3) {
      const entity = parts[1];
      if (!entities.has(entity)) entities.set(entity, []);
      entities.get(entity).push(tool);
    } else if (parts.length === 2) {
      const entity = parts[1];
      if (!entities.has(entity)) entities.set(entity, []);
      entities.get(entity).push(tool);
    }
  }
  return entities;
}

/** Map DraftSkill DataType → JSON Schema type */
function jsonSchemaType(dataType) {
  const map = { string: 'string', number: 'number', boolean: 'boolean', object: 'object', array: 'array' };
  return map[dataType] || 'string';
}

/** Map DraftSkill DataType → SQLite column type */
function sqliteType(dataType) {
  const map = { string: 'TEXT', number: 'INTEGER', boolean: 'INTEGER', object: 'TEXT', array: 'TEXT' };
  return map[dataType] || 'TEXT';
}

/** Derive a store method name from tool name: "orders.order.get" → "getOrder" */
function storeMethodName(toolName) {
  const parts = toolName.split('.');
  if (parts.length >= 3) {
    const entity = parts[1];
    const action = parts.slice(2).join('_');
    // camelCase: get + Order → getOrder, create + Order → createOrder
    const capitalEntity = entity.charAt(0).toUpperCase() + entity.slice(1);
    return `${action}${capitalEntity}`;
  }
  // Fallback: just camelCase the full name
  return toolName.replace(/\./g, '_');
}

/** Convert a tool name to a handler method key for the switch-case */
function camelCase(str) {
  return str.replace(/[-_.](\w)/g, (_, c) => c.toUpperCase());
}

// ── Generic Template Generator ────────────────────────────────────────

/**
 * Generate a generic/blank Node.js MCP template.
 * Not tied to any specific skill — serves as a reference starting point.
 *
 * @returns {Array<{name: string, content: string}>} Files to write
 */
export function generateGenericTemplate() {
  const skill = {
    name: 'My Skill',
    tools: [
      {
        name: 'myDomain.entity.get',
        description: 'Get an entity by ID',
        inputs: [
          { name: 'organization_id', type: 'string', description: 'Organization ID', required: true },
          { name: 'entity_id', type: 'string', description: 'Entity ID', required: true }
        ]
      },
      {
        name: 'myDomain.entity.list',
        description: 'List entities with optional filters',
        inputs: [
          { name: 'organization_id', type: 'string', description: 'Organization ID', required: true },
          { name: 'status', type: 'string', description: 'Filter by status', required: false },
          { name: 'limit', type: 'number', description: 'Max results (default 50)', required: false }
        ]
      },
      {
        name: 'myDomain.entity.create',
        description: 'Create a new entity',
        inputs: [
          { name: 'organization_id', type: 'string', description: 'Organization ID', required: true },
          { name: 'name', type: 'string', description: 'Entity name', required: true },
          { name: 'description', type: 'string', description: 'Entity description', required: false }
        ]
      },
      {
        name: 'myDomain.entity.update',
        description: 'Update an existing entity',
        inputs: [
          { name: 'organization_id', type: 'string', description: 'Organization ID', required: true },
          { name: 'entity_id', type: 'string', description: 'Entity ID', required: true },
          { name: 'name', type: 'string', description: 'New name', required: false },
          { name: 'status', type: 'string', description: 'New status', required: false }
        ]
      }
    ]
  };

  return generateNodeMCPFiles(skill);
}

// ── Main Generator ─────────────────────────────────────────────────────

/**
 * Generate a complete Node.js MCP template from a DraftSkill.
 *
 * @param {import('../types/DraftSkill.js').DraftSkill} skill
 * @returns {Array<{name: string, content: string}>} Files to write
 */
export function generateNodeMCPFiles(skill) {
  const tools = (skill.tools || []).filter(t => t.name && t.description);
  const skillName = skill.name || 'My Skill';
  const slug = slugify(skillName);
  const domain = deriveDomain(tools);

  const files = [
    { name: 'server.js', content: generateServerJs(skill, tools, domain) },
    { name: 'package.json', content: generatePackageJson(slug, skillName) },
    { name: 'src/store.js', content: generateStoreJs(tools, domain) },
    { name: 'README.md', content: generateReadme(skill, tools, slug) },
  ];

  return files;
}

// ── server.js Generator ────────────────────────────────────────────────

function generateServerJs(skill, tools, domain) {
  const slug = slugify(skill.name || 'my-skill');
  const serverName = `adas-${slug}-mcp`;
  const toolDefs = tools.map(t => generateToolDef(t)).join(',\n');
  const handlerCases = tools.map(t => generateHandlerCase(t)).join('\n');

  return `#!/usr/bin/env node

/**
 * ${skill.name || 'My Skill'} MCP Server
 *
 * Stdio JSON-RPC MCP server.
 * Generated by ADAS Skill Builder — customize the handler stubs below.
 *
 * Tools:
${tools.map(t => ` * - ${t.name} — ${t.description}`).join('\n')}
 */

import { createInterface } from 'node:readline';
// import { store } from './src/store.js';  // Uncomment when persistence is ready

const SERVER_NAME = '${serverName}';
const SERVER_VERSION = '0.1.0';

// ── Tool Definitions ───────────────────────────────────────────────────

const TOOLS = [
${toolDefs}
];

// ── JSON-RPC Helpers ───────────────────────────────────────────────────

function ok(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function error(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function toTextResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// ── Tool Handlers ──────────────────────────────────────────────────────
// TODO: Replace stubs with real implementations (e.g., store.method(args))

const handlers = {
${handlerCases}
};

// ── MCP Request Router ─────────────────────────────────────────────────

function handleRequest(req) {
  const { id, method, params } = req;

  try {
    switch (method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          capabilities: { tools: {} }
        });

      case 'initialized':
      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return ok(id, { tools: TOOLS });

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const handler = handlers[name];

        if (!handler) {
          return error(id, -32602, \`Unknown tool: \${name}\`);
        }

        try {
          const result = handler(args || {});
          if (result === null || result === undefined) {
            return ok(id, toTextResult({ found: false, error: \`Not found for \${name}\` }));
          }
          return ok(id, toTextResult(result));
        } catch (err) {
          return ok(id, { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true });
        }
      }

      case 'ping':
        return ok(id, {});

      default:
        if (!id || method.startsWith('notifications/')) return null;
        return error(id, -32601, \`Method not found: \${method}\`);
    }
  } catch (err) {
    return error(id, -32603, err.message);
  }
}

// ── Stdio Transport ────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const res = handleRequest(JSON.parse(line));
    if (res) console.log(JSON.stringify(res));
  } catch {
    console.log(JSON.stringify(error(null, -32700, 'Parse error')));
  }
});

process.stderr.write(\`\${SERVER_NAME} v\${SERVER_VERSION} started\\n\`);
`;
}

function generateToolDef(tool) {
  const properties = {};
  const required = [];

  for (const input of (tool.inputs || [])) {
    const prop = { type: jsonSchemaType(input.type), description: input.description || '' };
    if (input.enum?.length) prop.enum = input.enum;
    if (input.default !== undefined) prop.default = input.default;
    properties[input.name] = prop;
    if (input.required !== false) required.push(input.name);
  }

  const schema = {
    type: 'object',
    properties,
    ...(required.length ? { required } : {})
  };

  return `  {
    name: ${JSON.stringify(tool.name)},
    description: ${JSON.stringify(tool.description)},
    inputSchema: ${JSON.stringify(schema, null, 6).replace(/\n/g, '\n    ')}
  }`;
}

function generateHandlerCase(tool) {
  const methodName = storeMethodName(tool.name);
  const inputNames = (tool.inputs || []).filter(i => i.required !== false).map(i => i.name);
  const stubReturn = inputNames.length > 0
    ? `{ ${inputNames.map(n => `${n}: args.${n}`).join(', ')}, success: true }`
    : `{ success: true }`;

  return `  ${JSON.stringify(tool.name)}(args) {
    // TODO: return store.${methodName}(args);
    return ${stubReturn};
  },
`;
}

// ── package.json Generator ─────────────────────────────────────────────

function generatePackageJson(slug, skillName) {
  const pkg = {
    name: `adas-${slug}-mcp`,
    version: '0.1.0',
    description: `ADAS ${skillName} MCP server`,
    type: 'module',
    main: 'server.js',
    scripts: {
      start: 'node server.js',
      'start:http': 'npx -y supergateway --stdio "node server.js" --port 7399 --host 0.0.0.0 --outputTransport streamableHttp'
    },
    dependencies: {},
    optionalDependencies: {
      'better-sqlite3': '^11.0.0'
    },
    engines: {
      node: '>=18'
    }
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

// ── src/store.js Generator ─────────────────────────────────────────────

function generateStoreJs(tools, domain) {
  const entities = deriveEntities(tools);

  // Build table schemas from entity tool inputs
  const tableSchemas = [];
  const crudMethods = [];

  for (const [entity, entityTools] of entities) {
    // Collect all input fields across tools for this entity
    const columns = new Map();
    columns.set('id', { name: 'id', type: 'TEXT', sqlDef: 'id TEXT PRIMARY KEY' });

    for (const tool of entityTools) {
      for (const input of (tool.inputs || [])) {
        if (input.name === 'id') continue; // already have id
        if (!columns.has(input.name)) {
          const colType = sqliteType(input.type);
          const nullable = input.required === false ? '' : ' NOT NULL';
          const defaultVal = input.type === 'object' || input.type === 'array'
            ? ` DEFAULT '{}'` : '';
          columns.set(input.name, {
            name: input.name,
            type: colType,
            sqlDef: `${input.name} ${colType}${nullable}${defaultVal}`
          });
        }
      }
    }

    // Add timestamps
    columns.set('created_at', { name: 'created_at', type: 'TEXT', sqlDef: "created_at TEXT DEFAULT (datetime('now'))" });
    columns.set('updated_at', { name: 'updated_at', type: 'TEXT', sqlDef: "updated_at TEXT DEFAULT (datetime('now'))" });

    const tableName = `${entity}s`;  // simple pluralization
    const colDefs = Array.from(columns.values()).map(c => `    ${c.sqlDef}`).join(',\n');

    tableSchemas.push(`  CREATE TABLE IF NOT EXISTS ${tableName} (\n${colDefs}\n  );`);

    // Generate CRUD method stubs
    const capEntity = entity.charAt(0).toUpperCase() + entity.slice(1);
    const inputCols = Array.from(columns.keys()).filter(k => k !== 'created_at' && k !== 'updated_at');

    crudMethods.push(`
  create${capEntity}(args) {
    const id = newId('${entity}');
    const ts = now();
    db.prepare(\`
      INSERT INTO ${tableName} (${inputCols.join(', ')}, created_at, updated_at)
      VALUES (${inputCols.map(() => '?').join(', ')}, ?, ?)
    \`).run(${inputCols.map(c => c === 'id' ? 'id' : `args.${c} || ${columns.get(c)?.type === 'TEXT' ? "''" : 'null'}`).join(', ')}, ts, ts);
    return this.get${capEntity}(id);
  },

  get${capEntity}(id) {
    return db.prepare('SELECT * FROM ${tableName} WHERE id = ?').get(id) || null;
  },

  list${capEntity}s({ limit = 50, offset = 0, ...filters } = {}) {
    let sql = 'SELECT * FROM ${tableName}';
    const params = [];
    const conditions = [];
    for (const [key, val] of Object.entries(filters)) {
      if (val !== undefined) { conditions.push(\`\${key} = ?\`); params.push(val); }
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const { total } = db.prepare(countSql).get(...params);
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return { items: db.prepare(sql).all(...params), total, limit, offset };
  },

  update${capEntity}(id, updates = {}) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id' || val === undefined) continue;
      fields.push(\`\${key} = ?\`);
      values.push(val);
    }
    if (!fields.length) return this.get${capEntity}(id);
    fields.push('updated_at = ?');
    values.push(now());
    values.push(id);
    db.prepare(\`UPDATE ${tableName} SET \${fields.join(', ')} WHERE id = ?\`).run(...values);
    return this.get${capEntity}(id);
  },

  delete${capEntity}(id) {
    const existing = this.get${capEntity}(id);
    if (!existing) return null;
    db.prepare('DELETE FROM ${tableName} WHERE id = ?').run(id);
    return { id, deleted: true };
  },`);
  }

  const domainUpper = domain.toUpperCase().replace(/-/g, '_');

  return `/**
 * Persistence Layer (SQLite)
 *
 * Uses better-sqlite3 with WAL mode.
 * Data directory: process.env.${domainUpper}_MCP_DATA_DIR || './data'
 *
 * Generated by ADAS Skill Builder — customize schemas and methods below.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ── Database Setup ─────────────────────────────────────────────────────

const DATA_DIR = process.env.${domainUpper}_MCP_DATA_DIR || './data';
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, '${domain}.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────────────────

db.exec(\`
${tableSchemas.join('\n\n')}
\`);

// ── Helpers ────────────────────────────────────────────────────────────

function newId(prefix = 'item') {
  return \`\${prefix}_\${randomBytes(8).toString('hex')}\`;
}

function now() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

// ── CRUD Operations ────────────────────────────────────────────────────

export const store = {${crudMethods.join('')}
};
`;
}

// ── README.md Generator ────────────────────────────────────────────────

function generateReadme(skill, tools, slug) {
  const toolList = tools.map(t => `- \`${t.name}\` — ${t.description}`).join('\n');

  return `# ${skill.name || 'My Skill'} MCP Server

Generated by [ADAS Skill Builder](https://github.com/anthropics/adas).

## Tools

${toolList}

## Quick Start

\`\`\`bash
npm install
node server.js
\`\`\`

The server runs on **stdio** (JSON-RPC). To test:

\`\`\`bash
echo '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}' | node server.js
\`\`\`

## HTTP Mode (via Supergateway)

\`\`\`bash
npm run start:http
# MCP endpoint: http://localhost:7399/mcp
\`\`\`

## Persistence

Uncomment the store import in \`server.js\` and edit \`src/store.js\` to customize the SQLite schema.

## Re-import into Skill Builder

To deploy this MCP back through Skill Builder:

1. Place files in a solution pack directory: \`mcp-store/${slug}-mcp/\`
2. Add the MCP to your \`manifest.json\`
3. Package with your solution's \`pack.sh\`
4. Import the \`.tar.gz\` into Skill Builder
5. Deploy to ADAS Core
`;
}
