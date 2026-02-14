import { generateAllConnectorFiles } from './exportConnectorTemplate.js';
import { getAllPrebuiltConnectors } from '../routes/connectors.js';
import {
  escapeString, toSlug, yamlString,
  yamlConnectorsBlock, yamlUiPluginsBlock,
  yamlGrantMappingsBlock, yamlAccessPolicyBlock,
  yamlResponseFiltersBlock, yamlContextPropagationBlock,
  compileUiPlugins,
} from '../utils/skillFieldHelpers.js';

function jsType(type) {
  switch (type?.toLowerCase()) {
    case "string":
    case "text":
      return "string";
    case "number":
    case "integer":
    case "int":
    case "float":
    case "decimal":
      return "number";
    case "boolean":
    case "bool":
      return "boolean";
    case "array":
    case "list":
      return "Array";
    case "object":
    case "dict":
      return "object";
    default:
      return "string";
  }
}

// ── Tool implementation mappings ──

/**
 * Tool implementation mappings
 * Maps tool names to their real implementations using runShell or built-in ADAS tools
 */
const TOOL_IMPLEMENTATIONS = {
  // File system tools - use ADAS built-in tools
  read_file: {
    type: 'builtin',
    builtin: 'readFile',
    mapArgs: (args) => `{ path: args.file_path || args.path }`,
    mapResult: (result) => `{ ok: result.ok, content: result.content, path: result.file, size: result.bytes, encoding: "utf-8" }`
  },
  write_file: {
    type: 'builtin',
    builtin: 'writeFile',
    mapArgs: (args) => `{ path: args.file_path || args.path, content: args.content }`,
    mapResult: (result) => `{ ok: result.ok, success: result.ok, path: result.file, bytes_written: result.bytes }`
  },
  list_directory: {
    type: 'builtin',
    builtin: 'listFiles',
    mapArgs: (args) => `{ path: args.path || ".", pattern: args.pattern || "*" }`,
    mapResult: (result) => `{ ok: result.ok, path: result.path || args.path, entries: result.files || [], total_files: (result.files || []).length }`
  },
  delete_file: {
    type: 'shell',
    command: (args) => `rm -f "\${args.file_path || args.path}"`,
    mapResult: (result) => `{ ok: result.ok, success: result.ok, path: args.file_path || args.path }`
  },
  edit_file: {
    type: 'builtin',
    builtin: 'writeFile',
    customImpl: `
  // Read current content
  const readResult = await deps.tools.readFile({ path: args.file_path || args.path }, job, deps);
  if (!readResult.ok) {
    return { ok: false, error: readResult.error || "Failed to read file" };
  }

  let content = readResult.content;
  const edits = args.edits || [];
  let editsApplied = 0;

  for (const edit of edits) {
    if (edit.old_text && content.includes(edit.old_text)) {
      content = content.replace(edit.old_text, edit.new_text || "");
      editsApplied++;
    }
  }

  // Write updated content
  const writeResult = await deps.tools.writeFile({ path: args.file_path || args.path, content }, job, deps);
  return {
    ok: writeResult.ok,
    success: writeResult.ok,
    edits_applied: editsApplied,
    new_content: content
  };`
  },

  // Search tools - use shell grep/ripgrep
  search_code: {
    type: 'shell',
    command: (args) => {
      const pattern = '${args.pattern}';
      const filePattern = args.file_pattern ? ` --include="${'${args.file_pattern}'}"` : '';
      const contextLines = args.context_lines || 2;
      return `grep -rn -C ${contextLines}${filePattern} "\${args.pattern}" . 2>/dev/null | head -\${args.max_results || 50}`;
    },
    mapResult: (result) => `{
    ok: result.ok,
    matches: (result.stdout || "").split("\\n").filter(Boolean).map(line => {
      const match = line.match(/^([^:]+):(\\d+):(.*)$/);
      return match ? { file: match[1], line: parseInt(match[2]), content: match[3] } : null;
    }).filter(Boolean),
    total_matches: (result.stdout || "").split("\\n").filter(Boolean).length
  }`
  },
  find_definition: {
    type: 'shell',
    command: (args) => `grep -rn "^\\s*\\(export\\s\\+\\)\\?\\(function\\|class\\|interface\\|type\\|const\\|let\\|var\\)\\s\\+\${args.symbol}\\b" . 2>/dev/null | head -5`,
    mapResult: (result) => `{
    ok: result.ok,
    found: !!(result.stdout || "").trim(),
    matches: (result.stdout || "").split("\\n").filter(Boolean).map(line => {
      const match = line.match(/^([^:]+):(\\d+):(.*)$/);
      return match ? { file: match[1], line: parseInt(match[2]), content: match[3].trim() } : null;
    }).filter(Boolean)
  }`
  },
  find_references: {
    type: 'shell',
    command: (args) => `grep -rn "\\b\${args.symbol}\\b" . 2>/dev/null | head -50`,
    mapResult: (result) => `{
    ok: result.ok,
    references: (result.stdout || "").split("\\n").filter(Boolean).map(line => {
      const match = line.match(/^([^:]+):(\\d+):(.*)$/);
      return match ? { file: match[1], line: parseInt(match[2]), context: match[3].trim() } : null;
    }).filter(Boolean),
    total_count: (result.stdout || "").split("\\n").filter(Boolean).length
  }`
  },

  // Git tools - use shell commands
  git_status: {
    type: 'shell',
    command: () => `git status --porcelain && echo "---BRANCH---" && git branch --show-current && echo "---AHEAD_BEHIND---" && git rev-list --left-right --count HEAD...@{u} 2>/dev/null || echo "0 0"`,
    mapResult: (result) => `(() => {
    const parts = (result.stdout || "").split("---BRANCH---");
    const statusLines = (parts[0] || "").trim().split("\\n").filter(Boolean);
    const branchParts = (parts[1] || "").split("---AHEAD_BEHIND---");
    const branch = (branchParts[0] || "").trim();
    const [ahead, behind] = (branchParts[1] || "0 0").trim().split(/\\s+/).map(n => parseInt(n) || 0);

    return {
      ok: result.ok,
      branch,
      staged: statusLines.filter(l => l[0] !== " " && l[0] !== "?").map(l => l.slice(3)),
      modified: statusLines.filter(l => l[1] === "M").map(l => l.slice(3)),
      untracked: statusLines.filter(l => l.startsWith("??")).map(l => l.slice(3)),
      deleted: statusLines.filter(l => l[1] === "D" || l[0] === "D").map(l => l.slice(3)),
      ahead,
      behind
    };
  })()`
  },
  git_diff: {
    type: 'shell',
    command: (args) => {
      const staged = args.staged ? ' --cached' : '';
      const file = args.file_path ? ` -- "\${args.file_path}"` : '';
      const base = args.base ? ` \${args.base}...HEAD` : '';
      return `git diff${staged}${base}${file}`;
    },
    mapResult: (result) => `{ ok: result.ok, diff: result.stdout || "", files: [], stats: { insertions: 0, deletions: 0 } }`
  },
  git_log: {
    type: 'shell',
    command: (args) => {
      const limit = args.limit || 10;
      const file = args.file_path ? ` -- "\${args.file_path}"` : '';
      return `git log --format="%H|%ae|%aI|%s" -n ${limit}${file}`;
    },
    mapResult: (result) => `{
    ok: result.ok,
    commits: (result.stdout || "").split("\\n").filter(Boolean).map(line => {
      const [hash, author, date, ...msgParts] = line.split("|");
      return { hash: (hash || "").slice(0, 7), author, date, message: msgParts.join("|") };
    })
  }`
  },
  git_branch: {
    type: 'shell',
    command: (args) => {
      const action = args.action || 'list';
      if (action === 'list') return 'git branch -a';
      if (action === 'create') return `git checkout -b "\${args.branch_name}" \${args.base || ""}`;
      if (action === 'switch') return `git checkout "\${args.branch_name}"`;
      if (action === 'delete') return `git branch -d "\${args.branch_name}"`;
      return 'git branch';
    },
    mapResult: (result) => `{
    ok: result.ok,
    success: result.ok,
    branches: (result.stdout || "").split("\\n").filter(Boolean).map(b => b.trim().replace(/^\\* /, "")),
    current: ((result.stdout || "").match(/^\\* (.+)$/m) || [])[1] || ""
  }`
  },
  git_commit: {
    type: 'shell',
    command: (args) => {
      const files = args.files?.length ? args.files.map(f => `"${f}"`).join(' ') : '.';
      return `git add ${files} && git commit -m "\${args.message}"`;
    },
    mapResult: (result) => `{
    ok: result.ok,
    success: result.ok,
    hash: ((result.stdout || "").match(/\\[\\w+ ([a-f0-9]+)\\]/) || [])[1] || "",
    files_committed: ((result.stdout || "").match(/(\\d+) file/) || [])[1] || 0
  }`
  },
  git_push: {
    type: 'shell',
    command: (args) => {
      const upstream = args.set_upstream ? ' -u origin HEAD' : '';
      return `git push${upstream}`;
    },
    mapResult: (result) => `{ ok: result.ok, success: result.ok, remote: "origin", branch: "" }`
  },
  git_pull: {
    type: 'shell',
    command: (args) => args.rebase ? 'git pull --rebase' : 'git pull',
    mapResult: (result) => `{ ok: result.ok, success: result.ok, commits_pulled: 0, conflicts: [] }`
  },
  create_pull_request: {
    type: 'shell',
    command: (args) => {
      const draft = args.draft ? ' --draft' : '';
      return `gh pr create --title "\${args.title}" --body "\${args.description}"${draft} --base \${args.base_branch || "main"}`;
    },
    mapResult: (result) => `{
    ok: result.ok,
    success: result.ok,
    pr_number: parseInt(((result.stdout || "").match(/\\/pull\\/(\\d+)/) || [])[1]) || 0,
    url: (result.stdout || "").trim()
  }`
  },

  // Test/Build tools - use npm/pnpm commands
  run_tests: {
    type: 'shell',
    command: (args) => {
      const pattern = args.pattern ? ` -- --testPathPattern="${'${args.pattern}'}"` : '';
      const coverage = args.coverage ? ' --coverage' : '';
      return `npm test${pattern}${coverage} 2>&1 || true`;
    },
    mapResult: (result) => `{
    ok: !((result.stdout || "").includes("FAIL") || (result.stderr || "").includes("FAIL")),
    success: !((result.stdout || "").includes("FAIL") || (result.stderr || "").includes("FAIL")),
    output: result.stdout || "",
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  }`
  },
  get_coverage: {
    type: 'shell',
    command: () => `npm test -- --coverage --coverageReporters=json-summary 2>&1 || true`,
    mapResult: (result) => `{ ok: result.ok, summary: {}, output: result.stdout || "" }`
  },
  run_build: {
    type: 'shell',
    command: (args) => `npm run build 2>&1`,
    mapResult: (result) => `{
    ok: result.exitCode === 0,
    success: result.exitCode === 0,
    output: result.stdout || "",
    warnings: [],
    errors: result.exitCode !== 0 ? [(result.stderr || result.stdout || "Build failed")] : []
  }`
  },
  run_lint: {
    type: 'shell',
    command: (args) => {
      const fix = args.fix ? ' --fix' : '';
      const file = args.file_path ? ` "\${args.file_path}"` : '';
      return `npm run lint${fix}${file} 2>&1 || true`;
    },
    mapResult: (result) => `{
    ok: result.exitCode === 0,
    success: result.exitCode === 0,
    output: result.stdout || "",
    errors: 0,
    warnings: 0,
    issues: []
  }`
  },
  run_typecheck: {
    type: 'shell',
    command: () => `npx tsc --noEmit 2>&1 || true`,
    mapResult: (result) => `{
    ok: result.exitCode === 0,
    success: result.exitCode === 0,
    errors: (result.stdout || "").split("\\n").filter(l => l.includes("error TS")),
    error_count: ((result.stdout || "").match(/error TS/g) || []).length
  }`
  },

  // Dependency tools
  list_dependencies: {
    type: 'shell',
    command: () => `cat package.json`,
    mapResult: (result) => `(() => {
    try {
      const pkg = JSON.parse(result.stdout || "{}");
      return {
        ok: true,
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
        total: Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length
      };
    } catch (e) {
      return { ok: false, error: "Failed to parse package.json" };
    }
  })()`
  },
  install_dependency: {
    type: 'shell',
    command: (args) => {
      const dev = args.dev ? ' -D' : '';
      return `npm install${dev} "\${args.package}"`;
    },
    mapResult: (result) => `{ ok: result.ok, success: result.ok, package: args.package, version: "" }`
  },

  // Analysis tools
  analyze_complexity: {
    type: 'shell',
    command: (args) => `wc -l "\${args.file_path}" && grep -c "if\\|for\\|while\\|switch\\|&&\\|||" "\${args.file_path}" 2>/dev/null || echo "0"`,
    mapResult: (result) => `{
    ok: result.ok,
    file: args.file_path,
    lines: parseInt((result.stdout || "").split("\\n")[0]) || 0,
    cyclomatic_complexity: parseInt((result.stdout || "").split("\\n")[1]) || 0,
    recommendations: []
  }`
  },
  analyze_imports: {
    type: 'shell',
    command: (args) => `grep -E "^import|^from|require\\(" "\${args.file_path}" 2>/dev/null || true`,
    mapResult: (result) => `{
    ok: result.ok,
    file: args.file_path,
    imports: (result.stdout || "").split("\\n").filter(Boolean),
    imported_by: [],
    circular: false
  }`
  },

  // API tools
  list_api_endpoints: {
    type: 'shell',
    command: (args) => {
      const filter = args.filter ? ` | grep "${args.filter}"` : '';
      return `grep -rn "router\\.(get\\|post\\|put\\|patch\\|delete)\\|app\\.(get\\|post\\|put\\|patch\\|delete)" . 2>/dev/null${filter} | head -50`;
    },
    mapResult: (result) => `{
    ok: result.ok,
    endpoints: (result.stdout || "").split("\\n").filter(Boolean).map(line => {
      const match = line.match(/\\.(get|post|put|patch|delete)\\s*\\(["'\`]([^"'\`]+)/i);
      return match ? { method: match[1].toUpperCase(), path: match[2], source: line.split(":")[0] } : null;
    }).filter(Boolean),
    total: (result.stdout || "").split("\\n").filter(Boolean).length
  }`
  },
  test_api_endpoint: {
    type: 'shell',
    command: (args) => {
      const method = args.method || 'GET';
      const body = args.body ? ` -d '${JSON.stringify(args.body)}'` : '';
      const headers = args.headers ? Object.entries(args.headers).map(([k, v]) => ` -H "${k}: ${v}"`).join('') : '';
      return `curl -s -X ${method}${headers}${body} "http://localhost:3000\${args.path}"`;
    },
    mapResult: (result) => `{
    ok: result.ok,
    status: 200,
    body: (() => { try { return JSON.parse(result.stdout || "{}"); } catch { return result.stdout; } })(),
    duration_ms: 0
  }`
  },

  // Database tools
  show_database_schema: {
    type: 'shell',
    command: (args) => {
      const table = args.table ? ` WHERE table_name = '${args.table}'` : '';
      return `echo "Schema inspection requires database connection"`;
    },
    mapResult: (result) => `{ ok: true, tables: [], relationships: [], note: "Database schema inspection not available in shell mode" }`
  },
  run_migration: {
    type: 'shell',
    command: (args) => {
      const action = args.action || 'status';
      if (action === 'up') return 'npm run migrate:up 2>&1 || npx prisma migrate deploy 2>&1';
      if (action === 'down') return 'npm run migrate:down 2>&1 || echo "Rollback not configured"';
      return 'npm run migrate:status 2>&1 || npx prisma migrate status 2>&1';
    },
    mapResult: (result) => `{ ok: result.ok, success: result.ok, migrations_run: [], pending: [], output: result.stdout || "" }`
  },

  // Documentation tools
  generate_docs: {
    type: 'shell',
    command: (args) => `echo "Documentation generation placeholder"`,
    mapResult: (result) => `{ ok: true, output: "Documentation generation requires additional setup", files_processed: 0 }`
  },

  // Environment tools
  check_environment: {
    type: 'shell',
    command: () => `node --version && npm --version && test -f .env && echo "env:exists" || echo "env:missing" && test -d node_modules && echo "deps:installed" || echo "deps:missing"`,
    mapResult: (result) => `(() => {
    const lines = (result.stdout || "").split("\\n");
    return {
      ok: true,
      node_version: lines[0] || "",
      npm_version: lines[1] || "",
      env_file_exists: (result.stdout || "").includes("env:exists"),
      dependencies_installed: (result.stdout || "").includes("deps:installed"),
      required_services: []
    };
  })()`
  },
  start_dev_server: {
    type: 'shell',
    command: (args) => {
      const port = args.port ? ` -- --port ${args.port}` : '';
      return `npm run dev${port} &`;
    },
    mapResult: (result) => `{ ok: result.ok, success: result.ok, url: "http://localhost:" + (args.port || 3000), pid: 0 }`
  }
};

// ── JS tool generation ──

/**
 * Generate a single JS tool file (.mjs) for ADAS Core
 * Creates real implementations that use runShell or built-in ADAS tools
 */
function generateJSTool(tool) {
  const inputs = tool.inputs || [];
  const toolName = tool.name;
  // Sanitize for use as JS identifier (dots → underscores)
  const jsName = toolName.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^[0-9]/, '_$&');
  const impl = TOOL_IMPLEMENTATIONS[toolName];

  // Generate JSDoc for args
  const argsDoc = inputs.map(inp => {
    const optional = inp.required === false ? " (optional)" : "";
    return ` * @param {${jsType(inp.type)}} args.${inp.name} - ${inp.description || inp.type}${optional}`;
  }).join("\n");

  // Generate meta args array
  const metaArgs = inputs.map(inp => {
    return `    { name: "${inp.name}", type: "${inp.type || "string"}", optional: ${inp.required === false}, description: "${escapeString(inp.description || "")}" }`;
  }).join(",\n");

  // Generate implementation based on type
  let implementation;

  // Check if this is an MCP bridge tool (imported from a connector)
  if (tool.source?.type === 'mcp_bridge') {
    const mcpTool = tool.source.mcp_tool || tool.name;
    implementation = `
  // MCP Bridge tool - proxies to connector MCP server
  // Original MCP tool: ${mcpTool}
  // Connection ID: ${tool.source.connection_id || 'unknown'}

  // The skill.yaml mcp_server field should point to the connector's MCP server
  // ADAS Core's runtimeMap will load this tool from the MCP server at runtime
  // This JS file serves as documentation/fallback only

  if (!deps.mcpCall) {
    return { ok: false, error: "MCP bridge not available - deps.mcpCall is required" };
  }

  const result = await deps.mcpCall("${mcpTool}", args);
  return result;`;
  } else if (impl?.customImpl) {
    // Custom implementation provided
    implementation = impl.customImpl;
  } else if (impl?.type === 'builtin') {
    // Use ADAS built-in tool
    implementation = `
  // Call built-in ADAS tool: ${impl.builtin}
  const mappedArgs = ${impl.mapArgs};
  const result = await deps.tools.${impl.builtin}(mappedArgs, job, deps);
  return ${impl.mapResult};`;
  } else if (impl?.type === 'shell') {
    // Use runShell wrapper
    const cmdStr = typeof impl.command === 'function'
      ? impl.command({}) // Get template
      : impl.command;

    implementation = `
  // Execute shell command
  const cmd = \`${cmdStr.replace(/`/g, '\\`')}\`;
  const result = await deps.tools.runShell({ command: cmd }, job, deps);
  return ${impl.mapResult};`;
  } else {
    // Fallback to mock implementation for unknown tools
    const mock = tool.mock || {};
    const examples = mock.examples || [];

    if (examples.length > 0) {
      const mockData = examples.map(ex => {
        const key = JSON.stringify(ex.input);
        const val = JSON.stringify(ex.output, null, 2).split("\n").map((l, i) => i > 0 ? "    " + l : l).join("\n");
        return `  [${key}, ${val}]`;
      }).join(",\n");

      implementation = `
  // Mock implementation (no shell mapping found for this tool)
  const mockData = new Map([
${mockData}
  ]);

  const inputKey = JSON.stringify(args);
  for (const [key, value] of mockData) {
    if (key === inputKey) {
      return { ok: true, ...value };
    }
  }
  return { ok: true, _note: "No matching mock data", args };`;
    } else {
      implementation = `
  // TODO: Implement - no shell mapping or mock data available
  return { ok: false, error: "Tool not implemented: ${toolName}", args };`;
    }
  }

  return `// ${tool.name}.mjs - Generated by ADAS MCP Toolbox Builder
// Tool: ${tool.purpose || tool.description || tool.name}

/**
 * ${tool.purpose || tool.description || tool.name}
 *
${argsDoc || " * @param {object} args - Tool arguments"}
 * @param {object} job - Job context
 * @param {object} deps - Dependencies (deps.tools contains ADAS built-in tools)
 * @returns {Promise<object>} Tool result
 */
async function ${jsName}(args = {}, job = {}, deps = {}) {
  ${implementation.trim()}
}

${jsName}.meta = {
  name: "${tool.name}",
  description: "${escapeString(tool.purpose || tool.description || "")}",
  args: [
${metaArgs}
  ],
  planner: { visible: true }
};

export default ${jsName};
`;
}

// ── Skill YAML for ADAS Core ──

/**
 * Generate skill.yaml for ADAS Core (simplified)
 */
export function generateSkillYamlForAdasCore(toolbox) {
  const lines = [];
  const slug = toolbox.original_skill_id || toSlug(toolbox.name || toolbox.id || "untitled");

  lines.push(`# Skill Configuration for ADAS Core`);
  lines.push(`# Generated by ADAS MCP Toolbox Builder`);
  lines.push(``);
  lines.push(`id: ${yamlString(slug)}`);
  lines.push(`name: ${yamlString(toolbox.name || "Untitled Skill")}`);
  lines.push(`version: ${toolbox.version || 1}`);
  lines.push(``);

  // MCP Server (if set explicitly on the skill)
  if (toolbox.mcp_server) {
    lines.push(`# MCP Server for skill-specific tools`);
    lines.push(`mcp_server: ${yamlString(toolbox.mcp_server)}`);
    lines.push(``);
  }

  // Connectors & UI Plugins
  lines.push(...yamlConnectorsBlock(toolbox.tools));
  lines.push(...yamlUiPluginsBlock(toolbox.ui_plugins));

  // Connector configurations - per-skill identity/config overrides (DEPRECATED)
  // Kept for backward compatibility with existing CORE versions
  if (toolbox.connector_configs?.length > 0) {
    lines.push(`# Connector Configurations - Per-skill identity overrides (DEPRECATED)`);
    lines.push(`# Use 'identity' and 'channels' sections instead`);
    lines.push(`connector_configs:`);
    for (const config of toolbox.connector_configs) {
      lines.push(`  - connector_id: ${yamlString(config.connector_id)}`);
      if (config.identity) {
        lines.push(`    identity:`);
        if (config.identity.from_name) {
          lines.push(`      from_name: ${yamlString(config.identity.from_name)}`);
        }
        if (config.identity.from_email) {
          lines.push(`      from_email: ${yamlString(config.identity.from_email)}`);
        }
        if (config.identity.signature) {
          lines.push(`      signature: ${yamlString(config.identity.signature)}`);
        }
      }
      if (config.defaults && Object.keys(config.defaults).length > 0) {
        lines.push(`    defaults:`);
        for (const [key, value] of Object.entries(config.defaults)) {
          lines.push(`      ${key}: ${yamlString(value)}`);
        }
      }
    }
    lines.push(``);
  }

  // NEW: Skill Identity - who the skill is (independent of channels)
  if (toolbox.skill_identity) {
    const identity = toolbox.skill_identity;
    lines.push(`# Skill Identity - who this skill is`);
    lines.push(`identity:`);

    if (identity.actor_ref) {
      lines.push(`  actor_ref: ${yamlString(identity.actor_ref)}`);
    }
    if (identity.display_name) {
      lines.push(`  display_name: ${yamlString(identity.display_name)}`);
    }
    if (identity.avatar_url) {
      lines.push(`  avatar_url: ${yamlString(identity.avatar_url)}`);
    }

    // Channel-specific identities
    if (identity.channel_identities?.email) {
      const email = identity.channel_identities.email;
      lines.push(`  email:`);
      if (email.from_name) {
        lines.push(`    from_name: ${yamlString(email.from_name)}`);
      }
      if (email.from_email) {
        lines.push(`    from_email: ${yamlString(email.from_email)}`);
      }
      if (email.signature) {
        lines.push(`    signature: |`);
        const sigLines = email.signature.split('\n');
        for (const line of sigLines) {
          lines.push(`      ${line}`);
        }
      }
    }

    if (identity.channel_identities?.slack) {
      const slack = identity.channel_identities.slack;
      lines.push(`  slack:`);
      if (slack.bot_name) {
        lines.push(`    bot_name: ${yamlString(slack.bot_name)}`);
      }
      if (slack.bot_icon_url) {
        lines.push(`    bot_icon_url: ${yamlString(slack.bot_icon_url)}`);
      }
    }

    lines.push(``);
  }

  // NEW: Skill Channels - how the skill is reached and responds
  if (toolbox.skill_channels) {
    const channels = toolbox.skill_channels;
    lines.push(`# Skill Channels - routing configuration`);
    lines.push(`channels:`);

    // Email channels
    if (channels.email) {
      lines.push(`  email:`);
      if (channels.email.inbound?.addresses?.length > 0) {
        lines.push(`    inbound:`);
        lines.push(`      addresses:`);
        for (const addr of channels.email.inbound.addresses) {
          lines.push(`        - ${yamlString(addr)}`);
        }
      }
      if (channels.email.outbound?.from_email) {
        lines.push(`    outbound:`);
        lines.push(`      from_email: ${yamlString(channels.email.outbound.from_email)}`);
      }
    }

    // Slack channels
    if (channels.slack) {
      lines.push(`  slack:`);
      if (channels.slack.inbound) {
        lines.push(`    inbound:`);
        if (channels.slack.inbound.mentions?.length > 0) {
          lines.push(`      mentions:`);
          for (const mention of channels.slack.inbound.mentions) {
            lines.push(`        - ${yamlString(mention)}`);
          }
        }
        if (channels.slack.inbound.channels?.length > 0) {
          lines.push(`      channels:`);
          for (const ch of channels.slack.inbound.channels) {
            lines.push(`        - ${yamlString(ch)}`);
          }
        }
      }
      if (channels.slack.outbound?.bot_ref) {
        lines.push(`    outbound:`);
        lines.push(`      bot_ref: ${yamlString(channels.slack.outbound.bot_ref)}`);
      }
    }

    lines.push(``);
  }

  // Resources
  lines.push(`resources:`);
  lines.push(`  - name: codebase`);
  lines.push(`    type: filesystem`);
  lines.push(`    required: false`);
  lines.push(`    description: "Project source code directory"`);
  lines.push(``);

  // Role/Persona
  if (toolbox.role?.persona) {
    lines.push(`role:`);
    lines.push(`  persona: |`);
    const personaLines = toolbox.role.persona.split("\n");
    for (const line of personaLines) {
      lines.push(`    ${line}`);
    }
    lines.push(``);
  }

  // Tools with security classification
  if (toolbox.tools?.length > 0) {
    lines.push(`# Available Tools`);
    lines.push(`tools:`);
    for (const tool of toolbox.tools) {
      lines.push(`  - name: ${yamlString(tool.name || '')}`);
      if (tool.description) {
        lines.push(`    description: ${yamlString(tool.description)}`);
      }
      if (tool.security) {
        lines.push(`    security:`);
        if (tool.security.classification) {
          lines.push(`      classification: ${yamlString(tool.security.classification)}`);
        }
        if (tool.security.data_owner_field) {
          lines.push(`      data_owner_field: ${yamlString(tool.security.data_owner_field)}`);
        }
        if (tool.security.risk) {
          lines.push(`      risk: ${yamlString(tool.security.risk)}`);
        }
      }
    }
    lines.push(``);
  }

  // Policy - allow all tools by default
  lines.push(`policy:`);
  lines.push(`  tools:`);
  lines.push(`    allowed: ["*"]`);
  lines.push(``);

  // Identity & Access Control
  lines.push(...yamlGrantMappingsBlock(toolbox.grant_mappings));
  lines.push(...yamlAccessPolicyBlock(toolbox.access_policy));
  lines.push(...yamlResponseFiltersBlock(toolbox.response_filters));
  lines.push(...yamlContextPropagationBlock(toolbox.context_propagation));

  return lines.join("\n");
}

// ── Meta tool generation ──

/**
 * Generate a JS meta tool with precise execution instructions
 *
 * Meta tools are higher-level operations that combine multiple tools.
 * The description is precise so the LLM/Python script knows exactly what to call.
 */
function generateJSMetaTool(metaTool, composedTools) {
  const composedToolNames = metaTool.composes || [];

  // Gather unique inputs from all composed tools
  const inputMap = new Map();
  for (const composedTool of composedTools) {
    for (const input of (composedTool.inputs || [])) {
      if (!inputMap.has(input.name)) {
        inputMap.set(input.name, input);
      }
    }
  }
  const inputs = Array.from(inputMap.values());

  // Generate JSDoc for args
  const argsDoc = inputs.map(inp => {
    const optional = inp.required === false ? " (optional)" : "";
    return ` * @param {${jsType(inp.type)}} args.${inp.name} - ${inp.description || inp.type}${optional}`;
  }).join("\n");

  // Generate meta args array
  const metaArgs = inputs.map(inp => {
    return `    { name: "${inp.name}", type: "${inp.type || "string"}", optional: ${inp.required === false}, description: "${escapeString(inp.description || "")}" }`;
  }).join(",\n");

  // Meta description - describes WHAT it does (like a real tool)
  const toolDescription = escapeString(metaTool.description);

  // Generate tool call sequence
  // Each composed tool is called via deps.tools
  const toolCalls = composedToolNames.map((name, i) => {
    return `  const result_${i} = await deps.tools.${name}(args, job, deps);
  results.${name} = result_${i};
  if (result_${i}?.ok === false) {
    return { ok: false, error: \`Tool ${name} failed: \${result_${i}?.error || 'unknown'}\`, results };
  }`;
  }).join("\n\n");

  return `// ${metaTool.name}.mjs - Generated by ADAS MCP Toolbox Builder
// Meta Tool: Composes ${composedToolNames.join(' + ')}

/**
 * ${metaTool.description}
 *
${argsDoc || " * @param {object} args - Tool arguments"}
 * @param {object} job - Job context
 * @param {object} deps - Dependencies (includes deps.tools for calling other tools)
 * @returns {Promise<object>} Combined result from composed tools
 */
async function ${metaTool.name}(args = {}, job = {}, deps = {}) {
  const results = {};

  // Logic: ${metaTool.logic || 'Run tools in sequence'}
${toolCalls}

  return { ok: true, results };
}

${metaTool.name}.meta = {
  name: "${metaTool.name}",
  description: "${toolDescription}",
  args: [
${metaArgs}
  ],
  planner: { visible: true }
};

export default ${metaTool.name};
`;
}

/**
 * Get all tools including compiled meta tools
 */
function getAllToolsWithMetaCompiled(toolbox) {
  const tools = [...(toolbox.tools || [])];
  const approvedMetaTools = (toolbox.meta_tools || []).filter(mt => mt.status === 'approved');

  // Convert meta tools to tool-like objects for code generation
  const metaToolsAsTools = approvedMetaTools.map(metaTool => {
    const composedToolNames = metaTool.composes || [];
    const composedTools = composedToolNames
      .map(name => toolbox.tools?.find(t => t.name === name))
      .filter(Boolean);

    // Gather unique inputs
    const inputMap = new Map();
    for (const composedTool of composedTools) {
      for (const input of (composedTool.inputs || [])) {
        if (!inputMap.has(input.name)) {
          inputMap.set(input.name, input);
        }
      }
    }

    return {
      ...metaTool,
      inputs: Array.from(inputMap.values()),
      output: {
        type: 'object',
        description: `Combined result from: ${composedToolNames.join(', ')}`
      },
      _isMetaTool: true,
      _composedTools: composedTools
    };
  });

  return { tools, metaToolsAsTools, approvedMetaTools };
}

// ── ADAS Core export payloads ──

/**
 * Generate export payload for ADAS Core import API
 * This creates the JSON structure expected by POST /api/skills/import
 *
 * NOTE: Meta tools are NOT exported as separate .mjs files.
 * They exist only as descriptions in skill.yaml so the planner knows about them.
 * The planner will call the composed tools directly based on the description.
 */
export function generateAdasExportPayload(toolbox) {
  const slug = toolbox.original_skill_id || toSlug(toolbox.name || toolbox.id || "untitled");
  const tools = toolbox.tools || [];
  const approvedMetaTools = (toolbox.meta_tools || []).filter(mt => mt.status === 'approved');

  // Build skill object (what goes in skill.yaml)
  const skill = {
    id: slug,
    name: toolbox.name || "Untitled Skill",
    version: toolbox.version || 1,
    resources: [
      { name: "codebase", type: "filesystem", required: false, description: "Project source code directory" }
    ],
    policy: {
      tools: { allowed: ["*"] }
    }
  };

  if (toolbox.role?.persona) {
    skill.role = { persona: toolbox.role.persona };
  }

  // Always add engine config (max_iterations, timeout, etc.) - use defaults if not specified
  const eng = toolbox.engine || {};
  skill.engine = {
    model: eng.model || 'default',
    temperature: eng.temperature ?? 0.7,
    max_tokens: eng.max_tokens || 4096,
    // RV2 settings - these control the iteration loop
    max_iterations: eng.rv2?.max_iterations ?? 16,
    timeout: eng.rv2?.timeout ?? 60000,
    on_max_iterations: eng.rv2?.on_max_iterations ?? 'ask_user',
    // HLR settings - max replans (strategy changes)
    max_replans: eng.hlr?.replanning?.max_replans ?? 3,
    // Finalization gate (judge)
    finalization_gate: {
      enabled: eng.finalization_gate?.enabled ?? true,
      max_retries: eng.finalization_gate?.max_retries ?? 2
    }
  };

  // Add connectors array if skill has linked connectors
  if (toolbox.connectors && toolbox.connectors.length > 0) {
    skill.connectors = [...toolbox.connectors];
  }

  // Add ui_plugins for agent-to-plugin commands (UI-capable skills)
  const compiledPlugins = compileUiPlugins(toolbox.ui_plugins);
  if (compiledPlugins) {
    skill.ui_plugins = compiledPlugins;
  }

  // Add connector_configs if present (per-skill identity)
  if (toolbox.connector_configs && toolbox.connector_configs.length > 0) {
    skill.connector_configs = toolbox.connector_configs.map(cfg => ({
      connector_id: cfg.connector_id,
      ...(cfg.identity && { identity: { ...cfg.identity } }),
      ...(cfg.defaults && { defaults: { ...cfg.defaults } })
    }));
  }

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

  // Build tools array with name and code (regular tools)
  const toolsPayload = tools.map(tool => ({
    name: tool.name,
    code: generateJSTool(tool)
  }));

  // Add meta tools as .mjs files - they return execution instructions
  for (const metaTool of approvedMetaTools) {
    const composedTools = (metaTool.composes || [])
      .map(name => tools.find(t => t.name === name))
      .filter(Boolean);

    toolsPayload.push({
      name: metaTool.name,
      code: generateJSMetaTool(metaTool, composedTools)
    });
  }

  return {
    skillSlug: slug,
    skill,
    tools: toolsPayload
  };
}

/**
 * Generate export files for ADAS Core (JS tools format)
 *
 * Meta tools ARE exported as .mjs files that return execution instructions.
 * Core calls them like regular tools, but they return directives instead of results.
 */
export function generateAdasExportFiles(toolbox) {
  const tools = toolbox.tools || [];
  const approvedMetaTools = (toolbox.meta_tools || []).filter(mt => mt.status === 'approved');
  const connectorFiles = generateAllConnectorFiles(toolbox);
  const files = [
    { name: "skill.yaml", content: generateSkillYamlForAdasCore(toolbox) }
  ];

  // Add each regular tool as a separate .mjs file
  for (const tool of tools) {
    if (tool.source?.type === "mcp_bridge") continue; // Skip — Tier 3 connector system handles these directly
    files.push({
      name: `tools/${tool.name}.mjs`,
      content: generateJSTool(tool)
    });
  }

  // Add meta tools as .mjs files - they return execution instructions
  for (const metaTool of approvedMetaTools) {
    const composedTools = (metaTool.composes || [])
      .map(name => tools.find(t => t.name === name))
      .filter(Boolean);

    files.push({
      name: `tools/${metaTool.name}.mjs`,
      content: generateJSMetaTool(metaTool, composedTools)
    });
  }

  // Add connector configuration files
  files.push(...connectorFiles);

  return files;
}
