/**
 * PolicyPanel - Display and manage domain policy
 *
 * Shows guardrails (never/always), approval rules, workflows, and escalation config.
 */

import { useState } from 'react';

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

export default function PolicyPanel({ policy, focus, onFocusChange }) {
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
      <div style={styles.sectionHeader} onClick={() => setExpanded(!expanded)}>
        <div style={styles.sectionTitle}>
          <span style={{ ...styles.expandIcon, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            >
          </span>
          Policy
          {(guardrails.never?.length > 0 || guardrails.always?.length > 0) && (
            <span style={{ color: 'var(--success)', fontSize: '11px' }}>configured</span>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Guardrails - Never */}
          <div style={styles.subsection}>
            <div style={styles.subsectionTitle}>
              <span style={{ ...styles.guardrailIcon, ...styles.neverIcon }}>X</span>
              Never ({guardrails.never?.length || 0})
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
            <div style={styles.subsectionTitle}>
              <span style={{ ...styles.guardrailIcon, ...styles.alwaysIcon }}>Y</span>
              Always ({guardrails.always?.length || 0})
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
            <div style={styles.subsectionTitle}>
              Workflows ({workflows.length})
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
                      <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                        >
                      </span>
                      {workflow.name || `Workflow ${i + 1}`}
                      <span style={{
                        ...styles.status,
                        background: resolvedColor.bg,
                        color: resolvedColor.color
                      }}>
                        {allResolved ? 'resolved' : 'unresolved'}
                      </span>
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
                                  <span style={{ color: '#f59e0b', fontSize: '10px' }}>missing</span>
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
              <div style={styles.subsectionTitle}>
                Approval Rules ({approvals.length})
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
                            When: {cond.when} -> {cond.action}
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
            <div style={styles.subsectionTitle}>Escalation</div>
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
