/**
 * MCP Development Agent
 *
 * An AUTONOMOUS agent that:
 * 1. Analyzes domain spec
 * 2. INFERS missing details (doesn't ask)
 * 3. Generates complete MCP server
 * 4. Shows user what was inferred (optional review)
 * 5. Allows refinement if user wants changes
 *
 * Philosophy: Generate first, ask later (if at all).
 * Users shouldn't have to answer questions - the agent should be smart enough
 * to make reasonable decisions based on context.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const MAX_GENERATION_ITERATIONS = 20;

// ═══════════════════════════════════════════════════════════════════════════
// LLM CLIENT - supports both Anthropic and OpenAI
// ═══════════════════════════════════════════════════════════════════════════

function getLLMConfig() {
  const provider = process.env.LLM_PROVIDER || "anthropic";

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }
    return {
      provider: "openai",
      apiKey,
      model: process.env.OPENAI_MODEL || "gpt-4-turbo",
      baseUrl: "https://api.openai.com/v1"
    };
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not set");
    }
    return {
      provider: "anthropic",
      apiKey,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
    };
  }
}

/**
 * Call LLM with tool use support - works with both Anthropic and OpenAI
 */
async function callLLMWithTools({ systemPrompt, messages, tools, maxTokens = 8192, llmConfig }) {
  // OpenAI models have lower token limits
  const effectiveMaxTokens = llmConfig.provider === "openai" ? Math.min(maxTokens, 4096) : maxTokens;
  if (llmConfig.provider === "openai") {
    return callOpenAIWithTools({ systemPrompt, messages, tools, maxTokens: effectiveMaxTokens, llmConfig });
  } else {
    return callAnthropicWithTools({ systemPrompt, messages, tools, maxTokens: effectiveMaxTokens, llmConfig });
  }
}

async function callAnthropicWithTools({ systemPrompt, messages, tools, maxTokens, llmConfig }) {
  const client = new Anthropic({ apiKey: llmConfig.apiKey });

  const response = await client.messages.create({
    model: llmConfig.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools,
    messages,
  });

  return {
    content: response.content,
    stopReason: response.stop_reason,
    toolUseBlocks: response.content.filter((b) => b.type === "tool_use"),
    textContent: response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n"),
  };
}

async function callOpenAIWithTools({ systemPrompt, messages, tools, maxTokens, llmConfig }) {
  // Convert Anthropic-style tools to OpenAI format
  const openaiTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  // Convert messages to OpenAI format
  const openaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => {
      if (m.role === "assistant" && Array.isArray(m.content)) {
        // Handle assistant messages with tool calls
        const textParts = m.content.filter((c) => c.type === "text");
        const toolUseParts = m.content.filter((c) => c.type === "tool_use");

        if (toolUseParts.length > 0) {
          return {
            role: "assistant",
            content: textParts.map((t) => t.text).join("\n") || null,
            tool_calls: toolUseParts.map((t) => ({
              id: t.id,
              type: "function",
              function: {
                name: t.name,
                arguments: JSON.stringify(t.input),
              },
            })),
          };
        }
        return {
          role: "assistant",
          content: textParts.map((t) => t.text).join("\n"),
        };
      }
      if (m.role === "user" && Array.isArray(m.content)) {
        // Handle tool results
        const toolResults = m.content.filter((c) => c.type === "tool_result");
        if (toolResults.length > 0) {
          return toolResults.map((r) => ({
            role: "tool",
            tool_call_id: r.tool_use_id,
            content: r.content,
          }));
        }
      }
      return { role: m.role, content: m.content };
    }).flat(),
  ];

  const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiTools.length > 0 ? "auto" : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const message = data.choices[0]?.message;
  const toolCalls = message?.tool_calls || [];

  // Convert to Anthropic-like response format
  const content = [];
  if (message?.content) {
    content.push({ type: "text", text: message.content });
  }
  for (const tc of toolCalls) {
    content.push({
      type: "tool_use",
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || "{}"),
    });
  }

  return {
    content,
    stopReason: data.choices[0]?.finish_reason,
    toolUseBlocks: content.filter((b) => b.type === "tool_use"),
    textContent: content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASES (simplified)
// ═══════════════════════════════════════════════════════════════════════════

export const MCP_DEV_PHASES = {
  ANALYZING: "analyzing",
  GENERATING: "generating",
  COMPLETE: "complete",
  REFINING: "refining",
};

// ═══════════════════════════════════════════════════════════════════════════
// INFERENCE ENGINE - The key to being autonomous
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer implementation details from tool definition
 * This is what makes the agent autonomous - it figures things out
 */
function inferToolImplementation(tool) {
  const name = (tool.name || "").toLowerCase();
  const desc = (tool.description || tool.purpose || "").toLowerCase();
  const text = `${name} ${desc}`;

  const inference = {
    implementationType: "mock", // Default to mock if can't determine
    apiPattern: null,
    dataSource: null,
    returnType: "dict",
    errorHandling: "standard",
    notes: [],
  };

  // Infer implementation type based on keywords
  if (text.match(/fetch|get|retrieve|lookup|search|query|find|list/)) {
    inference.implementationType = "read";
    inference.notes.push("Read operation - returns data");
  }

  if (text.match(/create|add|insert|new|register|submit/)) {
    inference.implementationType = "create";
    inference.notes.push("Create operation - adds new data");
  }

  if (text.match(/update|modify|change|edit|set/)) {
    inference.implementationType = "update";
    inference.notes.push("Update operation - modifies existing data");
  }

  if (text.match(/delete|remove|cancel|revoke/)) {
    inference.implementationType = "delete";
    inference.notes.push("Delete operation - removes data");
  }

  // Infer data source
  if (text.match(/api|endpoint|service|http|rest/)) {
    inference.dataSource = "api";
    inference.apiPattern = "REST";
    inference.notes.push("Likely calls external API");
  } else if (text.match(/database|db|sql|query|table/)) {
    inference.dataSource = "database";
    inference.notes.push("Likely queries database");
  } else if (text.match(/file|document|read|write|path/)) {
    inference.dataSource = "filesystem";
    inference.notes.push("Likely works with files");
  } else if (text.match(/email|send|notify|message/)) {
    inference.dataSource = "messaging";
    inference.notes.push("Likely sends messages/notifications");
  } else {
    inference.dataSource = "internal";
    inference.notes.push("Internal logic/computation");
  }

  // Infer return type from output definition or name
  if (tool.output?.type) {
    inference.returnType = tool.output.type;
  } else if (text.match(/list|all|search|find/)) {
    inference.returnType = "list";
  } else if (text.match(/count|total|sum/)) {
    inference.returnType = "number";
  } else if (text.match(/check|verify|is_|has_|can_/)) {
    inference.returnType = "boolean";
  }

  return inference;
}

/**
 * Infer input parameters if not defined
 */
function inferToolInputs(tool) {
  if (tool.inputs && tool.inputs.length > 0) {
    return tool.inputs;
  }

  const name = (tool.name || "").toLowerCase();
  const desc = (tool.description || "").toLowerCase();
  const text = `${name} ${desc}`;
  const inputs = [];

  // Common patterns
  if (text.match(/order/)) {
    inputs.push({ name: "order_id", type: "string", required: true, description: "The order ID" });
  }
  if (text.match(/customer|user/)) {
    inputs.push({ name: "customer_id", type: "string", required: true, description: "The customer ID" });
  }
  if (text.match(/product|item/)) {
    inputs.push({ name: "product_id", type: "string", required: true, description: "The product ID" });
  }
  if (text.match(/search|find|query/)) {
    inputs.push({ name: "query", type: "string", required: true, description: "Search query" });
  }
  if (text.match(/email/)) {
    inputs.push({ name: "email", type: "string", required: true, description: "Email address" });
  }
  if (text.match(/date|time|when/)) {
    inputs.push({ name: "date", type: "string", required: false, description: "Date (ISO format)" });
  }
  if (text.match(/limit|max/)) {
    inputs.push({ name: "limit", type: "integer", required: false, description: "Maximum results", default: 10 });
  }

  // If still no inputs and it's a lookup, add a generic ID
  if (inputs.length === 0 && text.match(/get|fetch|lookup|retrieve/)) {
    const entityMatch = name.match(/(?:get|fetch|lookup|retrieve)_?(\w+)/);
    if (entityMatch) {
      inputs.push({
        name: `${entityMatch[1]}_id`,
        type: "string",
        required: true,
        description: `The ${entityMatch[1]} identifier`,
      });
    }
  }

  return inputs;
}

/**
 * Generate mock example based on tool definition
 */
function generateMockExample(tool, inference) {
  const inputs = {};
  const inferredInputs = inferToolInputs(tool);

  for (const input of inferredInputs) {
    if (input.type === "string") {
      if (input.name.includes("id")) {
        inputs[input.name] = `${input.name.replace("_id", "")}_12345`;
      } else if (input.name.includes("email")) {
        inputs[input.name] = "user@example.com";
      } else if (input.name.includes("query")) {
        inputs[input.name] = "sample search";
      } else {
        inputs[input.name] = `sample_${input.name}`;
      }
    } else if (input.type === "integer" || input.type === "number") {
      inputs[input.name] = input.default || 10;
    } else if (input.type === "boolean") {
      inputs[input.name] = true;
    }
  }

  // Generate output based on inference
  let output;
  if (inference.returnType === "list") {
    output = {
      status: "success",
      data: [{ id: "item_1", name: "Sample Item 1" }, { id: "item_2", name: "Sample Item 2" }],
      count: 2,
    };
  } else if (inference.returnType === "boolean") {
    output = { status: "success", result: true };
  } else if (inference.returnType === "number") {
    output = { status: "success", value: 42 };
  } else {
    output = {
      status: "success",
      data: { id: "item_12345", name: "Sample Result", created_at: new Date().toISOString() },
    };
  }

  return { input: inputs, output };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DEVELOPMENT SESSION - AUTONOMOUS
// ═══════════════════════════════════════════════════════════════════════════

export class MCPDevelopmentSession {
  constructor(domain, options = {}) {
    this.domain = domain;
    this.outputDir = options.outputDir;
    this.onProgress = options.onProgress || (() => {});

    this.phase = MCP_DEV_PHASES.ANALYZING;
    this.generatedFiles = [];
    this.inferences = new Map(); // Store what we inferred for each tool
    this.validationResults = null;

    this.llmConfig = null;
  }

  async init() {
    this.llmConfig = getLLMConfig();
    console.log(`[MCPDev] Using LLM provider: ${this.llmConfig.provider}, model: ${this.llmConfig.model}`);
  }

  /**
   * Analyze and enrich domain - NO QUESTIONS, just inference
   */
  analyzeAndEnrich() {
    this.phase = MCP_DEV_PHASES.ANALYZING;

    const enrichedTools = [];
    const allInferences = [];

    for (const tool of this.domain.tools || []) {
      const inference = inferToolImplementation(tool);
      const inferredInputs = inferToolInputs(tool);
      const mockExample = generateMockExample(tool, inference);

      this.inferences.set(tool.name, inference);

      // Enrich the tool with inferred data
      const enrichedTool = {
        ...tool,
        _inference: inference,
        inputs: tool.inputs?.length > 0 ? tool.inputs : inferredInputs,
        _mockExample: mockExample,
      };

      enrichedTools.push(enrichedTool);
      allInferences.push({
        tool: tool.name,
        inference,
        inferredInputs: inferredInputs.length > 0 ? inferredInputs : null,
      });
    }

    // Store enriched tools
    this.enrichedTools = enrichedTools;

    return {
      phase: this.phase,
      toolsCount: enrichedTools.length,
      inferences: allInferences,
      ready: true, // Always ready - we inferred what we needed
    };
  }

  /**
   * Generate MCP - the main event
   */
  async *generate() {
    this.phase = MCP_DEV_PHASES.GENERATING;

    yield {
      type: "phase_change",
      phase: this.phase,
      message: "Generating MCP server...",
    };

    if (!this.client) {
      await this.init();
    }

    // Build the generation context with all our inferences
    const context = {
      domain: this.domain,
      enrichedTools: this.enrichedTools || this.domain.tools,
      inferences: Object.fromEntries(this.inferences),
    };

    // Run the generation agent
    for await (const event of this.runGenerationAgent(context)) {
      yield event;

      if (event.type === "file_written") {
        this.generatedFiles.push(event.filename);
      }
    }

    // Validate
    const validation = await this.validateGenerated();
    this.validationResults = validation;

    this.phase = MCP_DEV_PHASES.COMPLETE;

    yield {
      type: "complete",
      phase: this.phase,
      files: this.generatedFiles,
      validation,
    };
  }

  /**
   * Refine based on user feedback
   */
  async *refine(feedback) {
    this.phase = MCP_DEV_PHASES.REFINING;

    yield {
      type: "phase_change",
      phase: this.phase,
      message: "Applying changes...",
    };

    // Read existing files
    const existingFiles = {};
    for (const filename of this.generatedFiles) {
      try {
        existingFiles[filename] = await fs.readFile(
          path.join(this.outputDir, filename),
          "utf-8"
        );
      } catch {
        // File doesn't exist
      }
    }

    for await (const event of this.runRefinementAgent(existingFiles, feedback)) {
      yield event;
    }

    const validation = await this.validateGenerated();
    this.validationResults = validation;

    this.phase = MCP_DEV_PHASES.COMPLETE;

    yield {
      type: "complete",
      phase: this.phase,
      files: this.generatedFiles,
      validation,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATION AGENT
  // ═══════════════════════════════════════════════════════════════════════════

  async *runGenerationAgent(context) {
    const tools = getGenerationTools();
    const systemPrompt = buildAutonomousGenerationPrompt(context);
    const userMessage = buildGenerationRequest(context);

    let messages = [{ role: "user", content: userMessage }];
    let iteration = 0;

    while (iteration < MAX_GENERATION_ITERATIONS) {
      iteration++;

      yield { type: "iteration", iteration, maxIterations: MAX_GENERATION_ITERATIONS };

      const response = await callLLMWithTools({
        systemPrompt,
        messages,
        tools,
        maxTokens: 8192,
        llmConfig: this.llmConfig,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.toolUseBlocks.length === 0 || response.stopReason === "end_turn" || response.stopReason === "stop") {
        yield {
          type: "generation_complete",
          message: response.textContent,
          files: this.generatedFiles,
        };
        break;
      }

      const toolResults = [];

      for (const toolUse of response.toolUseBlocks) {
        yield { type: "tool_use", tool: toolUse.name };

        try {
          const result = await this.executeTool(toolUse.name, toolUse.input);

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          });

          if (toolUse.name === "write_file") {
            yield { type: "file_written", filename: toolUse.input.filename };
          }
        } catch (toolErr) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${toolErr.message}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  async *runRefinementAgent(existingFiles, feedback) {
    const tools = getGenerationTools();
    const systemPrompt = `You are refining an existing MCP server based on user feedback.

Current files:
${Object.entries(existingFiles).map(([name, content]) => `### ${name}\n\`\`\`python\n${content.substring(0, 2000)}${content.length > 2000 ? "\n... (truncated)" : ""}\n\`\`\``).join("\n\n")}

Make the requested changes. Be surgical - only modify what's needed.`;

    let messages = [{ role: "user", content: `Please make these changes:\n${feedback}` }];
    let iteration = 0;

    while (iteration < MAX_GENERATION_ITERATIONS) {
      iteration++;

      yield { type: "iteration", iteration, maxIterations: MAX_GENERATION_ITERATIONS };

      const response = await callLLMWithTools({
        systemPrompt,
        messages,
        tools,
        maxTokens: 8192,
        llmConfig: this.llmConfig,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.toolUseBlocks.length === 0 || response.stopReason === "end_turn" || response.stopReason === "stop") {
        yield {
          type: "refinement_complete",
          message: response.textContent,
        };
        break;
      }

      const toolResults = [];

      for (const toolUse of response.toolUseBlocks) {
        yield { type: "tool_use", tool: toolUse.name };

        try {
          const result = await this.executeTool(toolUse.name, toolUse.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          });

          if (toolUse.name === "write_file") {
            yield { type: "file_written", filename: toolUse.input.filename };
          }
        } catch (toolErr) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${toolErr.message}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  async executeTool(toolName, input) {
    switch (toolName) {
      case "write_file": {
        const filePath = path.join(this.outputDir, input.filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, input.content, "utf-8");
        if (!this.generatedFiles.includes(input.filename)) {
          this.generatedFiles.push(input.filename);
        }
        return `Wrote ${input.filename} (${input.content.length} bytes)`;
      }

      case "read_file": {
        const filePath = path.join(this.outputDir, input.filename);
        try {
          return await fs.readFile(filePath, "utf-8");
        } catch {
          return "File not found";
        }
      }

      case "list_files": {
        return this.generatedFiles.join("\n") || "No files yet";
      }

      case "generation_complete": {
        return JSON.stringify({ status: "complete", files: input.files_created });
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  }

  async validateGenerated() {
    const issues = [];

    for (const filename of this.generatedFiles) {
      try {
        const content = await fs.readFile(path.join(this.outputDir, filename), "utf-8");

        if (filename.endsWith(".py")) {
          // Basic syntax check
          const parens = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;
          const brackets = (content.match(/\[/g) || []).length - (content.match(/\]/g) || []).length;
          const braces = (content.match(/\{/g) || []).length - (content.match(/\}/g) || []).length;

          if (parens !== 0) issues.push({ file: filename, message: "Unbalanced parentheses" });
          if (brackets !== 0) issues.push({ file: filename, message: "Unbalanced brackets" });
          if (braces !== 0) issues.push({ file: filename, message: "Unbalanced braces" });
        }
      } catch {
        issues.push({ file: filename, message: "File not readable" });
      }
    }

    return { valid: issues.length === 0, issues };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS - Focused on autonomous generation
// ═══════════════════════════════════════════════════════════════════════════

function buildAutonomousGenerationPrompt(context) {
  return `You are an expert MCP server developer. Generate a COMPLETE, PRODUCTION-READY FastMCP server.

## CRITICAL RULES
1. DO NOT ask questions - just make reasonable decisions
2. Generate REAL implementations, not stubs
3. Use the inferences provided to guide implementation
4. Include proper error handling
5. Add discovery endpoints
6. **IMPORTANT**: You MUST use the write_file tool to create each file. Do NOT just output code in text - use the tool!
7. After writing all files, call the generation_complete tool with a summary

## Domain
Name: ${context.domain.name || "Unnamed"}
Purpose: ${context.domain.problem?.statement || "General purpose MCP server"}

## Tools to Implement
${JSON.stringify(context.enrichedTools, null, 2)}

## Implementation Inferences (use these!)
${JSON.stringify(context.inferences, null, 2)}

## Files to Create
1. **mcp_server.py** - Main server with ALL tools fully implemented
2. **requirements.txt** - Python dependencies
3. **README.md** - Brief documentation

## Discovery Endpoints (REQUIRED)
- get_skill_info() - Returns server metadata
- list_capabilities() - Returns all tools with schemas
- get_tool_details(tool_name) - Returns specific tool info
- health_check() - Returns health status

## Implementation Guidelines
- Use mock data for external APIs (realistic but fake)
- Add logging with Python's logging module
- Use type hints everywhere
- Return structured dicts with "status" field
- Handle errors gracefully

Start generating. Use the write_file tool to create mcp_server.py first, then requirements.txt, then README.md.`;
}

function buildGenerationRequest(context) {
  const toolCount = context.enrichedTools?.length || 0;
  return `Generate a complete MCP server with ${toolCount} tools for "${context.domain.name}".

The tools are:
${(context.enrichedTools || []).map((t) => `- ${t.name}: ${t.description || t.purpose || "No description"}`).join("\n")}

IMPORTANT: Use the write_file tool to create each file. Do not output code as text - call write_file for each file.

Create these files using write_file:
1. mcp_server.py - The main server implementation
2. requirements.txt - Python dependencies
3. README.md - Brief documentation

Start now by calling write_file to create mcp_server.py.`;
}

function getGenerationTools() {
  return [
    {
      name: "write_file",
      description: "Write a file",
      input_schema: {
        type: "object",
        properties: {
          filename: { type: "string" },
          content: { type: "string" },
        },
        required: ["filename", "content"],
      },
    },
    {
      name: "read_file",
      description: "Read a file",
      input_schema: {
        type: "object",
        properties: {
          filename: { type: "string" },
        },
        required: ["filename"],
      },
    },
    {
      name: "list_files",
      description: "List generated files",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "generation_complete",
      description: "Signal completion",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          files_created: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "files_created"],
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE ANALYSIS (no questions)
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeDomainForMCP(domain) {
  const tools = domain.tools || [];
  const inferences = tools.map((t) => ({
    name: t.name,
    inference: inferToolImplementation(t),
    hasInputs: (t.inputs?.length || 0) > 0,
    hasOutput: !!t.output?.description,
    hasMocks: (t.mock?.examples?.length || 0) > 0,
  }));

  return {
    ready: tools.length > 0, // Always ready if there are tools
    toolsCount: tools.length,
    inferences,
    summary: {
      totalTools: tools.length,
      withInputs: inferences.filter((i) => i.hasInputs).length,
      withOutputs: inferences.filter((i) => i.hasOutput).length,
      withMocks: inferences.filter((i) => i.hasMocks).length,
    },
    // NO QUESTIONS - we infer everything
    questions: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  MCPDevelopmentSession,
  MCP_DEV_PHASES,
  analyzeDomainForMCP,
};
