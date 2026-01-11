/**
 * File Digestion Service
 * Extracts intents, scenarios, and example phrases from uploaded files
 */

import { createAdapter } from "./llm/adapter.js";

const FILE_DIGEST_PROMPT = `You are an expert at analyzing customer communication examples to extract structured data for building AI agent skills.

Analyze the provided file content and extract:

1. **Intents** - What are users trying to accomplish?
   - description: Clear statement of user's goal
   - examples: Real phrases from the file (2-3 per intent minimum)

2. **Scenarios** - Complete interaction patterns
   - title: Short descriptive name
   - description: What happens in this scenario
   - steps: Sequence of events
   - expected_outcome: What should happen at the end

Guidelines:
- Extract REAL examples from the file, don't make them up
- Group similar requests into the same intent
- Identify at least 2-3 distinct intents if possible
- Look for patterns in how users phrase requests
- Capture the terminology users actually use

Response Format (JSON only, no markdown):
{
  "summary": {
    "file_type": "email|chat|ticket|log|other",
    "total_examples_found": number,
    "intents_count": number,
    "scenarios_count": number
  },
  "intents": [
    {
      "description": "User wants to check order status",
      "examples": ["Where is my order?", "Can you track order #12345?"],
      "frequency": "high|medium|low"
    }
  ],
  "scenarios": [
    {
      "title": "Order Status Inquiry",
      "description": "Customer asks about their order and receives status update",
      "steps": ["Customer asks about order", "Agent looks up order", "Agent provides status"],
      "expected_outcome": "Customer knows their order status"
    }
  ]
}`;

/**
 * Digest file content using LLM to extract structured data
 */
export async function digestFileContent({ domain, fileContent, fileName, fileType }) {
  const provider = domain._settings?.llm_provider || process.env.LLM_PROVIDER || "anthropic";
  const adapter = createAdapter(provider, {
    apiKey: domain._settings?.api_key,
    model: domain._settings?.llm_model
  });

  // Build context
  const domainContext = domain.problem?.statement
    ? `This is for a "${domain.name}" skill. Problem: "${domain.problem.statement}"`
    : `This is for a new skill called "${domain.name}"`;

  // Format and truncate content
  const formattedContent = formatFileContent(fileContent, fileType);

  const messages = [
    {
      role: "user",
      content: `${domainContext}

I'm uploading "${fileName}" (type: ${fileType}) with examples to analyze.

FILE CONTENT:
---
${formattedContent}
---

Extract intents, scenarios, and example phrases from this content.`
    }
  ];

  const response = await adapter.chat({
    systemPrompt: FILE_DIGEST_PROMPT,
    messages,
    maxTokens: 4096,
    temperature: 0.3
  });

  // Parse response
  let extraction;
  try {
    let content = response.content.trim();
    // Handle markdown code blocks
    if (content.startsWith("```json")) content = content.slice(7);
    if (content.startsWith("```")) content = content.slice(3);
    if (content.endsWith("```")) content = content.slice(0, -3);

    extraction = JSON.parse(content.trim());
  } catch (err) {
    console.error("Failed to parse extraction:", err);
    extraction = {
      summary: { file_type: fileType, total_examples_found: 0, intents_count: 0, scenarios_count: 0 },
      intents: [],
      scenarios: [],
      error: "Failed to parse LLM response"
    };
  }

  return extraction;
}

/**
 * Format file content based on type, with truncation
 */
function formatFileContent(content, fileType) {
  const maxLength = 15000;

  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + "\n\n[... content truncated ...]";
  }

  switch (fileType) {
    case 'csv':
      const lines = content.split('\n');
      const header = lines[0] || '';
      return `CSV with columns: ${header}\n\n${content}`;

    case 'json':
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }

    case 'email':
      return `Email export (headers, subjects, body):\n\n${content}`;

    case 'log':
      return `Log file (timestamps, entries):\n\n${content}`;

    default:
      return content;
  }
}

/**
 * Get file type from filename
 */
export function getFileType(filename) {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  const typeMap = {
    '.txt': 'text',
    '.csv': 'csv',
    '.json': 'json',
    '.md': 'markdown',
    '.eml': 'email',
    '.log': 'log'
  };
  return typeMap[ext] || 'text';
}

export default { digestFileContent, getFileType };
