/**
 * IdentityPanel - Display Problem, Role/Persona, and Scenarios
 *
 * Extracted from the Overview tab to separate identity/context info
 * from validation status.
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
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px'
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
  field: {
    marginBottom: '12px'
  },
  fieldLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  fieldValue: {
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
  }
};

// Info button component
function ExplainButton({ topic, onAskAbout }) {
  const [hovered, setHovered] = useState(false);

  if (!onAskAbout) return null;

  return (
    <button
      style={{
        ...styles.infoBtn,
        ...(hovered ? { background: 'rgba(59, 130, 246, 0.15)', borderColor: '#60a5fa' } : {})
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

export default function IdentityPanel({ skill, onAskAbout }) {
  const [expanded, setExpanded] = useState({
    problem: true,
    role: true,
    scenarios: true
  });
  const [expandedItems, setExpandedItems] = useState({});

  const toggleSection = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleItem = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!skill) {
    return <div style={styles.empty}>No skill selected</div>;
  }

  return (
    <>
      {/* Problem */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle} onClick={() => toggleSection('problem')}>
            <span style={{ ...styles.expandIcon, transform: expanded.problem ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Problem
          </div>
          <ExplainButton topic="problem statement" onAskAbout={onAskAbout} />
        </div>
        {expanded.problem && (
          skill.problem?.statement ? (
            <div style={styles.card}>
              <div style={styles.field}>
                <div style={styles.fieldLabel}>Statement</div>
                <div style={styles.fieldValue}>{skill.problem.statement}</div>
              </div>
              {skill.problem.context && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Context</div>
                  <div style={styles.fieldValue}>{skill.problem.context}</div>
                </div>
              )}
              {skill.problem.goals?.length > 0 && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Goals</div>
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

      {/* Role / Persona */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle} onClick={() => toggleSection('role')}>
            <span style={{ ...styles.expandIcon, transform: expanded.role ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Role / Persona
          </div>
          <ExplainButton topic="role and persona" onAskAbout={onAskAbout} />
        </div>
        {expanded.role && (
          skill.role?.name ? (
            <div style={styles.card}>
              <div style={styles.field}>
                <div style={styles.fieldLabel}>Name</div>
                <div style={styles.fieldValue}>{skill.role.name}</div>
              </div>
              {skill.role.persona && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Persona</div>
                  <div style={styles.fieldValue}>{skill.role.persona}</div>
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
          <div style={styles.sectionTitle} onClick={() => toggleSection('scenarios')}>
            <span style={{ ...styles.expandIcon, transform: expanded.scenarios ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Scenarios ({skill.scenarios?.length || 0})
          </div>
          <ExplainButton topic="scenarios" onAskAbout={onAskAbout} />
        </div>
        {expanded.scenarios && (
          skill.scenarios?.length > 0 ? (
            skill.scenarios.map((scenario, i) => {
              const id = scenario.id || i;
              const isExpanded = expandedItems[id];
              return (
                <div key={id} style={styles.card}>
                  <div style={styles.cardTitle} onClick={() => toggleItem(id)}>
                    <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                    {scenario.title || `Scenario ${i + 1}`}
                  </div>
                  <div style={styles.cardMeta}>{scenario.steps?.length || 0} steps</div>
                  {isExpanded && scenario.description && (
                    <div style={styles.toolDetails}>{scenario.description}</div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={styles.empty}>No scenarios yet</div>
          )
        )}
      </div>
    </>
  );
}
