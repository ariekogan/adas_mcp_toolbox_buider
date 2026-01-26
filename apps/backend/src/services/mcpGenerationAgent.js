/**
 * MCP Generation Agent
 *
 * Uses Anthropic SDK with a custom agentic loop to generate
 * fully-implemented MCP servers with real tool implementations,
 * discovery endpoints, and complete domain definitions.
 *
 * Works in Docker environments without requiring Claude Code CLI.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// Maximum iterations for the agentic loop
const MAX_ITERATIONS = 15;

/**
 * Generate a complete MCP server for a domain using an agentic approach
 *
 * @param {Object} domain - The DraftDomain object
 * @param {Object} options - Generation options
 * @param {string} options.outputDir - Directory to write generated files
 * @param {function} options.onProgress - Progress callback (message) => void
 * @returns {AsyncGenerator<Object>} Stream of generation events
 */
export async function* generateMCPWithAgent(domain, options = {}) {
  const { outputDir, onProgress } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { type: "error", error: "ANTHROPIC_API_KEY not set" };
    return;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  // Define tools for the agent
  const tools = getAgentTools();

  // Build the system prompt and initial message
  const systemPrompt = buildSystemPrompt(domain);
  const userMessage = buildGenerationPrompt(domain, outputDir);

  // Initialize conversation
  let messages = [{ role: "user", content: userMessage }];
  let iteration = 0;
  const filesWritten = [];

  yield {
    type: "start",
    message: `Starting MCP generation for ${domain.name}`,
    toolsCount: domain.tools?.length || 0
  };

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (onProgress) {
        onProgress(`Iteration ${iteration}/${MAX_ITERATIONS}`);
      }

      yield {
        type: "iteration",
        iteration,
        maxIterations: MAX_ITERATIONS
      };

      // Call Claude
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages
      });

      // Process response content
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      // Check for tool use
      const toolUseBlocks = assistantContent.filter(b => b.type === "tool_use");

      if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
        // No more tool calls - generation complete
        const textContent = assistantContent
          .filter(b => b.type === "text")
          .map(b => b.text)
          .join("\n");

        yield {
          type: "complete",
          result: textContent,
          filesWritten,
          iterations: iteration
        };
        break;
      }

      // Execute tools
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        yield {
          type: "tool_use",
          tool: toolUse.name,
          input: summarizeInput(toolUse.input)
        };

        if (onProgress) {
          onProgress(`Using tool: ${toolUse.name}`);
        }

        try {
          const result = await executeAgentTool(toolUse.name, toolUse.input, {
            outputDir,
            filesWritten
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: typeof result === "string" ? result : JSON.stringify(result)
          });

          yield {
            type: "tool_result",
            tool: toolUse.name,
            success: true
          };

        } catch (toolErr) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${toolErr.message}`,
            is_error: true
          });

          yield {
            type: "tool_error",
            tool: toolUse.name,
            error: toolErr.message
          };
        }
      }

      // Add tool results to conversation
      messages.push({ role: "user", content: toolResults });
    }

    if (iteration >= MAX_ITERATIONS) {
      yield {
        type: "warning",
        message: "Reached maximum iterations",
        filesWritten,
        iterations: iteration
      };
    }

  } catch (error) {
    yield {
      type: "error",
      error: error.message,
      filesWritten,
      iterations: iteration
    };
  }
}

/**
 * Define tools available to the agent
 */
function getAgentTools() {
  return [
    {
      name: "write_file",
      description: "Write content to a file. Use this to create Python files, configuration files, etc.",
      input_schema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The filename to write (relative to output directory)"
          },
          content: {
            type: "string",
            description: "The content to write to the file"
          }
        },
        required: ["filename", "content"]
      }
    },
    {
      name: "read_file",
      description: "Read content from a file that was previously written.",
      input_schema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "The filename to read (relative to output directory)"
          }
        },
        required: ["filename"]
      }
    },
    {
      name: "list_files",
      description: "List all files in the output directory.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "validate_python",
      description: "Validate Python syntax by attempting to parse the code.",
      input_schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The Python code to validate"
          }
        },
        required: ["code"]
      }
    },
    {
      name: "search_documentation",
      description: "Search for API documentation or library usage patterns. Returns mock results - use for planning.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query (e.g., 'requests library POST json', 'fastmcp tool decorator')"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "generation_complete",
      description: "Signal that MCP generation is complete. Call this when all files have been written.",
      input_schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "A summary of what was generated"
          },
          files_created: {
            type: "array",
            items: { type: "string" },
            description: "List of files that were created"
          }
        },
        required: ["summary", "files_created"]
      }
    }
  ];
}

/**
 * Execute an agent tool
 */
async function executeAgentTool(toolName, input, context) {
  const { outputDir, filesWritten } = context;

  switch (toolName) {
    case "write_file": {
      const filePath = path.join(outputDir, input.filename);
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, input.content, "utf-8");
      filesWritten.push(input.filename);
      return `Successfully wrote ${input.filename} (${input.content.length} bytes)`;
    }

    case "read_file": {
      const filePath = path.join(outputDir, input.filename);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return content;
      } catch (err) {
        return `Error reading file: ${err.message}`;
      }
    }

    case "list_files": {
      try {
        const files = await listFilesRecursive(outputDir);
        return files.length > 0 ? files.join("\n") : "No files yet";
      } catch {
        return "Output directory is empty";
      }
    }

    case "validate_python": {
      // Basic Python syntax validation
      // In a real implementation, you might use a Python subprocess
      const code = input.code;
      const issues = [];

      // Check for common syntax issues
      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        issues.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
      }

      const openBrackets = (code.match(/\[/g) || []).length;
      const closeBrackets = (code.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        issues.push(`Mismatched brackets: ${openBrackets} open, ${closeBrackets} close`);
      }

      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
      }

      // Check for triple quotes balance
      const tripleDoubleQuotes = (code.match(/\"\"\"/g) || []).length;
      const tripleSingleQuotes = (code.match(/\'\'\'/g) || []).length;
      if (tripleDoubleQuotes % 2 !== 0) {
        issues.push("Unbalanced triple double quotes");
      }
      if (tripleSingleQuotes % 2 !== 0) {
        issues.push("Unbalanced triple single quotes");
      }

      if (issues.length === 0) {
        return "Python syntax appears valid (basic check passed)";
      } else {
        return `Potential issues found:\n${issues.join("\n")}`;
      }
    }

    case "search_documentation": {
      // Return helpful patterns based on query keywords
      const query = input.query.toLowerCase();

      if (query.includes("fastmcp") || query.includes("mcp")) {
        return `FastMCP documentation patterns:

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("server-name")

@mcp.tool()
def my_tool(param: str) -> dict:
    """Tool description for AI to understand when to use it."""
    return {"result": "value"}

# Run the server
if __name__ == "__main__":
    mcp.run()`;
      }

      if (query.includes("requests") || query.includes("http")) {
        return `Python requests library patterns:

import requests

# GET request
response = requests.get("https://api.example.com/data")
data = response.json()

# POST request with JSON
response = requests.post(
    "https://api.example.com/create",
    json={"key": "value"},
    headers={"Authorization": "Bearer token"}
)

# Error handling
try:
    response.raise_for_status()
except requests.exceptions.HTTPError as e:
    print(f"HTTP error: {e}")`;
      }

      if (query.includes("pydantic")) {
        return `Pydantic model patterns:

from pydantic import BaseModel, Field
from typing import Optional, List

class MyModel(BaseModel):
    name: str = Field(..., description="The name")
    count: int = Field(default=0)
    tags: Optional[List[str]] = None`;
      }

      return `No specific documentation found for: ${input.query}.
Use standard Python patterns and best practices.`;
    }

    case "generation_complete": {
      return JSON.stringify({
        status: "complete",
        summary: input.summary,
        files: input.files_created
      });
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

/**
 * List files recursively in a directory
 */
async function listFilesRecursive(dir, prefix = "") {
  const files = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const subFiles = await listFilesRecursive(
          path.join(dir, entry.name),
          relativePath
        );
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
  } catch {
    // Directory doesn't exist yet
  }
  return files;
}

/**
 * Build the system prompt for MCP generation
 */
function buildSystemPrompt(domain) {
  return `You are an expert MCP (Model Context Protocol) server developer. Your task is to generate a complete, production-ready MCP server based on domain specifications.

## Your Goal
Generate a fully functional FastMCP Python server with:
1. All tools implemented with REAL functionality (not stubs)
2. Discovery endpoints for skill introspection
3. Proper error handling and logging
4. Clean, maintainable code

## Domain Context
Name: ${domain.name || "Unnamed Domain"}
Purpose: ${domain.problem?.statement || "No statement provided"}
Version: ${domain.version || 1}

## MCP Server Requirements
Create these files:
1. mcp_server.py - Main server with all tools and discovery endpoints
2. requirements.txt - Python dependencies (mcp, fastmcp, requests, pydantic, etc.)
3. README.md - Setup and usage documentation

## Tool Implementation Guidelines
- Each tool must have a clear docstring explaining what it does
- Use type hints for all parameters and return values
- Include error handling with try/except blocks
- Return structured dictionaries with status and data fields
- For external API calls, use the requests library with proper error handling

## Discovery Endpoints to Include
- get_skill_info() - Returns skill metadata
- list_capabilities() - Returns all available tools with schemas
- get_tool_details(tool_name: str) - Returns detailed info about a specific tool
- health_check() - Returns server health status

## Process
1. First, analyze the tools needed
2. Write the main mcp_server.py with all implementations
3. Create requirements.txt with necessary dependencies
4. Create a brief README.md
5. Validate the Python code
6. Call generation_complete when done

Use the tools provided to write files, validate code, and signal completion.`;
}

/**
 * Build the generation prompt with full domain details
 */
function buildGenerationPrompt(domain, outputDir) {
  const tools = domain.tools || [];
  const metaTools = domain.meta_tools || [];

  let prompt = `Generate a complete MCP server for this domain.

## Output Directory
${outputDir}

## Tools to Implement (${tools.length} tools)
`;

  for (const tool of tools) {
    prompt += `
### ${tool.name}
- **Purpose**: ${tool.purpose || tool.description || "Not specified"}
- **Inputs**: ${JSON.stringify(tool.inputs || [], null, 2)}
- **Output**: ${JSON.stringify(tool.output || {}, null, 2)}
- **Category**: ${tool.category || "general"}`;

    if (tool.mock?.examples?.[0]) {
      prompt += `
- **Example**:
  Input: ${JSON.stringify(tool.mock.examples[0].input)}
  Output: ${JSON.stringify(tool.mock.examples[0].output)}`;
    }
    prompt += "\n";
  }

  if (metaTools.length > 0) {
    prompt += `\n## Meta-Tools (${metaTools.length} compositions)\n`;
    for (const mt of metaTools) {
      prompt += `
### ${mt.name}
- **Description**: ${mt.description || "Not specified"}
- **Composes**: ${(mt.composes || []).join(", ")}
`;
    }
  }

  prompt += `
## Instructions
1. Create mcp_server.py with ALL tools fully implemented
2. Add the discovery endpoints (get_skill_info, list_capabilities, get_tool_details, health_check)
3. Create requirements.txt
4. Create README.md
5. Validate your Python code
6. Call generation_complete when finished

Start by writing the main mcp_server.py file.`;

  return prompt;
}

/**
 * Summarize tool input for logging (avoid huge content in logs)
 */
function summarizeInput(input) {
  const summary = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.length > 100) {
      summary[key] = `${value.substring(0, 100)}... (${value.length} chars)`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/**
 * Simple non-agent MCP generation (fallback)
 */
export async function generateMCPSimple(domain, options = {}) {
  const { generateMCPServer, generateRequirements, generateDockerfile, generateReadme } =
    await import("./export.js");

  return {
    "mcp_server.py": generateMCPServer(domain),
    "requirements.txt": generateRequirements(),
    "Dockerfile": generateDockerfile(),
    "README.md": generateReadme(domain)
  };
}

/**
 * Check if the Anthropic SDK is available
 */
export async function isAgentSDKAvailable() {
  try {
    await import("@anthropic-ai/sdk");
    return !!process.env.ANTHROPIC_API_KEY;
  } catch {
    return false;
  }
}

export default {
  generateMCPWithAgent,
  generateMCPSimple,
  isAgentSDKAvailable
};
