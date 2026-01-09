import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const MEMORY_PATH = process.env.MEMORY_PATH || "/memory";
const PROJECTS_DIR = path.join(MEMORY_PATH, "projects");

// Ensure directories exist
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

// Initialize storage
async function init() {
  await ensureDir(PROJECTS_DIR);
}

// List all projects
async function list() {
  await init();
  try {
    const dirs = await fs.readdir(PROJECTS_DIR);
    const projects = [];
    
    for (const dir of dirs) {
      try {
        const projectPath = path.join(PROJECTS_DIR, dir, "project.json");
        const data = await fs.readFile(projectPath, "utf-8");
        const project = JSON.parse(data);
        
        // Get toolbox for summary
        const toolboxPath = path.join(PROJECTS_DIR, dir, "toolbox.json");
        let toolbox = null;
        try {
          const toolboxData = await fs.readFile(toolboxPath, "utf-8");
          toolbox = JSON.parse(toolboxData);
        } catch {}
        
        projects.push({
          id: project.id,
          name: project.name,
          created_at: project.created_at,
          updated_at: project.updated_at,
          status: toolbox?.status || "PROBLEM_DISCOVERY",
          toolCount: toolbox?.tools?.length || 0,
          version: toolbox?.version || 1
        });
      } catch (err) {
        // Skip invalid projects
      }
    }
    
    return projects.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  } catch (err) {
    return [];
  }
}

// Create new project
async function create(name, settings = {}) {
  await init();
  
  const id = `proj_${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();
  const projectDir = path.join(PROJECTS_DIR, id);
  
  await ensureDir(projectDir);
  await ensureDir(path.join(projectDir, "exports"));
  
  const project = {
    id,
    name,
    created_at: now,
    updated_at: now,
    settings: {
      llm_provider: settings.llm_provider || process.env.LLM_PROVIDER || "anthropic",
      llm_model: settings.llm_model || null
    }
  };
  
  const toolbox = {
    id,
    status: "PROBLEM_DISCOVERY",
    version: 1,
    problem: {
      statement: null,
      target_user: null,
      systems_involved: [],
      confirmed: false
    },
    scenarios: [],
    proposed_tools: [],
    tools: [],
    workflows: []
  };
  
  const conversation = {
    project_id: id,
    messages: []
  };
  
  await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(project, null, 2));
  await fs.writeFile(path.join(projectDir, "toolbox.json"), JSON.stringify(toolbox, null, 2));
  await fs.writeFile(path.join(projectDir, "conversation.json"), JSON.stringify(conversation, null, 2));
  
  return { project, toolbox, conversation };
}

// Load project
async function load(id) {
  const projectDir = path.join(PROJECTS_DIR, id);
  
  const [projectData, toolboxData, conversationData] = await Promise.all([
    fs.readFile(path.join(projectDir, "project.json"), "utf-8"),
    fs.readFile(path.join(projectDir, "toolbox.json"), "utf-8"),
    fs.readFile(path.join(projectDir, "conversation.json"), "utf-8")
  ]);
  
  return {
    project: JSON.parse(projectData),
    toolbox: JSON.parse(toolboxData),
    conversation: JSON.parse(conversationData)
  };
}

// Save toolbox
async function saveToolbox(id, toolbox) {
  const projectDir = path.join(PROJECTS_DIR, id);
  const projectPath = path.join(projectDir, "project.json");
  
  // Update project timestamp
  const projectData = await fs.readFile(projectPath, "utf-8");
  const project = JSON.parse(projectData);
  project.updated_at = new Date().toISOString();
  
  await Promise.all([
    fs.writeFile(path.join(projectDir, "toolbox.json"), JSON.stringify(toolbox, null, 2)),
    fs.writeFile(projectPath, JSON.stringify(project, null, 2))
  ]);
}

// Append message
async function appendMessage(id, message) {
  const projectDir = path.join(PROJECTS_DIR, id);
  const convPath = path.join(projectDir, "conversation.json");
  
  const data = await fs.readFile(convPath, "utf-8");
  const conversation = JSON.parse(data);
  
  conversation.messages.push({
    ...message,
    id: `msg_${uuidv4().slice(0, 8)}`,
    timestamp: new Date().toISOString()
  });
  
  await fs.writeFile(convPath, JSON.stringify(conversation, null, 2));
  return conversation;
}

// Update project settings
async function updateSettings(id, settings) {
  const projectDir = path.join(PROJECTS_DIR, id);
  const projectPath = path.join(projectDir, "project.json");
  
  const data = await fs.readFile(projectPath, "utf-8");
  const project = JSON.parse(data);
  
  project.settings = { ...project.settings, ...settings };
  project.updated_at = new Date().toISOString();
  
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2));
  return project;
}

// Delete project
async function remove(id) {
  const projectDir = path.join(PROJECTS_DIR, id);
  await fs.rm(projectDir, { recursive: true, force: true });
}

// Save export
async function saveExport(id, version, files) {
  const exportDir = path.join(PROJECTS_DIR, id, "exports", `v${version}`);
  await ensureDir(exportDir);
  
  for (const file of files) {
    await fs.writeFile(path.join(exportDir, file.name), file.content);
  }
  
  return exportDir;
}

// Get export
async function getExport(id, version) {
  const exportDir = path.join(PROJECTS_DIR, id, "exports", `v${version}`);
  const files = await fs.readdir(exportDir);
  
  const result = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(exportDir, file), "utf-8");
    result.push({ name: file, content });
  }
  
  return result;
}

export default {
  list,
  create,
  load,
  saveToolbox,
  appendMessage,
  updateSettings,
  remove,
  saveExport,
  getExport
};
