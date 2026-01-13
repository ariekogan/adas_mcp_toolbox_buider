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
import ValidationBanner from './ValidationBanner';
import ValidationList from './ValidationList';
import { useValidation } from '../hooks/useValidation';
import { validateToolsConsistency } from '../api/client';

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
    background: 'var(--bg-primary)'
  },
  tab: {
    padding: '10px 16px',
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
  { id: 'overview', label: 'Overview' },
  { id: 'intents', label: 'Intents' },
  { id: 'tools', label: 'Tools' },
  { id: 'policy', label: 'Policy' },
  { id: 'engine', label: 'Engine' }
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
    case 'overview': {
      // Overview: problem (1), scenarios (need 2+), role (1)
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

  if (!skillId) return null;

  const handleValidate = async (e) => {
    e.stopPropagation();
    if (loading || disabled) return;

    setLoading(true);
    try {
      let result;
      if (section === 'tools') {
        result = await validateToolsConsistency(skillId);
        console.log('Validation result:', result);
      }
      // Add more section validators here as needed

      if (onValidationResults && result) {
        console.log('Calling onValidationResults with:', section, result);
        onValidationResults(section, result);
      }
    } catch (err) {
      console.error(`Validation failed for ${section}:`, err);
    } finally {
      setLoading(false);
    }
  };

  // Loading spinner animation
  const spinnerStyle = loading ? {
    display: 'inline-block',
    animation: 'spin 1s linear infinite'
  } : {};

  return (
    <button
      style={{
        ...styles.validateBtn,
        ...(hovered && !loading ? styles.validateBtnHover : {}),
        ...(loading ? styles.validateBtnLoading : {})
      }}
      onClick={handleValidate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={loading ? 'Validating...' : `Validate ${section}`}
      disabled={loading || disabled}
    >
      {loading ? (
        <span style={spinnerStyle}>⟳</span>
      ) : '✓'}
    </button>
  );
}

export default function SkillPanel({
  skill,
  focus,
  onFocusChange,
  onExport,
  onAskAbout,
  onIssuesChange,
  skillId
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState({
    problem: true,
    role: false,
    scenarios: true,
    tools: true
  });
  const [expandedItems, setExpandedItems] = useState({});
  const [testingTool, setTestingTool] = useState(null);

  // Cascading validation - pass onIssuesChange for persistence
  const {
    issues,
    activeIssues,
    addIssue,
    dismissIssue,
    markReviewing,
    clearResolved
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
    console.log('handleValidationResults called:', section, result);
    if (result.issues && result.issues.length > 0) {
      console.log(`Adding ${result.issues.length} issues to validation list`);
      result.issues.forEach((issue, idx) => {
        console.log(`Adding issue ${idx}:`, issue);
        addIssue({
          id: `manual_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
          severity: issue.severity === 'blocker' ? 'blocker' :
                    issue.severity === 'warning' ? 'warning' : 'suggestion',
          category: section,
          title: `${issue.type}: ${issue.tools?.join(', ') || 'check'}`,
          context: issue.description,
          chatPrompt: `There's a ${section} consistency issue: ${issue.description}. ${issue.suggestion}. Please review and fix this.`,
          triggeredBy: {
            type: 'manual_validation',
            section,
            timestamp: new Date().toISOString()
          },
          relatedIds: issue.tools || []
        });
      });
    } else {
      // No issues found - could show a toast/notification
      console.log(`✓ No issues found in ${section}`);
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
    setExpandedItems(prev => ({ ...prev, [`${type}_${id}`]: !prev[`${type}_${id}`] }));
  };

  const isItemExpanded = (type, id) => expandedItems[`${type}_${id}`];

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
        <span style={styles.version}>v{skill.version || '0.1.0'}</span>
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
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Validation Banner - only in Overview */}
            {skill.validation && (
              <ValidationBanner validation={skill.validation} showDetails={true} />
            )}

            {/* Progress */}
            <div style={styles.progress}>
              <div style={styles.progressLabel}>
                <span>{skill.phase?.replace(/_/g, ' ')}</span>
                <span>{progress}%</span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progress}%` }} />
              </div>
            </div>

            {/* Cascading Validation List */}
            {issues.length > 0 && (
              <ValidationList
                issues={issues}
                onReviewClick={handleValidationReview}
                onDismiss={dismissIssue}
                onClearResolved={clearResolved}
              />
            )}

            {/* Problem */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <div style={styles.sectionHeaderWithInfo}>
                  <div style={styles.sectionTitle} onClick={() => toggleSection('problem')}>
                    <span style={{ ...styles.expandIcon, transform: expanded.problem ? 'rotate(90deg)' : 'rotate(0deg)' }}>></span>
                    Problem
                  </div>
                  <InfoButton topic="problem statement" onAskAbout={onAskAbout} />
                </div>
              </div>
              {expanded.problem && (
                skill.problem?.statement ? (
                  <div style={styles.problem}>
                    <div style={styles.problemField}>
                      <div style={styles.problemFieldLabel}>Statement</div>
                      <div style={styles.problemFieldValue}>{skill.problem.statement}</div>
                    </div>
                    {skill.problem.context && (
                      <div style={styles.problemField}>
                        <div style={styles.problemFieldLabel}>Context</div>
                        <div style={styles.problemFieldValue}>{skill.problem.context}</div>
                      </div>
                    )}
                    {skill.problem.goals?.length > 0 && (
                      <div style={styles.problemField}>
                        <div style={styles.problemFieldLabel}>Goals</div>
                        <div style={styles.tagList}>
                          {skill.problem.goals.map((g, i) => (
                            <span key={i} style={styles.tag}>{g}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={styles.empty}>Not yet defined</div>
                )
              )}
            </div>

            {/* Role */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <div style={styles.sectionHeaderWithInfo}>
                  <div style={styles.sectionTitle} onClick={() => toggleSection('role')}>
                    <span style={{ ...styles.expandIcon, transform: expanded.role ? 'rotate(90deg)' : 'rotate(0deg)' }}>></span>
                    Role / Persona
                  </div>
                  <InfoButton topic="role and persona" onAskAbout={onAskAbout} />
                </div>
              </div>
              {expanded.role && (
                skill.role?.name ? (
                  <div style={styles.problem}>
                    <div style={styles.problemField}>
                      <div style={styles.problemFieldLabel}>Name</div>
                      <div style={styles.problemFieldValue}>{skill.role.name}</div>
                    </div>
                    {skill.role.persona && (
                      <div style={styles.problemField}>
                        <div style={styles.problemFieldLabel}>Persona</div>
                        <div style={styles.problemFieldValue}>{skill.role.persona}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={styles.empty}>Not yet defined</div>
                )
              )}
            </div>

            {/* Scenarios */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <div style={styles.sectionHeaderWithInfo}>
                  <div style={styles.sectionTitle} onClick={() => toggleSection('scenarios')}>
                    <span style={{ ...styles.expandIcon, transform: expanded.scenarios ? 'rotate(90deg)' : 'rotate(0deg)' }}>></span>
                    Scenarios ({skill.scenarios?.length || 0})
                  </div>
                  <InfoButton topic="scenarios" onAskAbout={onAskAbout} />
                </div>
              </div>
              {expanded.scenarios && (
                skill.scenarios?.length > 0 ? (
                  skill.scenarios.map((scenario, i) => (
                    <div key={scenario.id || i} style={styles.card}>
                      <div style={styles.cardTitle} onClick={() => toggleItem('scenario', scenario.id || i)}>
                        <span style={{ ...styles.expandIcon, transform: isItemExpanded('scenario', scenario.id || i) ? 'rotate(90deg)' : 'rotate(0deg)' }}>></span>
                        {scenario.title || `Scenario ${i + 1}`}
                      </div>
                      <div style={styles.cardMeta}>{scenario.steps?.length || 0} steps</div>
                      {isItemExpanded('scenario', scenario.id || i) && scenario.description && (
                        <div style={styles.toolDetails}>{scenario.description}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={styles.empty}>No scenarios yet</div>
                )
              )}
            </div>
          </>
        )}

        {/* Intents Tab */}
        {activeTab === 'intents' && (
          <IntentsPanel intents={skill.intents} focus={focus} onFocusChange={onFocusChange} onAskAbout={onAskAbout} />
        )}

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div style={styles.section}>
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
                const isExpanded = isItemExpanded('tool', tool.id || i);

                return (
                  <div key={tool.id || i} style={{ ...styles.card, ...(isFocused ? styles.cardFocused : {}) }}>
                    <div style={styles.cardTitle} onClick={() => toggleItem('tool', tool.id || i)}>
                      <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>></span>
                      {tool.name || `Tool ${i + 1}`}
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

                    {isExpanded && (
                      <div style={styles.toolDetails}>
                        {/* Inputs */}
                        {tool.inputs?.length > 0 && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={styles.mockLabel}>Inputs</div>
                            {tool.inputs.map((input, j) => (
                              <div key={j} style={styles.inputItem}>
                                <span style={styles.inputName}>{input.name}</span>
                                <span style={styles.inputType}>{input.type || 'string'}</span>
                                {input.required && <span style={styles.inputRequired}>required</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Output */}
                        {tool.output && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={styles.mockLabel}>Output</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {tool.output.description || tool.output.type}
                            </div>
                          </div>
                        )}
                        {/* Tool Policy */}
                        {tool.policy && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={styles.mockLabel}>Policy</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Allowed: {tool.policy.allowed} | Approval: {tool.policy.requires_approval || 'never'}
                            </div>
                          </div>
                        )}
                        {/* Mock Examples */}
                        {tool.mock?.examples?.length > 0 && (
                          <div>
                            <div style={styles.mockLabel}>Mock Examples ({tool.mock.examples.length})</div>
                            {tool.mock.examples.slice(0, 2).map((ex, j) => (
                              <div key={j} style={styles.mockExample}>
                                <div style={{ color: 'var(--text-muted)' }}>In: {JSON.stringify(ex.input)}</div>
                                <div style={{ color: 'var(--success)' }}>Out: {JSON.stringify(ex.output).substring(0, 80)}...</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Test Button */}
                        {tool.inputs?.length > 0 && (
                          <button style={styles.testBtn} onClick={(e) => { e.stopPropagation(); setTestingTool(tool); }}>
                            Test Tool
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={styles.empty}>No tools defined yet</div>
            )}
          </div>
        )}

        {/* Policy Tab */}
        {activeTab === 'policy' && (
          <PolicyPanel policy={skill.policy} focus={focus} onFocusChange={onFocusChange} onAskAbout={onAskAbout} />
        )}

        {/* Engine Tab */}
        {activeTab === 'engine' && (
          <EnginePanel engine={skill.engine} onAskAbout={onAskAbout} />
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
    </div>
  );
}
