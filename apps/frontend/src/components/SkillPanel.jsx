/**
 * SkillPanel - Main panel for Skill display
 *
 * Unified panel that shows all skill sections:
 * - Problem & Scenarios
 * - Intents
 * - Tools
 * - Policy
 * - Engine
 * - Validation status
 */

import { useState, useEffect } from 'react';
import TestToolModal from './TestToolModal';
import IntentsPanel from './IntentsPanel';
import PolicyPanel from './PolicyPanel';
import EnginePanel from './EnginePanel';
import IdentityPanel from './IdentityPanel';
import SkillConnectorsPanel from './SkillConnectorsPanel';
import TriggersPanel from './TriggersPanel';
import ValidationBanner from './ValidationBanner';
import ValidationList from './ValidationList';
import ValidationMicroDashboard from './ValidationMicroDashboard';
import { useValidation } from '../hooks/useValidation';
import { validateToolsConsistency, validatePolicyConsistency, validateIntentsConsistency, validateIdentityConsistency, validateAll } from '../api/client';

const styles = {
  container: {
    flex: '1 1 40%',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-secondary)'
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-secondary)'
  },
  version: {
    fontSize: '12px',
    background: 'var(--bg-tertiary)',
    padding: '4px 8px',
    borderRadius: '4px',
    color: 'var(--text-muted)'
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',  // Firefox
    msOverflowStyle: 'none'  // IE/Edge
  },
  tab: {
    padding: '10px 12px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  tabActive: {
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)'
  },
  tabBadge: {
    fontSize: '9px',
    padding: '1px 5px',
    borderRadius: '8px',
    fontWeight: '600'
  },
  badgeGreen: {
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e'
  },
  badgeYellow: {
    background: 'rgba(234, 179, 8, 0.2)',
    color: '#eab308'
  },
  badgeRed: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444'
  },
  badgeGray: {
    background: 'rgba(107, 114, 128, 0.2)',
    color: '#6b7280'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px'
  },
  progress: {
    marginBottom: '16px'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    marginBottom: '6px',
    color: 'var(--text-muted)'
  },
  progressBar: {
    height: '6px',
    background: 'var(--bg-card)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    transition: 'width 0.3s ease'
  },
  section: {
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '8px 0'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  expandIcon: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    transition: 'transform 0.2s'
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid transparent'
  },
  cardFocused: {
    borderColor: 'var(--accent)'
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  status: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: 'auto'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic'
  },
  problem: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px'
  },
  problemField: {
    marginBottom: '12px'
  },
  problemFieldLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  problemFieldValue: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.5'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px'
  },
  tag: {
    fontSize: '11px',
    padding: '3px 8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)'
  },
  toolDetails: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    fontSize: '12px'
  },
  inputItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    fontSize: '12px'
  },
  inputName: {
    fontFamily: 'monospace',
    color: 'var(--accent)',
    fontWeight: '500'
  },
  inputType: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '3px',
    color: 'var(--text-muted)'
  },
  inputRequired: {
    fontSize: '10px',
    color: '#ef4444'
  },
  mockLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  mockExample: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-primary)',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '11px',
    overflow: 'auto'
  },
  testBtn: {
    padding: '6px 12px',
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '8px'
  },
  actions: {
    padding: '16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: '8px'
  },
  exportBtn: {
    flex: 1,
    padding: '10px 16px',
    background: 'var(--success)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  exportBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  policyBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '3px',
    marginLeft: '4px'
  },
  // Info button for explaining properties - Option C: Accent Border Pill
  infoBtn: {
    padding: '3px 10px',
    background: 'transparent',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    borderRadius: '999px',
    color: '#60a5fa',
    cursor: 'pointer',
    fontSize: '10px',
    transition: 'all 0.15s ease',
    flexShrink: 0
  },
  infoBtnHover: {
    background: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#60a5fa'
  },
  // Validate button - similar style but different color
  validateBtn: {
    padding: '3px 8px',
    background: 'transparent',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    borderRadius: '999px',
    color: '#a78bfa',
    cursor: 'pointer',
    fontSize: '10px',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    marginLeft: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px'
  },
  validateBtnHover: {
    background: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#a78bfa'
  },
  validateBtnLoading: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  sectionHeaderButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  sectionHeaderWithInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  fieldLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  }
};

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'intents', label: 'Intents' },
  { id: 'tools', label: 'Tools' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'policy', label: 'Policy' },
  { id: 'engine', label: 'Engine' },
  { id: 'triggers', label: 'Triggers' }
];

// Phase progress mapping (8 phases)
const PHASE_PROGRESS = {
  PROBLEM_DISCOVERY: 10,
  SCENARIO_EXPLORATION: 20,
  INTENT_DEFINITION: 35,
  TOOLS_PROPOSAL: 50,
  TOOL_DEFINITION: 65,
  POLICY_DEFINITION: 80,
  MOCK_TESTING: 90,
  READY_TO_EXPORT: 100,
  EXPORTED: 100
};

function getMockStatusColor(status) {
  const colors = {
    untested: { bg: '#6b728020', color: '#9ca3af' },
    tested: { bg: '#10b98120', color: '#34d399' },
    skipped: { bg: '#f59e0b20', color: '#fbbf24' }
  };
  return colors[status] || colors.untested;
}

/**
 * Get badge style based on ratio and thresholds
 * @param {number} current - current count
 * @param {number} total - total/target count
 * @param {number} minRequired - minimum required for "ok" (yellow)
 */
function getBadgeStyle(current, total, minRequired = 1) {
  if (total === 0) return styles.badgeGray;
  const ratio = current / total;
  if (ratio >= 1) return styles.badgeGreen;      // 100% = green
  if (current >= minRequired) return styles.badgeYellow;  // meets minimum = yellow
  return styles.badgeRed;                         // below minimum = red
}

/**
 * Get tab health badge info based on skill data
 * Returns { text, style } for the badge with actual counts
 */
function getTabBadge(tabId, skill) {
  if (!skill) return null;

  switch (tabId) {
    case 'identity': {
      // Identity: problem (1), scenarios (need 1+), role (1)
      let count = 0;
      const total = 3;
      if (skill.problem?.statement?.length >= 10) count++;
      if (skill.scenarios?.length >= 1) count++;
      if (skill.role?.name && skill.role?.persona) count++;
      return {
        text: `${count}/${total}`,
        style: getBadgeStyle(count, total, 2) // need at least 2/3 for yellow
      };
    }
    case 'intents': {
      // Intents: count of supported intents with examples
      const intents = skill.intents?.supported || [];
      const withExamples = intents.filter(i => i.examples?.length > 0).length;
      const total = Math.max(intents.length, 1); // at least show /1 if empty
      if (intents.length === 0) {
        return { text: '0', style: styles.badgeGray };
      }
      return {
        text: `${withExamples}/${intents.length}`,
        style: getBadgeStyle(withExamples, intents.length, 1)
      };
    }
    case 'tools': {
      // Tools: count of fully defined tools + tested mocks
      const tools = skill.tools || [];
      if (tools.length === 0) {
        return { text: '0', style: styles.badgeGray };
      }
      const defined = tools.filter(t => t.name && t.description && t.output?.description).length;
      const tested = tools.filter(t => t.mock_status === 'tested' || t.mock_status === 'skipped').length;
      // Show defined/total, color based on testing status too
      const score = defined + tested;
      const maxScore = tools.length * 2; // full definition + tested
      return {
        text: `${defined}/${tools.length}`,
        style: getBadgeStyle(score, maxScore, tools.length) // need all defined for yellow
      };
    }
    case 'policy': {
      // Policy: count guardrails (never + always)
      const never = skill.policy?.guardrails?.never?.length || 0;
      const always = skill.policy?.guardrails?.always?.length || 0;
      const total = never + always;
      if (total === 0) {
        return { text: '0', style: styles.badgeGray };
      }
      // Consider 2+ guardrails as "complete"
      return {
        text: `${total}`,
        style: getBadgeStyle(total, 2, 1) // 2+ = green, 1 = yellow, 0 = gray
      };
    }
    case 'engine': {
      // Engine: check if custom settings exist
      const hasCustom = skill.engine && (
        skill.engine.model ||
        skill.engine.temperature !== undefined ||
        skill.engine.max_tokens
      );
      return {
        text: hasCustom ? '✓' : 'default',
        style: styles.badgeGreen // Engine always ok (has defaults)
      };
    }
    case 'triggers': {
      // Triggers: count of enabled triggers
      const triggers = skill.triggers || [];
      if (triggers.length === 0) {
        return { text: '0', style: styles.badgeGray };
      }
      const enabled = triggers.filter(t => t.enabled).length;
      return {
        text: `${enabled}/${triggers.length}`,
        style: enabled > 0 ? styles.badgeGreen : styles.badgeYellow
      };
    }
    default:
      return null;
  }
}

// Info button component - Option C: Accent Border Pill with "explain" text
function InfoButton({ topic, onAskAbout }) {
  const [hovered, setHovered] = useState(false);

  if (!onAskAbout) return null;

  return (
    <button
      style={{
        ...styles.infoBtn,
        ...(hovered ? styles.infoBtnHover : {})
      }}
      onClick={(e) => {
        e.stopPropagation();
        onAskAbout(topic);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Explain ${topic}`}
    >
      explain
    </button>
  );
}

// Validate button component - triggers LLM validation for a section
function ValidateButton({ section, skillId, onValidationResults, disabled }) {
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultCount, setResultCount] = useState(null);

  if (!skillId) return null;

  const handleValidate = async (e) => {
    e.stopPropagation();
    if (loading || disabled) return;

    setLoading(true);
    setResultCount(null);
    try {
      let result;
      if (section === 'tools') {
        result = await validateToolsConsistency(skillId);
        console.log('Tools validation result:', result);
      } else if (section === 'policy') {
        result = await validatePolicyConsistency(skillId);
        console.log('Policy validation result:', result);
      } else if (section === 'intents') {
        result = await validateIntentsConsistency(skillId);
        console.log('Intents validation result:', result);
      } else if (section === 'identity') {
        result = await validateIdentityConsistency(skillId);
        console.log('Identity validation result:', result);
      }

      if (result) {
        const count = result.issues?.length || 0;
        setResultCount(count);
        console.log(`Validation found ${count} issues`);

        if (onValidationResults) {
          console.log('Calling onValidationResults with:', section, result);
          onValidationResults(section, result);
        }

        // Clear result count after 3 seconds
        setTimeout(() => setResultCount(null), 3000);
      }
    } catch (err) {
      console.error(`Validation failed for ${section}:`, err);
      setResultCount(-1); // Error state
      setTimeout(() => setResultCount(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <button
        style={{
          ...styles.validateBtn,
          ...(hovered && !loading ? styles.validateBtnHover : {}),
          ...(loading ? styles.validateBtnLoading : {})
        }}
        onClick={handleValidate}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`Validate ${section}`}
        disabled={loading || disabled}
      >
        {loading ? (
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
        ) : '✓'}
      </button>
      {/* Status text shown next to button */}
      {loading && (
        <span style={{ fontSize: '10px', color: '#a78bfa', fontStyle: 'italic' }}>
          Validating...
        </span>
      )}
      {resultCount !== null && !loading && (
        <span style={{
          fontSize: '10px',
          color: resultCount === 0 ? '#10b981' : resultCount > 0 ? '#f59e0b' : '#ef4444',
          fontWeight: '500'
        }}>
          {resultCount === 0 ? '✓ OK' : resultCount > 0 ? `${resultCount} issues` : 'Error'}
        </span>
      )}
    </div>
  );
}

export default function SkillPanel({
  skill,
  focus,
  onFocusChange,
  onExport,
  onAskAbout,
  onIssuesChange,
  onSkillUpdate,
  skillId
}) {
  const [activeTab, setActiveTab] = useState('identity');
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [validatingAll, setValidatingAll] = useState(false);
  const [expanded, setExpanded] = useState({
    problem: true,
    role: false,
    scenarios: true,
    tools: true
  });
  const [expandedItems, setExpandedItems] = useState({});
  const [testingTool, setTestingTool] = useState(null);
  const [focusedTool, setFocusedTool] = useState(null); // Full-screen tool view

  // Cascading validation - pass onIssuesChange for persistence
  const {
    issues,
    activeIssues,
    addIssue,
    dismissIssue,
    markReviewing,
    clearResolved,
    clearByTriggerType
  } = useValidation(skill, onIssuesChange);

  // Handle validation item review click - sends to chat
  const handleValidationReview = (issue) => {
    markReviewing(issue.id);
    if (onAskAbout && issue.chatPrompt) {
      // Send the contextual prompt to chat
      onAskAbout(issue.chatPrompt, true); // true = raw prompt, don't wrap
    }
  };

  // Handle manual validation results from ValidateButton
  const handleValidationResults = (section, result) => {
    // Clear previous manual validation issues for this section before adding new ones
    clearByTriggerType('manual_validation');

    if (result.issues && result.issues.length > 0) {
      // Deduplicate issues by type + related items combination
      // Policy uses "items", tools uses "tools"
      const uniqueIssues = [];
      const seenKeys = new Set();

      result.issues.forEach(issue => {
        const relatedItems = issue.tools || issue.items || [];
        const key = `${issue.type}:${relatedItems.sort().join(',')}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueIssues.push(issue);
        }
      });

      console.log(`Adding ${uniqueIssues.length} unique issues (from ${result.issues.length} total)`);

      uniqueIssues.forEach((issue, idx) => {
        const relatedItems = issue.tools || issue.items || [];
        addIssue({
          id: `manual_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
          severity: issue.severity === 'blocker' ? 'blocker' :
                    issue.severity === 'warning' ? 'warning' : 'suggestion',
          category: section,
          title: `${issue.type}: ${relatedItems.join(', ') || 'check'}`,
          context: issue.description,
          chatPrompt: `There's a ${section} consistency issue: ${issue.description}. ${issue.suggestion}. Please review and fix this.`,
          triggeredBy: {
            type: 'manual_validation',
            section,
            timestamp: new Date().toISOString()
          },
          relatedIds: relatedItems
        });
      });

      // Send summary to chat
      if (onAskAbout && uniqueIssues.length > 0) {
        const summary = uniqueIssues.map(i => {
          const items = i.tools || i.items || [];
          return `• **${i.type}**: ${items.join(', ') || 'general'} - ${i.description}`;
        }).join('\n');

        onAskAbout(
          `I ran a ${section} consistency check and found ${uniqueIssues.length} issue(s):\n\n${summary}\n\nPlease help me fix these issues. You can see them in the validation panel on the right.`,
          true
        );
      }
    } else {
      // No issues - send positive message to chat
      if (onAskAbout) {
        onAskAbout(`I ran a ${section} consistency check - no issues found! ✓`, true);
      }
    }
  };

  // Handle "Validate All" - runs all consistency checks
  const handleValidateAll = async () => {
    if (!skill?.id || validatingAll) return;

    setValidatingAll(true);
    try {
      const results = await validateAll(skill.id);

      // Clear previous manual validation issues
      clearByTriggerType('manual_validation');

      // Collect all issues from all sections
      const allIssues = [];
      const sections = ['identity', 'intents', 'tools', 'policy'];

      sections.forEach(section => {
        const sectionResult = results[section];
        if (sectionResult?.issues?.length > 0) {
          sectionResult.issues.forEach(issue => {
            allIssues.push({ ...issue, section });
          });
        }
      });

      // Add issues to validation panel
      if (allIssues.length > 0) {
        allIssues.forEach((issue, idx) => {
          const relatedItems = issue.tools || issue.items || [];
          addIssue({
            id: `validate_all_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
            severity: issue.severity === 'blocker' ? 'blocker' :
                      issue.severity === 'warning' ? 'warning' : 'suggestion',
            category: issue.section,
            title: `${issue.type}: ${relatedItems.join(', ') || 'check'}`,
            context: issue.description,
            chatPrompt: `There's a ${issue.section} consistency issue: ${issue.description}. ${issue.suggestion}. Please review and fix this.`,
            triggeredBy: {
              type: 'manual_validation',
              section: issue.section,
              timestamp: new Date().toISOString()
            },
            relatedIds: relatedItems
          });
        });

        // Send summary to chat
        if (onAskAbout) {
          const summary = allIssues.slice(0, 5).map(i => {
            const items = i.tools || i.items || [];
            return `• **${i.section}/${i.type}**: ${items.join(', ') || 'general'}`;
          }).join('\n');

          const moreText = allIssues.length > 5 ? `\n...and ${allIssues.length - 5} more` : '';

          onAskAbout(
            `I ran all consistency checks and found ${allIssues.length} issue(s):\n\n${summary}${moreText}\n\nSee the validation panel for details.`,
            true
          );
        }
      } else {
        // All checks passed
        if (onAskAbout) {
          onAskAbout(`All consistency checks passed! ✓ Identity, Intents, Tools, and Policy are all consistent.`, true);
        }
      }
    } catch (error) {
      console.error('Validate all failed:', error);
      if (onAskAbout) {
        onAskAbout(`Validation check failed: ${error.message}`, true);
      }
    } finally {
      setValidatingAll(false);
    }
  };

  // Handle focus changes to switch tabs and expand sections
  useEffect(() => {
    if (focus?.tab) {
      setActiveTab(focus.tab);
      // Expand the section if specified
      if (focus.section) {
        setExpanded(prev => ({ ...prev, [focus.section]: true }));
      }
    }
  }, [focus]);

  const toggleSection = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleItem = (type, id) => {
    const key = `${type}_${id}`;
    const isCurrentlyExpanded = expandedItems[key];
    if (isCurrentlyExpanded) {
      // Collapsing - just toggle this one
      setExpandedItems(prev => ({ ...prev, [key]: false }));
    } else {
      // Expanding - collapse all others of same type first, then expand this one
      setExpandedItems(prev => {
        const newState = {};
        // Keep non-matching types, collapse matching types
        Object.keys(prev).forEach(k => {
          if (k.startsWith(`${type}_`)) {
            newState[k] = false;
          } else {
            newState[k] = prev[k];
          }
        });
        newState[key] = true;
        return newState;
      });
    }
  };

  const isItemExpanded = (type, id) => expandedItems[`${type}_${id}`];

  // Check if any tool is expanded (for full-area view)
  const getExpandedToolId = () => {
    for (const key of Object.keys(expandedItems)) {
      if (key.startsWith('tool_') && expandedItems[key]) {
        return key.replace('tool_', '');
      }
    }
    return null;
  };

  if (!skill) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Skill Builder</span>
        </div>
        <div style={styles.content}>
          <div style={styles.empty}>Select or create a skill to get started.</div>
        </div>
      </div>
    );
  }

  const progress = PHASE_PROGRESS[skill.phase] || 0;
  const canExport = skill.validation?.ready_to_export === true;

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport?.();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Skill: {skill.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ValidationMicroDashboard
            validation={skill.validation}
            onClick={() => setShowValidationPanel(true)}
            onValidateAll={handleValidateAll}
            validatingAll={validatingAll}
          />
          <span style={styles.version}>v{skill.version || '0.1.0'}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {TABS.map(tab => {
          const badge = getTabBadge(tab.id, skill);
          return (
            <div
              key={tab.id}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {})
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {badge && (
                <span style={{ ...styles.tabBadge, ...badge.style }}>
                  {badge.text}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.content}>
        {/* Identity Tab - Problem, Role, Scenarios */}
        {activeTab === 'identity' && (
          <>
            {/* Progress bar at top of identity */}
            <div style={styles.progress}>
              <div style={styles.progressLabel}>
                <span>{skill.phase?.replace(/_/g, ' ')}</span>
                <span>{progress}%</span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progress}%` }} />
              </div>
            </div>

            <IdentityPanel
              skill={skill}
              onAskAbout={onAskAbout}
              connectorConfigs={skill.connector_configs || []}
              onConnectorConfigChange={async (newConfigs) => {
                try {
                  const { updateSkill: updateSkillApi } = await import('../api/client');
                  const updatedSkill = await updateSkillApi(skill.id, {
                    connector_configs: newConfigs
                  });
                  if (onSkillUpdate && updatedSkill) {
                    onSkillUpdate(updatedSkill);
                  }
                } catch (err) {
                  console.error('Failed to update connector config:', err);
                }
              }}
              skillIdentity={skill.skill_identity || null}
              onSkillIdentityChange={async (newIdentity) => {
                try {
                  const { updateSkill: updateSkillApi } = await import('../api/client');
                  const updatedSkill = await updateSkillApi(skill.id, {
                    skill_identity: newIdentity
                  });
                  if (onSkillUpdate && updatedSkill) {
                    onSkillUpdate(updatedSkill);
                  }
                } catch (err) {
                  console.error('Failed to update skill identity:', err);
                }
              }}
              validateButton={
                <ValidateButton
                  section="identity"
                  skillId={skill?.id}
                  onValidationResults={handleValidationResults}
                  disabled={!skill.problem?.statement}
                />
              }
            />
          </>
        )}

        {/* Intents Tab */}
        {activeTab === 'intents' && (
          <IntentsPanel
            intents={skill.intents}
            focus={focus}
            onFocusChange={onFocusChange}
            onAskAbout={onAskAbout}
            validateButton={
              <ValidateButton
                section="intents"
                skillId={skill?.id}
                onValidationResults={handleValidationResults}
                disabled={(skill.intents?.supported?.length || 0) < 2}
              />
            }
          />
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div style={{ ...styles.section, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Full-screen focused tool view */}
            {focusedTool ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header with close button */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      {focusedTool.name}
                    </h3>
                    <span style={{
                      ...styles.status,
                      background: getMockStatusColor(focusedTool.mock_status).bg,
                      color: getMockStatusColor(focusedTool.mock_status).color
                    }}>
                      {focusedTool.mock_status || 'untested'}
                    </span>
                    {focusedTool.policy?.requires_approval !== 'never' && (
                      <span style={{ ...styles.policyBadge, background: '#f59e0b20', color: '#fbbf24' }}>
                        approval
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setFocusedTool(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '20px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      lineHeight: 1
                    }}
                    title="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                    {focusedTool.description || 'No description'}
                  </div>

                  {/* Inputs */}
                  {focusedTool.inputs?.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ ...styles.mockLabel, fontSize: '12px', marginBottom: '10px' }}>
                        Inputs ({focusedTool.inputs.length})
                      </div>
                      <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
                        {focusedTool.inputs.map((input, j) => (
                          <div key={j} style={{
                            ...styles.inputItem,
                            padding: '8px 0',
                            borderBottom: j < focusedTool.inputs.length - 1 ? '1px solid var(--border)' : 'none'
                          }}>
                            <span style={{ ...styles.inputName, fontSize: '14px' }}>{input.name}</span>
                            <span style={{ ...styles.inputType, fontSize: '11px' }}>{input.type || 'string'}</span>
                            {input.required && <span style={{ ...styles.inputRequired, fontSize: '11px' }}>required</span>}
                            {input.description && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>
                                — {input.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Output */}
                  {focusedTool.output && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ ...styles.mockLabel, fontSize: '12px', marginBottom: '10px' }}>Output</div>
                      <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                          {focusedTool.output.description || focusedTool.output.type || JSON.stringify(focusedTool.output)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MCP Bridge Source */}
                  {focusedTool.source?.type === 'mcp_bridge' && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ ...styles.mockLabel, fontSize: '12px', marginBottom: '10px' }}>MCP Bridge</div>
                      <div style={{
                        background: 'rgba(99, 102, 241, 0.1)',
                        borderRadius: '8px',
                        padding: '12px',
                        border: '1px solid rgba(99, 102, 241, 0.2)'
                      }}>
                        <div style={{ fontSize: '13px', color: '#a5b4fc' }}>
                          <div style={{ marginBottom: '6px' }}>
                            <strong>Connection:</strong> {focusedTool.source.connection_id}
                          </div>
                          <div>
                            <strong>MCP Tool:</strong> {focusedTool.source.mcp_tool}
                          </div>
                        </div>
                        <div style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          color: 'var(--text-muted)'
                        }}>
                          This tool calls an external MCP server. Ensure the connector is active before testing.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Policy */}
                  {focusedTool.policy && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ ...styles.mockLabel, fontSize: '12px', marginBottom: '10px' }}>Policy</div>
                      <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <div style={{ marginBottom: '6px' }}><strong>Allowed:</strong> {focusedTool.policy.allowed || 'always'}</div>
                          <div><strong>Requires Approval:</strong> {focusedTool.policy.requires_approval || 'never'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mock Examples */}
                  {focusedTool.mock?.examples?.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ ...styles.mockLabel, fontSize: '12px', marginBottom: '10px' }}>
                        Mock Examples ({focusedTool.mock.examples.length})
                      </div>
                      {focusedTool.mock.examples.map((ex, j) => (
                        <div key={j} style={{ ...styles.mockExample, marginBottom: '8px' }}>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                            <strong>Input:</strong> {JSON.stringify(ex.input, null, 2)}
                          </div>
                          <div style={{ color: 'var(--success)' }}>
                            <strong>Output:</strong> {JSON.stringify(ex.output, null, 2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Test Button */}
                  {focusedTool.inputs?.length > 0 && (
                    <button
                      style={{ ...styles.testBtn, padding: '10px 20px', fontSize: '14px' }}
                      onClick={() => setTestingTool(focusedTool)}
                    >
                      ▶ Test Tool
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Normal tools list view */
              <>
                <div style={styles.sectionHeader}>
                  <div style={styles.sectionTitle}>Tools ({skill.tools?.length || 0})</div>
                  <div style={styles.sectionHeaderButtons}>
                    <InfoButton topic="tools" onAskAbout={onAskAbout} />
                    <ValidateButton
                      section="tools"
                      skillId={skill?.id}
                      onValidationResults={handleValidationResults}
                      disabled={(skill.tools?.length || 0) < 2}
                    />
                  </div>
                </div>
                {skill.tools?.length > 0 ? (
                  skill.tools.map((tool, i) => {
                    const mockColor = getMockStatusColor(tool.mock_status);
                    const isFocused = focus?.type === 'TOOL' && focus?.id === tool.id;

                    return (
                      <div
                        key={tool.id || i}
                        style={{ ...styles.card, ...(isFocused ? styles.cardFocused : {}), cursor: 'pointer' }}
                        onClick={() => setFocusedTool(tool)}
                      >
                        <div style={styles.cardTitle}>
                          <span style={styles.expandIcon}>›</span>
                          {tool.name || `Tool ${i + 1}`}
                          {tool.source?.type === 'mcp_bridge' && (
                            <span style={{ ...styles.policyBadge, background: '#6366f120', color: '#a5b4fc' }}>
                              MCP
                            </span>
                          )}
                          <span style={{ ...styles.status, background: mockColor.bg, color: mockColor.color }}>
                            {tool.mock_status || 'untested'}
                          </span>
                          {tool.policy?.requires_approval !== 'never' && (
                            <span style={{ ...styles.policyBadge, background: '#f59e0b20', color: '#fbbf24' }}>
                              approval
                            </span>
                          )}
                        </div>
                        <div style={styles.cardMeta}>{tool.description || 'No description'}</div>
                      </div>
                    );
                  })
                ) : (
                  <div style={styles.empty}>No tools defined yet</div>
                )}

                {/* Meta Tools Section - DAL-generated compositions */}
                {skill.meta_tools?.length > 0 && (
                  <>
                    <div style={{ ...styles.sectionHeader, marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <div style={styles.sectionTitle}>
                        Meta Tools ({skill.meta_tools.length})
                        <span style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          fontWeight: 'normal',
                          marginLeft: '8px'
                        }}>
                          DAL-generated
                        </span>
                      </div>
                      <InfoButton topic="meta_tools" onAskAbout={onAskAbout} />
                    </div>
                    {skill.meta_tools.map((metaTool, i) => {
                      const statusColors = {
                        pending: { bg: '#f59e0b20', color: '#fbbf24' },
                        approved: { bg: '#22c55e20', color: '#4ade80' },
                        rejected: { bg: '#ef444420', color: '#f87171' }
                      };
                      const statusColor = statusColors[metaTool.status] || statusColors.pending;

                      return (
                        <div
                          key={metaTool.id || i}
                          style={{ ...styles.card, borderLeft: `3px solid ${statusColor.color}` }}
                        >
                          <div style={styles.cardTitle}>
                            <span style={{ fontSize: '14px', marginRight: '6px' }}>◈</span>
                            {metaTool.name || `Meta Tool ${i + 1}`}
                            <span style={{ ...styles.status, background: statusColor.bg, color: statusColor.color }}>
                              {metaTool.status || 'pending'}
                            </span>
                          </div>
                          <div style={styles.cardMeta}>{metaTool.description || 'No description'}</div>

                          {/* Composed tools */}
                          <div style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px'
                          }}>
                            <span style={{ marginRight: '4px' }}>Composes:</span>
                            {metaTool.composes?.map((toolName, j) => (
                              <span
                                key={j}
                                style={{
                                  background: 'var(--bg-tertiary)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px'
                                }}
                              >
                                {toolName}
                              </span>
                            ))}
                          </div>

                          {/* Logic description */}
                          {metaTool.logic && (
                            <div style={{
                              marginTop: '6px',
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              fontStyle: 'italic'
                            }}>
                              Logic: {metaTool.logic}
                            </div>
                          )}

                          {/* Approval buttons for pending meta tools */}
                          {metaTool.status === 'pending' && (
                            <div style={{
                              marginTop: '10px',
                              display: 'flex',
                              gap: '8px'
                            }}>
                              <button
                                style={{
                                  background: '#22c55e20',
                                  color: '#4ade80',
                                  border: '1px solid #22c55e40',
                                  borderRadius: '4px',
                                  padding: '4px 12px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                                onClick={() => onAskAbout(`Approve the meta tool "${metaTool.name}". Update its status to approved.`)}
                              >
                                Approve
                              </button>
                              <button
                                style={{
                                  background: '#ef444420',
                                  color: '#f87171',
                                  border: '1px solid #ef444440',
                                  borderRadius: '4px',
                                  padding: '4px 12px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                                onClick={() => onAskAbout(`Reject the meta tool "${metaTool.name}". Update its status to rejected and explain why it might not be needed.`)}
                              >
                                Reject
                              </button>
                            </div>
                          )}

                          {/* Suggested reason */}
                          {metaTool.suggested_reason && (
                            <div style={{
                              marginTop: '8px',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              background: 'var(--bg-tertiary)',
                              padding: '6px 8px',
                              borderRadius: '4px'
                            }}>
                              Why suggested: {metaTool.suggested_reason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Connectors Tab - shows connectors used by this skill */}
        {activeTab === 'connectors' && (
          <SkillConnectorsPanel
            skill={skill}
            tools={skill.tools || []}
            onLinkConnector={async (connectorId) => {
              // Link a connector to this skill
              try {
                const currentConnectors = skill.connectors || [];
                if (!currentConnectors.includes(connectorId)) {
                  const { updateSkill: updateSkillApi } = await import('../api/client');
                  const updatedSkill = await updateSkillApi(skill.id, {
                    connectors: [...currentConnectors, connectorId]
                  });
                  if (onSkillUpdate && updatedSkill) {
                    onSkillUpdate(updatedSkill);
                  }
                  if (onAskAbout) {
                    onAskAbout(`Linked connector "${connectorId}" to this skill. You can now import tools from it.`, true);
                  }
                }
              } catch (err) {
                console.error('Failed to link connector:', err);
                if (onAskAbout) {
                  onAskAbout(`Failed to link connector: ${err.message}`, true);
                }
              }
            }}
            onUnlinkConnector={async (connectorId) => {
              // Unlink a connector from this skill (only if no tools depend on it)
              try {
                const currentConnectors = skill.connectors || [];
                const { updateSkill: updateSkillApi } = await import('../api/client');
                const updatedSkill = await updateSkillApi(skill.id, {
                  connectors: currentConnectors.filter(c => c !== connectorId)
                });
                if (onSkillUpdate && updatedSkill) {
                  onSkillUpdate(updatedSkill);
                }
                if (onAskAbout) {
                  onAskAbout(`Unlinked connector "${connectorId}" from this skill.`, true);
                }
              } catch (err) {
                console.error('Failed to unlink connector:', err);
                if (onAskAbout) {
                  onAskAbout(`Failed to unlink connector: ${err.message}`, true);
                }
              }
            }}
          />
        )}

        {/* Policy Tab */}
        {activeTab === 'policy' && (
          <PolicyPanel
            policy={skill.policy}
            tools={skill.tools || []}
            focus={focus}
            onFocusChange={onFocusChange}
            onAskAbout={onAskAbout}
            validateButton={
              <ValidateButton
                section="policy"
                skillId={skill?.id}
                onValidationResults={handleValidationResults}
                disabled={
                  ((skill.policy?.guardrails?.never?.length || 0) +
                   (skill.policy?.guardrails?.always?.length || 0)) < 1
                }
              />
            }
          />
        )}

        {/* Engine Tab */}
        {activeTab === 'engine' && (
          <EnginePanel engine={skill.engine} onAskAbout={onAskAbout} />
        )}

        {/* Triggers Tab */}
        {activeTab === 'triggers' && (
          <TriggersPanel
            triggers={skill.triggers || []}
            skillId={skill.id}
            onTriggersChange={async (newTriggers) => {
              try {
                const { updateSkill: updateSkillApi } = await import('../api/client');
                const updatedSkill = await updateSkillApi(skill.id, {
                  triggers: newTriggers
                });
                if (onSkillUpdate && updatedSkill) {
                  onSkillUpdate(updatedSkill);
                }
              } catch (err) {
                console.error('Failed to update triggers:', err);
              }
            }}
            skillDeployed={!!skill.deployedTo}
          />
        )}
      </div>

      {/* Export Action */}
      <div style={styles.actions}>
        <button
          style={{ ...styles.exportBtn, ...(!canExport || exporting ? styles.exportBtnDisabled : {}) }}
          onClick={handleExport}
          disabled={!canExport || exporting}
        >
          {exporting ? 'Exporting...' : 'Export Skill'}
        </button>
      </div>

      {/* Test Tool Modal */}
      {testingTool && (
        <TestToolModal tool={testingTool} projectId={skillId} onClose={() => setTestingTool(null)} />
      )}

      {/* Validation Panel Modal */}
      {showValidationPanel && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowValidationPanel(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '700px',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Validation Status</h3>
              <button
                onClick={() => setShowValidationPanel(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '4px 8px'
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>
              {/* Validation Banner */}
              {skill.validation && (
                <ValidationBanner validation={skill.validation} showDetails={true} />
              )}

              {/* Cascading Validation List */}
              {issues.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <ValidationList
                    issues={issues}
                    onReviewClick={(issue) => {
                      handleValidationReview(issue);
                      setShowValidationPanel(false);
                    }}
                    onDismiss={dismissIssue}
                    onClearResolved={clearResolved}
                  />
                </div>
              )}

              {/* No issues message */}
              {!skill.validation?.errors?.length && !skill.validation?.warnings?.length && issues.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--text-muted)'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
                  <div>No validation issues found</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
