import { v4 as uuidv4 } from "uuid";

/**
 * Apply state updates to toolbox
 * Supports dot notation (e.g., "problem.statement") and array operations
 */
export function applyStateUpdate(toolbox, updates) {
  const newToolbox = JSON.parse(JSON.stringify(toolbox)); // Deep clone
  
  for (const [key, value] of Object.entries(updates)) {
    // Handle array push operations
    if (key.endsWith("_push")) {
      const arrayPath = key.slice(0, -5); // Remove "_push"
      const array = getNestedValue(newToolbox, arrayPath);
      if (Array.isArray(array)) {
        // Auto-generate ID if not provided
        if (typeof value === "object" && !value.id) {
          value.id = `${arrayPath.slice(0, -1)}_${uuidv4().slice(0, 8)}`;
        }
        array.push(value);
      }
      continue;
    }
    
    // Handle array index notation (e.g., "scenarios[0].title")
    const indexMatch = key.match(/^(.+)\[(\d+)\]\.(.+)$/);
    if (indexMatch) {
      const [, arrayPath, index, prop] = indexMatch;
      const array = getNestedValue(newToolbox, arrayPath);
      if (Array.isArray(array) && array[Number(index)]) {
        setNestedValue(array[Number(index)], prop, value);
      }
      continue;
    }
    
    // Handle simple dot notation
    setNestedValue(newToolbox, key, value);
  }
  
  return newToolbox;
}

/**
 * Get nested value using dot notation
 */
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  
  return current;
}

/**
 * Set nested value using dot notation
 */
function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }
  
  current[parts[parts.length - 1]] = value;
}

/**
 * Calculate toolbox completion percentage
 */
export function calculateProgress(toolbox) {
  const phases = {
    PROBLEM_DISCOVERY: 10,
    SCENARIO_EXPLORATION: 30,
    TOOLS_PROPOSAL: 45,
    TOOL_DEFINITION: 70,
    MOCK_TESTING: 90,
    READY_TO_EXPORT: 100,
    EXPORTED: 100
  };
  
  let progress = phases[toolbox.status] || 0;
  
  // Add granular progress within phases
  if (toolbox.status === "PROBLEM_DISCOVERY") {
    let items = 0;
    if (toolbox.problem?.statement) items++;
    if (toolbox.problem?.target_user) items++;
    if (toolbox.problem?.systems_involved?.length > 0) items++;
    if (toolbox.problem?.confirmed) items++;
    progress = Math.floor(items / 4 * 10);
  }
  
  if (toolbox.status === "SCENARIO_EXPLORATION") {
    const confirmed = toolbox.scenarios?.filter(s => s.status === "CONFIRMED").length || 0;
    progress = 10 + Math.floor(confirmed / 2 * 20);
  }
  
  if (toolbox.status === "TOOL_DEFINITION") {
    const total = toolbox.tools?.length || 1;
    const complete = toolbox.tools?.filter(t => t.status === "COMPLETE").length || 0;
    progress = 45 + Math.floor(complete / total * 25);
  }
  
  return Math.min(progress, 100);
}

/**
 * Validate toolbox state for phase transitions
 */
export function canTransitionTo(toolbox, targetPhase) {
  switch (targetPhase) {
    case "SCENARIO_EXPLORATION":
      return toolbox.problem?.confirmed === true;
    
    case "TOOLS_PROPOSAL":
      const confirmedScenarios = toolbox.scenarios?.filter(s => s.status === "CONFIRMED").length || 0;
      return confirmedScenarios >= 2;
    
    case "TOOL_DEFINITION":
      return toolbox.proposed_tools?.some(t => t.accepted);
    
    case "MOCK_TESTING":
      return toolbox.tools?.every(t => t.status === "COMPLETE");
    
    case "READY_TO_EXPORT":
      return toolbox.tools?.every(t => t.mock?.tested);
    
    default:
      return true;
  }
}

export default { applyStateUpdate, calculateProgress, canTransitionTo };
