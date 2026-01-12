# DAL-1.2: Cascading Validation System

## Overview
Implement a background validation system that automatically checks related settings when something changes in the skill builder, displaying issues in a collapsible list UI.

## Status: IMPLEMENTED (Phase 1)

## User Story
As a skill builder user, when I make changes to scenarios, intents, tools, or policies, I want the system to automatically identify potential issues in related sections so I can address them before they become problems.

## Design Decision
**Option C: Background Validation with Visual Indicators**
- Validation runs automatically after changes
- Results shown in collapsible list below progress bar
- Click item → sends contextual message to chat for AI review

## UI Design

### Location
Below progress bar, above tabs - always visible when issues exist.

### Visual Structure
```
┌─────────────────────────────────────────┐
│ [====75%================____]           │
│                                         │
│ ⚠ 3 items need attention         [▾]   │
│ ├─ ⛔ Tool "get_order" missing policy   │
│ ├─ ⚠️ 3 intents may need examples       │
│ └─ 💡 Consider error handling           │
├─────────────────────────────────────────┤
│ Overview │ Intents │ Tools │ Policy     │
└─────────────────────────────────────────┘
```

### Color Coding
| Severity | Color | Icon | Use Case |
|----------|-------|------|----------|
| blocker | Red (#ef4444) | ⛔ | Must fix before export |
| warning | Orange (#f59e0b) | ⚠️ | Should review |
| suggestion | Yellow (#eab308) | 💡 | Nice to have |
| info | Blue (#3b82f6) | ℹ️ | FYI notification |

## Data Model

### ValidationIssue
```javascript
{
  id: string,           // Unique ID: "val_" + uuid
  severity: string,     // "blocker" | "warning" | "suggestion" | "info"
  category: string,     // "intents" | "tools" | "policy" | "engine" | "scenarios"
  title: string,        // Short description
  context: string,      // What triggered this (e.g., "After adding X")
  chatPrompt: string,   // Message to send to chat when clicked
  status: string,       // "new" | "reviewing" | "resolved" | "dismissed"
  triggeredBy: {        // What change caused this validation
    type: string,       // "scenario_added" | "intent_changed" | etc.
    id: string,         // ID of changed item
    timestamp: string   // ISO timestamp
  },
  relatedIds: string[], // IDs of affected items
  createdAt: string,    // ISO timestamp
  resolvedAt: string    // ISO timestamp (if resolved)
}
```

### Domain State Addition
```javascript
// Add to domainSlice.js
validationIssues: [],
lastValidationRun: null
```

## Validation Rules

### Phase 1 - Basic Rules

#### After Scenario Changes
1. **Check intent coverage**
   - Severity: warning
   - Prompt: "Please review if existing intents cover the new scenario '{name}'. Do any intents need updated examples?"

2. **Check tool availability**
   - Severity: warning
   - Prompt: "The scenario '{name}' may require tools. Please check if all needed tools are defined."

#### After Intent Changes
1. **Check workflow mapping**
   - Severity: warning
   - Prompt: "Intent '{name}' was modified. Please verify the mapped workflow is still appropriate."

#### After Tool Changes
1. **Check policy coverage**
   - Severity: blocker
   - Prompt: "Tool '{name}' is not covered by any policy rule. Please add appropriate guardrails."

2. **Check workflow references**
   - Severity: warning
   - Prompt: "Tool '{name}' was added. Should it be included in any existing workflows?"

#### After Policy Changes
1. **Check tool references**
   - Severity: blocker
   - Prompt: "Policy references tool '{name}' which doesn't exist. Please add the tool or update the policy."

## Implementation Plan

### Files to Create/Modify

#### New Files
- `apps/frontend/src/components/ValidationList.jsx` - Main UI component
- `apps/frontend/src/components/ValidationItem.jsx` - Individual item component
- `apps/frontend/src/services/validationEngine.js` - Validation logic
- `apps/frontend/src/store/validationSlice.js` - Redux state management

#### Modified Files
- `apps/frontend/src/store/domainSlice.js` - Add validation state
- `apps/frontend/src/components/SkillPanel.jsx` - Include ValidationList
- `apps/frontend/src/store/index.js` - Add validation reducer

### Implementation Steps

#### Step 1: State Management (DONE)
- [x] Create useValidation.js hook with actions: addIssue, removeIssue, updateStatus, clearAll
- [x] Add change detection logic
- [x] Add selectors for filtering by severity/category

#### Step 2: UI Components (DONE)
- [x] Create ValidationList.jsx (collapsible container)
- [x] Create ValidationItem.jsx (individual issue row)
- [x] Add CSS styles matching mockup
- [x] Wire up click handler to send chat message

#### Step 3: Validation Engine (DONE)
- [x] Create validationEngine.js with rule definitions
- [x] Implement runValidation(changeType, changedItem, currentState)
- [x] Return array of ValidationIssue objects

#### Step 4: Integration (DONE)
- [x] Add ValidationList to SkillPanel below progress bar
- [x] Hook validation engine to domain state changes
- [x] Add useEffect to run validation on relevant changes

#### Step 5: Chat Integration (DONE)
- [x] On item click, call onAskAbout with chatPrompt
- [x] Update issue status to "reviewing"
- [ ] Auto-resolve when AI confirms (future enhancement - Phase 2)

## Testing Checklist
- [ ] List appears when issues exist
- [ ] List hides when no issues
- [ ] Collapse/expand works
- [ ] Click sends message to chat
- [ ] Color coding matches severity
- [ ] New items have pulse animation
- [ ] Resolved items show strikethrough
- [ ] Tab badges show counts

## Mockup Reference
See: `docs/wip/validation-list-mockup.html`

## Related
- DAL-1.1: Tools ↔ Policy Bidirectionality (completed)
- Help Documentation System (completed)
