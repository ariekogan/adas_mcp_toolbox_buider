/**
 * PolicyPanel - Display and manage domain policy
 *
 * Shows guardrails (never/always), approval rules, workflows, and escalation config.
 */

import { useState } from 'react';

// Help Popup for explaining missing/unresolved issues
function HelpPopup({ isOpen, onClose, title, content, advice, onAskAI }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onClose}
      />
      {/* Popup */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '450px',
          width: '90%',
          zIndex: 1001,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6' }}>
          {content}
        </div>

        {/* Advice box */}
        {advice && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' }}>
              How to fix
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {advice}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Got it
          </button>
          {onAskAI && (
            <button
              onClick={() => { onAskAI(); onClose(); }}
              style={{
                padding: '8px 16px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              Ask AI to fix
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// Clickable badge for missing/unresolved status
function StatusBadge({ type, stepName, workflowName, onAskAbout }) {
  const [showPopup, setShowPopup] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isMissing = type === 'missing';
  const isUnresolved = type === 'unresolved';

  const baseStyle = {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    userSelect: 'none'
  };

  const style = isMissing
    ? {
        ...baseStyle,
        background: hovered ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
        color: '#f59e0b',
        border: hovered ? '1px solid #f59e0b' : '1px solid transparent'
      }
    : {
        ...baseStyle,
        background: hovered ? 'rgba(245, 158, 11, 0.3)' : '#f59e0b20',
        color: '#fbbf24',
        border: hovered ? '1px solid #fbbf24' : '1px solid transparent'
      };

  const getPopupContent = () => {
    if (isMissing) {
      return {
        title: `Missing Tool: ${stepName}`,
        content: (
          <>
            <p style={{ margin: '0 0 8px 0' }}>
              The workflow step <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{stepName}</strong> references a tool that doesn't exist in your skill.
            </p>
            <p style={{ margin: 0 }}>
              Workflow steps must reference tools that are defined in your Tools section. This step cannot be executed until the tool exists.
            </p>
          </>
        ),
        advice: (
          <>
            <strong>Option 1:</strong> Add the missing tool by asking the AI: "Create a tool called {stepName}"
            <br /><br />
            <strong>Option 2:</strong> Remove or update this workflow step if the tool isn't needed.
          </>
        ),
        askPrompt: `The workflow "${workflowName}" has a step "${stepName}" but this tool doesn't exist. Please either create this tool or update the workflow to use existing tools.`
      };
    } else {
      return {
        title: `Unresolved Workflow: ${workflowName}`,
        content: (
          <>
            <p style={{ margin: '0 0 8px 0' }}>
              The workflow <strong style={{ color: 'var(--accent)' }}>{workflowName}</strong> has one or more steps that reference tools that don't exist.
            </p>
            <p style={{ margin: 0 }}>
              All workflow steps must reference existing tools for the workflow to be valid and executable.
            </p>
          </>
        ),
        advice: (
          <>
            <strong>Option 1:</strong> Add the missing tools that this workflow needs.
            <br /><br />
            <strong>Option 2:</strong> Simplify the workflow to only use tools you already have.
            <br /><br />
            <strong>Option 3:</strong> Remove this workflow if it's not needed.
          </>
        ),
        askPrompt: `The workflow "${workflowName}" has unresolved tool references. Please review the workflow steps and either create the missing tools or update the workflow to use only existing tools.`
      };
    }
  };

  const popupData = getPopupContent();

  return (
    <>
      <span
        style={style}
        onClick={(e) => { e.stopPropagation(); setShowPopup(true); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Click for help"
      >
        {type}
      </span>
      <HelpPopup
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
        title={popupData.title}
        content={popupData.content}
        advice={popupData.advice}
        onAskAI={onAskAbout ? () => onAskAbout(popupData.askPrompt, true) : null}
      />
    </>
  );
}

// Info button component - Option C: Accent Border Pill
function ExplainButton({ topic, onAskAbout }) {
  const [hovered, setHovered] = useState(false);

  if (!onAskAbout) return null;

  return (
    <button
      style={{
        padding: '3px 10px',
        background: hovered ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
        border: '1px solid ' + (hovered ? '#60a5fa' : 'rgba(59, 130, 246, 0.4)'),
        borderRadius: '999px',
        color: '#60a5fa',
        cursor: 'pointer',
        fontSize: '10px',
        transition: 'all 0.15s ease',
        flexShrink: 0
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

const styles = {
  section: {
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  subsection: {
    marginBottom: '16px'
  },
  subsectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
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
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic'
  },
  guardrailItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--bg-card)',
    borderRadius: '6px',
    marginBottom: '6px',
    fontSize: '13px',
    lineHeight: '1.4'
  },
  guardrailIcon: {
    fontSize: '14px',
    flexShrink: 0
  },
  neverIcon: {
    color: '#ef4444'
  },
  alwaysIcon: {
    color: '#10b981'
  },
  details: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    fontSize: '12px'
  },
  label: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  stepsList: {
    listStyle: 'none',
    padding: 0,
    margin: '4px 0'
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    padding: '4px 0',
    borderLeft: '2px solid var(--border)',
    paddingLeft: '12px',
    marginLeft: '8px'
  },
  stepResolved: {
    borderLeftColor: 'var(--success)'
  },
  stepUnresolved: {
    borderLeftColor: '#f59e0b'
  },
  status: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: 'auto'
  },
  tag: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    marginRight: '4px'
  },
  conditionsList: {
    marginTop: '4px'
  },
  conditionItem: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    padding: '4px 8px',
    background: 'var(--bg-primary)',
    borderRadius: '4px',
    marginBottom: '4px'
  },
  escalationBox: {
    padding: '12px',
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  escalationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  enabledBadge: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '500'
  }
};

function getResolvedColor(resolved) {
  return resolved
    ? { bg: '#10b98120', color: '#34d399' }
    : { bg: '#f59e0b20', color: '#fbbf24' };
}

export default function PolicyPanel({ policy, focus, onFocusChange, onAskAbout, validateButton, tools = [] }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedWorkflows, setExpandedWorkflows] = useState({});

  const toggleWorkflow = (id) => {
    setExpandedWorkflows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!policy) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Policy</div>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  const { guardrails = {}, approvals = [], workflows = [], escalation = {} } = policy;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle} onClick={() => setExpanded(!expanded)}>
          <span style={{ ...styles.expandIcon, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
          Policy
          {(guardrails.never?.length > 0 || guardrails.always?.length > 0) && (
            <span style={{ color: 'var(--success)', fontSize: '11px' }}>configured</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ExplainButton topic="policy and guardrails" onAskAbout={onAskAbout} />
          {validateButton}
        </div>
      </div>

      {expanded && (
        <>
          {/* Guardrails - Never */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ ...styles.guardrailIcon, ...styles.neverIcon }}>X</span>
                Never ({guardrails.never?.length || 0})
              </div>
              <ExplainButton topic="never guardrails" onAskAbout={onAskAbout} />
            </div>
            {guardrails.never?.length > 0 ? (
              guardrails.never.map((item, i) => (
                <div key={i} style={styles.guardrailItem}>
                  <span style={{ ...styles.guardrailIcon, ...styles.neverIcon }}>X</span>
                  <span>{item}</span>
                </div>
              ))
            ) : (
              <div style={styles.empty}>No "never" rules defined</div>
            )}
          </div>

          {/* Guardrails - Always */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ ...styles.guardrailIcon, ...styles.alwaysIcon }}>Y</span>
                Always ({guardrails.always?.length || 0})
              </div>
              <ExplainButton topic="always guardrails" onAskAbout={onAskAbout} />
            </div>
            {guardrails.always?.length > 0 ? (
              guardrails.always.map((item, i) => (
                <div key={i} style={styles.guardrailItem}>
                  <span style={{ ...styles.guardrailIcon, ...styles.alwaysIcon }}>Y</span>
                  <span>{item}</span>
                </div>
              ))
            ) : (
              <div style={styles.empty}>No "always" rules defined</div>
            )}
          </div>

          {/* Workflows */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <span>Workflows ({workflows.length})</span>
              <ExplainButton topic="workflows" onAskAbout={onAskAbout} />
            </div>
            {workflows.length > 0 ? (
              workflows.map((workflow, i) => {
                const isExpanded = expandedWorkflows[workflow.id || i];
                const isFocused = focus?.type === 'WORKFLOW' && focus?.id === workflow.id;
                const allResolved = workflow.steps_resolved?.every(r => r) ?? true;
                const resolvedColor = getResolvedColor(allResolved);

                return (
                  <div
                    key={workflow.id || i}
                    style={{
                      ...styles.card,
                      ...(isFocused ? styles.cardFocused : {})
                    }}
                    onClick={() => onFocusChange?.({ type: 'WORKFLOW', id: workflow.id })}
                  >
                    <div style={styles.cardTitle} onClick={(e) => { e.stopPropagation(); toggleWorkflow(workflow.id || i); }}>
                      <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                      {workflow.name || `Workflow ${i + 1}`}
                      {allResolved ? (
                        <span style={{
                          ...styles.status,
                          background: resolvedColor.bg,
                          color: resolvedColor.color
                        }}>
                          resolved
                        </span>
                      ) : (
                        <StatusBadge
                          type="unresolved"
                          workflowName={workflow.name || `Workflow ${i + 1}`}
                          onAskAbout={onAskAbout}
                        />
                      )}
                    </div>
                    <div style={styles.cardMeta}>
                      {workflow.steps?.length || 0} steps | Trigger: {workflow.trigger || 'Not set'}
                    </div>

                    {isExpanded && (
                      <div style={styles.details}>
                        {workflow.description && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={styles.label}>Description</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{workflow.description}</div>
                          </div>
                        )}

                        <div style={styles.label}>Steps</div>
                        <ul style={styles.stepsList}>
                          {workflow.steps?.map((step, j) => {
                            const resolved = workflow.steps_resolved?.[j] ?? true;
                            return (
                              <li
                                key={j}
                                style={{
                                  ...styles.stepItem,
                                  ...(resolved ? styles.stepResolved : styles.stepUnresolved)
                                }}
                              >
                                <span style={{ color: 'var(--text-muted)' }}>{j + 1}.</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{step}</span>
                                {!resolved && (
                                  <StatusBadge
                                    type="missing"
                                    stepName={step}
                                    workflowName={workflow.name || `Workflow ${i + 1}`}
                                    onAskAbout={onAskAbout}
                                  />
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {workflow.on_deviation && (
                          <div style={{ marginTop: '8px' }}>
                            <span style={styles.label}>On Deviation: </span>
                            <span style={styles.tag}>{workflow.on_deviation}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={styles.empty}>No workflows defined</div>
            )}
          </div>

          {/* Approval Rules */}
          {approvals.length > 0 && (
            <div style={styles.subsection}>
              <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
                <span>Approval Rules ({approvals.length})</span>
                <ExplainButton topic="approval rules" onAskAbout={onAskAbout} />
              </div>
              {approvals.map((rule, i) => {
                const resolvedColor = getResolvedColor(rule.tool_id_resolved !== false);
                return (
                  <div key={rule.id || i} style={styles.card}>
                    <div style={styles.cardTitle}>
                      Tool: <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{rule.tool_id}</span>
                      <span style={{
                        ...styles.status,
                        background: resolvedColor.bg,
                        color: resolvedColor.color
                      }}>
                        {rule.tool_id_resolved !== false ? 'linked' : 'unlinked'}
                      </span>
                    </div>
                    {rule.conditions?.length > 0 && (
                      <div style={styles.conditionsList}>
                        {rule.conditions.map((cond, j) => (
                          <div key={j} style={styles.conditionItem}>
                            When: {cond.when} → {cond.action}
                          </div>
                        ))}
                      </div>
                    )}
                    {rule.approver && (
                      <div style={styles.cardMeta}>Approver: {rule.approver}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Escalation */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <span>Escalation</span>
              <ExplainButton topic="escalation" onAskAbout={onAskAbout} />
            </div>
            <div style={styles.escalationBox}>
              <div style={styles.escalationHeader}>
                <span style={styles.label}>Status</span>
                <span style={{
                  ...styles.enabledBadge,
                  background: escalation.enabled ? '#10b98120' : '#6b728020',
                  color: escalation.enabled ? '#34d399' : '#9ca3af'
                }}>
                  {escalation.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {escalation.enabled && (
                <>
                  {escalation.target && (
                    <div style={{ marginBottom: '8px' }}>
                      <span style={styles.label}>Target: </span>
                      <span style={{ fontSize: '12px' }}>{escalation.target}</span>
                    </div>
                  )}
                  {escalation.conditions?.length > 0 && (
                    <div>
                      <div style={styles.label}>Conditions</div>
                      {escalation.conditions.map((cond, i) => (
                        <div key={i} style={styles.conditionItem}>{cond}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
