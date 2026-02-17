import { Router } from "express";
import skillsStore from "../store/skills.js";
import { createAdapter } from "../services/llm/adapter.js";
import mcpManager from "../services/mcpConnector.js";

const router = Router();

// Run mock test for a tool
// Note: solutionId is passed in request body since mock routes are mounted at /api/mock
router.post("/:skillId/:toolId", async (req, res, next) => {
  try {
    const { skillId, toolId } = req.params;
    const { input, mode = "example", solution_id } = req.body;
    const log = req.app.locals.log;

    if (!solution_id) {
      return res.status(400).json({ error: "solution_id is required in body" });
    }

    log.debug(`Mock test: solution=${solution_id}, skill=${skillId}, tool=${toolId}, mode=${mode}`);

    // Load skill
    const skill = await skillsStore.load(solution_id, skillId);

    // Find tool
    const tool = skill.tools?.find(t => t.id === toolId || t.name === toolId);
    if (!tool) {
      return res.status(404).json({ error: "Tool not found" });
    }

    let output;

    // Check if this is an MCP bridge tool
    if (tool.source?.type === 'mcp_bridge') {
      log.debug(`MCP bridge tool detected: ${tool.name} -> ${tool.source.connection_id}`);
      output = await callMCPBridgeTool(tool, input, log);
    } else if (mode === "example") {
      // Example-based mock: find matching example
      output = findMatchingExample(tool, input);
    } else if (mode === "llm") {
      // LLM-simulated mock
      output = await simulateWithLLM(skill, tool, input);
    } else {
      return res.status(400).json({ error: "Invalid mode. Use 'example' or 'llm'" });
    }

    res.json({
      tool: tool.name,
      input,
      output,
      mode,
      matched: mode === "example" && output._matched
    });

  } catch (err) {
    if (err.message?.includes('not found') || err.code === "ENOENT") {
      return res.status(404).json({ error: "Skill not found" });
    }
    next(err);
  }
});

/**
 * Call an MCP bridge tool through the connected MCP server
 */
async function callMCPBridgeTool(tool, input, log) {
  const { connection_id, mcp_tool } = tool.source;

  // Check if MCP connection is active
  const status = mcpManager.getStatus(connection_id);

  if (!status.exists) {
    return {
      error: `MCP connection not found: ${connection_id}`,
      _bridge: true,
      _hint: 'Connect to the MCP server first via the Connectors tab'
    };
  }

  if (!status.connected) {
    return {
      error: `MCP connection not active: ${connection_id}`,
      _bridge: true,
      _hint: 'The MCP server has disconnected. Reconnect via the Connectors tab'
    };
  }

  try {
    log.debug(`Calling MCP tool: ${mcp_tool} on connection ${connection_id}`);
    const result = await mcpManager.callTool(connection_id, mcp_tool, input);
    return {
      ...result,
      _bridge: true,
      _source: `mcp://${connection_id}/${mcp_tool}`
    };
  } catch (err) {
    log.error(`MCP bridge call failed: ${err.message}`);
    return {
      error: err.message,
      _bridge: true,
      _source: `mcp://${connection_id}/${mcp_tool}`
    };
  }
}

/**
 * Find matching example from mock data
 */
function findMatchingExample(tool, input) {
  const examples = tool.mock?.examples || [];
  
  if (examples.length === 0) {
    return { error: "No mock examples defined", _matched: false };
  }
  
  // Try exact match first
  for (const example of examples) {
    if (deepEqual(example.input, input)) {
      return { ...example.output, _matched: true };
    }
  }
  
  // Try partial match (if input is subset of example input)
  for (const example of examples) {
    if (isSubset(input, example.input)) {
      return { ...example.output, _matched: "partial" };
    }
  }
  
  // Return first example as fallback
  return { 
    ...examples[0].output, 
    _matched: false,
    _note: "No exact match found, using first example"
  };
}

/**
 * Simulate tool output using LLM
 */
async function simulateWithLLM(skill, tool, input) {
  const provider = skill.settings?.llm_provider || process.env.LLM_PROVIDER || "openai";
  const adapter = createAdapter(provider);
  
  const prompt = `You are simulating a tool for testing purposes.

TOOL DEFINITION:
Name: ${tool.name}
Purpose: ${tool.purpose}
Inputs: ${JSON.stringify(tool.inputs, null, 2)}
Output schema: ${JSON.stringify(tool.output, null, 2)}

BEHAVIOR RULES:
${tool.mock?.rules?.join("\n") || "None specified"}

EXAMPLE OUTPUTS:
${JSON.stringify(tool.mock?.examples || [], null, 2)}

USER INPUT:
${JSON.stringify(input, null, 2)}

Generate a realistic output that:
1. Matches the output schema exactly
2. Follows all the rules
3. Is consistent with the examples
4. Uses plausible/realistic data

Return ONLY valid JSON output, no explanation.`;

  const response = await adapter.chat({
    systemPrompt: "You are a tool simulator. Respond only with valid JSON.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1024,
    temperature: 0.3
  });
  
  try {
    let content = response.content.trim();
    if (content.startsWith("```json")) content = content.slice(7);
    if (content.startsWith("```")) content = content.slice(3);
    if (content.endsWith("```")) content = content.slice(0, -3);
    return JSON.parse(content.trim());
  } catch {
    return { error: "Failed to parse LLM response", raw: response.content };
  }
}

/**
 * Deep equality check
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if 'subset' is a subset of 'superset'
 */
function isSubset(subset, superset) {
  if (typeof subset !== "object" || typeof superset !== "object") {
    return subset === superset;
  }
  
  for (const key of Object.keys(subset)) {
    if (!(key in superset)) return false;
    
    const subVal = subset[key];
    const superVal = superset[key];
    
    if (typeof subVal === "string" && typeof superVal === "string") {
      // Case-insensitive string match
      if (!superVal.toLowerCase().includes(subVal.toLowerCase())) {
        return false;
      }
    } else if (!deepEqual(subVal, superVal)) {
      return false;
    }
  }
  
  return true;
}

export default router;
