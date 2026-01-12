# Validation List UI Design

## Concept: "Validation Insights" Panel

A collapsible list showing validation warnings, suggestions, and blockers that appears when background validation detects issues after changes.

---

## UI Location Options

### Option 1: Below Progress Bar (Recommended)
```
┌─────────────────────────────────────────┐
│ My Skill                          [···] │
├─────────────────────────────────────────┤
│ [====75%================____]           │
│                                         │
│ ⚠ 2 items need attention         [▾]   │
│ ├─ 🟠 3 intents may need new examples   │
│ └─ 🔴 Tool "get_order" missing policy   │
├─────────────────────────────────────────┤
│ Overview │ Intents │ Tools │ Policy ... │
└─────────────────────────────────────────┘
```

### Option 2: Floating Panel (Bottom Right)
```
                              ┌──────────────────────┐
                              │ ⚠ Validation Issues  │
                              │ ──────────────────── │
                              │ 🟠 Review intents    │
                              │ 🔴 Missing policy    │
                              └──────────────────────┘
```

### Option 3: Inside Tab Content (Top)
```
┌─────────────────────────────────────────┐
│ Intents (5)                             │
├─────────────────────────────────────────┤
│ ⚠ 2 issues after recent changes   [▾]  │
│ ├─ 🟠 "Check order" may need update     │
│ └─ 🟠 Consider adding "track shipment"  │
├─────────────────────────────────────────┤
│ [Intent cards...]                       │
└─────────────────────────────────────────┘
```

---

## Color Coding System

| Color  | Icon | Meaning | Example |
|--------|------|---------|---------|
| 🔴 Red | ⛔ | Blocker - Must fix before export | "Tool referenced but not defined" |
| 🟠 Orange | ⚠️ | Warning - Should review | "Intent examples may be outdated" |
| 🟡 Yellow | 💡 | Suggestion - Nice to have | "Consider adding error handling" |
| 🔵 Blue | ℹ️ | Info - FYI | "New scenarios added" |

---

## List Item Structure

```
┌─────────────────────────────────────────────────────┐
│ 🟠 ⚠️ 3 intents may need updated examples          │
│    After adding "Express Shipping" scenario         │
│    [Review in Chat →]                               │
└─────────────────────────────────────────────────────┘
```

Components:
1. **Color indicator** (left border or background tint)
2. **Icon** (severity indicator)
3. **Title** (what needs attention)
4. **Context** (why this was triggered - what changed)
5. **Action button** (triggers chat conversation)

---

## Interaction Flow

### When User Clicks an Item:

1. Item is highlighted/selected
2. Chat panel receives a pre-filled contextual message:
   ```
   Please review the intents after I added the "Express Shipping"
   scenario. Specifically check if existing intents need updated
   examples or if new intents should be added.
   ```
3. User can edit or send directly
4. After AI responds, item can be marked as "reviewed" or dismissed

### Item States:
- **New** - Just detected, highlighted
- **Reviewing** - User clicked, waiting for AI response
- **Resolved** - AI confirmed OK or user made changes
- **Dismissed** - User chose to ignore

---

## Data Model

```javascript
// Validation issue structure
{
  id: "val_123",
  severity: "warning",  // "blocker" | "warning" | "suggestion" | "info"
  category: "intents",  // Which section this affects
  title: "3 intents may need updated examples",
  context: "After adding 'Express Shipping' scenario",
  trigger: {
    type: "scenario_added",
    id: "scenario_456",
    timestamp: "2024-01-15T10:30:00Z"
  },
  chatPrompt: "Please review intents after the new scenario...",
  status: "new",  // "new" | "reviewing" | "resolved" | "dismissed"
  relatedIds: ["intent_1", "intent_2", "intent_3"]
}
```

---

## Validation Rules (Initial Set)

### After Scenario Changes:
- Check if existing intents cover the scenario
- Suggest new intents if scenario describes unhandled cases
- Check if tools needed for scenario are defined

### After Intent Changes:
- Check if examples are consistent with problem statement
- Check if mapped workflows exist
- Check if required entities have tool support

### After Tool Changes:
- Check if tool is referenced by any workflow
- Check if policy covers the tool
- Check if input/output types are consistent

### After Policy Changes:
- Check if guardrails conflict with defined tools
- Check if escalation paths are complete
- Check if approval rules reference valid tools

---

## Component Mockup (React)

```jsx
function ValidationList({ issues, onReviewClick }) {
  const [expanded, setExpanded] = useState(true);

  if (issues.length === 0) return null;

  const blockers = issues.filter(i => i.severity === 'blocker');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <div className="validation-list">
      <div className="validation-header" onClick={() => setExpanded(!expanded)}>
        <span className="validation-icon">
          {blockers.length > 0 ? '⛔' : '⚠️'}
        </span>
        <span className="validation-summary">
          {issues.length} item{issues.length > 1 ? 's' : ''} need attention
        </span>
        <span className="expand-icon">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="validation-items">
          {issues.map(issue => (
            <ValidationItem
              key={issue.id}
              issue={issue}
              onClick={() => onReviewClick(issue)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ValidationItem({ issue, onClick }) {
  const colors = {
    blocker: { bg: '#fee2e2', border: '#ef4444', icon: '⛔' },
    warning: { bg: '#fef3c7', border: '#f59e0b', icon: '⚠️' },
    suggestion: { bg: '#fef9c3', border: '#eab308', icon: '💡' },
    info: { bg: '#dbeafe', border: '#3b82f6', icon: 'ℹ️' }
  };

  const style = colors[issue.severity];

  return (
    <div
      className="validation-item"
      style={{
        backgroundColor: style.bg,
        borderLeft: `3px solid ${style.border}`
      }}
      onClick={onClick}
    >
      <span className="item-icon">{style.icon}</span>
      <div className="item-content">
        <div className="item-title">{issue.title}</div>
        <div className="item-context">{issue.context}</div>
      </div>
      <span className="item-action">Review →</span>
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Basic Infrastructure
- Add validation state to domain model
- Create ValidationList component
- Wire up "Review" click to chat

### Phase 2: Validation Engine
- Implement validation rules
- Run validation after state changes
- Store results in domain

### Phase 3: Smart Context
- Generate contextual chat prompts
- Track issue lifecycle (new → reviewing → resolved)
- Auto-dismiss when changes resolve issues

### Phase 4: Polish
- Animations for new issues appearing
- Notification badge on tab when collapsed
- History of past validations

---

## Questions to Decide

1. **Location**: Below progress bar vs floating panel vs in-tab?
2. **Persistence**: Show resolved items with strikethrough or hide them?
3. **Grouping**: Group by severity or by category (intents/tools/policy)?
4. **Auto-dismiss**: Automatically clear when AI says "looks good"?
