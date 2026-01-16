/**
 * IntentsPanel - Display and manage domain intents
 *
 * Shows supported intents, their examples, and out-of-domain handling configuration.
 */

import { useState } from 'react';

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
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid transparent',
    transition: 'border-color 0.2s'
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
  examplesList: {
    listStyle: 'none',
    padding: 0,
    margin: '4px 0'
  },
  exampleItem: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    padding: '4px 8px',
    background: 'var(--bg-primary)',
    borderRadius: '4px',
    marginBottom: '4px',
    fontStyle: 'italic'
  },
  tag: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    marginRight: '4px'
  },
  status: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: 'auto'
  },
  thresholds: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-card)',
    borderRadius: '6px'
  },
  thresholdItem: {
    flex: 1,
    textAlign: 'center'
  },
  thresholdValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--accent)'
  },
  thresholdLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase'
  },
  outOfDomain: {
    marginTop: '12px',
    padding: '12px',
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  outOfDomainHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  actionBadge: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '500'
  },
  guardrailsSection: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-primary)',
    borderRadius: '4px'
  },
  guardrailItem: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }
};

function getActionColor(action) {
  const colors = {
    redirect: { bg: '#3b82f620', color: '#60a5fa' },
    reject: { bg: '#ef444420', color: '#f87171' },
    escalate: { bg: '#f59e0b20', color: '#fbbf24' }
  };
  return colors[action] || colors.redirect;
}

function getResolvedColor(resolved) {
  return resolved
    ? { bg: '#10b98120', color: '#34d399' }
    : { bg: '#f59e0b20', color: '#fbbf24' };
}

export default function IntentsPanel({ intents, focus, onFocusChange, onAskAbout, validateButton }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});

  const toggleItem = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!intents) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Intents</div>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  const { supported = [], thresholds = {}, out_of_domain = {} } = intents;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle} onClick={() => setExpanded(!expanded)}>
          <span style={{ ...styles.expandIcon, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
          Intents ({supported.length})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExplainButton topic="intents" onAskAbout={onAskAbout} />
          {validateButton}
        </div>
      </div>

      {expanded && (
        <>
          {/* Supported Intents */}
          {supported.length > 0 ? (
            supported.map((intent, i) => {
              const isExpanded = expandedItems[intent.id || i];
              const isFocused = focus?.type === 'INTENT' && focus?.id === intent.id;
              const resolvedColor = getResolvedColor(intent.maps_to_workflow_resolved !== false);

              return (
                <div
                  key={intent.id || i}
                  style={{
                    ...styles.card,
                    ...(isFocused ? styles.cardFocused : {})
                  }}
                  onClick={() => onFocusChange?.({ type: 'INTENT', id: intent.id })}
                >
                  <div style={styles.cardTitle} onClick={(e) => { e.stopPropagation(); toggleItem(intent.id || i); }}>
                    <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                    {intent.description || `Intent ${i + 1}`}
                    {intent.maps_to_workflow && (
                      <span style={{
                        ...styles.status,
                        background: resolvedColor.bg,
                        color: resolvedColor.color
                      }}>
                        → {intent.maps_to_workflow}
                      </span>
                    )}
                  </div>
                  <div style={styles.cardMeta}>
                    {intent.examples?.length || 0} examples
                    {intent.entities?.length > 0 && ` | ${intent.entities.length} entities`}
                  </div>

                  {isExpanded && (
                    <div style={styles.details}>
                      {/* Examples */}
                      {intent.examples?.length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <div style={styles.label}>Examples</div>
                          <ul style={styles.examplesList}>
                            {intent.examples.map((ex, j) => (
                              <li key={j} style={styles.exampleItem}>"{ex}"</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Entities */}
                      {intent.entities?.length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <div style={styles.label}>Entities</div>
                          <div>
                            {intent.entities.map((entity, j) => (
                              <span key={j} style={styles.tag}>
                                {entity.name}: {entity.type}
                                {entity.required && ' *'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Guardrails */}
                      {intent.guardrails && (
                        <div style={styles.guardrailsSection}>
                          <div style={styles.label}>Guardrails</div>
                          {intent.guardrails.pre_conditions?.map((cond, j) => (
                            <div key={j} style={styles.guardrailItem}>Pre: {cond}</div>
                          ))}
                          {intent.guardrails.rate_limit && (
                            <div style={styles.guardrailItem}>
                              Rate limit: {intent.guardrails.rate_limit.max_per_session}/session
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={styles.empty}>No intents defined yet</div>
          )}

          {/* Thresholds */}
          {(thresholds.accept || thresholds.clarify || thresholds.reject) && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={styles.label}>Thresholds</span>
                <ExplainButton topic="intent thresholds" onAskAbout={onAskAbout} />
              </div>
              <div style={styles.thresholds}>
                <div style={styles.thresholdItem}>
                  <div style={styles.thresholdValue}>{thresholds.accept || 0.8}</div>
                  <div style={styles.thresholdLabel}>Accept</div>
                </div>
                <div style={styles.thresholdItem}>
                  <div style={styles.thresholdValue}>{thresholds.clarify || 0.5}</div>
                  <div style={styles.thresholdLabel}>Clarify</div>
                </div>
                <div style={styles.thresholdItem}>
                  <div style={styles.thresholdValue}>{thresholds.reject || 0.5}</div>
                  <div style={styles.thresholdLabel}>Reject</div>
                </div>
              </div>
            </div>
          )}

          {/* Out of Domain */}
          {out_of_domain.action && (
            <div style={styles.outOfDomain}>
              <div style={{ ...styles.outOfDomainHeader, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={styles.label}>Out of Domain</span>
                  <span style={{
                    ...styles.actionBadge,
                    ...getActionColor(out_of_domain.action)
                  }}>
                    {out_of_domain.action}
                  </span>
                </div>
                <ExplainButton topic="out of domain handling" onAskAbout={onAskAbout} />
              </div>
              {out_of_domain.message && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  "{out_of_domain.message}"
                </div>
              )}
              {out_of_domain.suggest_domains?.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <span style={styles.label}>Suggest: </span>
                  {out_of_domain.suggest_domains.map((d, i) => (
                    <span key={i} style={styles.tag}>{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
