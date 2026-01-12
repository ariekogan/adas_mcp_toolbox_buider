/**
 * EnginePanel - Display and manage engine configuration
 *
 * Shows RV2 settings, HLR configuration, and autonomy level.
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
  subsection: {
    marginBottom: '16px',
    padding: '12px',
    background: 'var(--bg-card)',
    borderRadius: '8px'
  },
  subsectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)'
  },
  settingLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  settingValue: {
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    fontFamily: 'monospace'
  },
  badge: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '500'
  },
  enabledBadge: {
    background: '#10b98120',
    color: '#34d399'
  },
  disabledBadge: {
    background: '#6b728020',
    color: '#9ca3af'
  },
  autonomyLevel: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px'
  },
  autonomyOption: {
    flex: 1,
    padding: '12px 8px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    textAlign: 'center',
    border: '2px solid transparent',
    transition: 'border-color 0.2s'
  },
  autonomyOptionActive: {
    borderColor: 'var(--accent)',
    background: 'var(--bg-card)'
  },
  autonomyLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    marginBottom: '4px'
  },
  autonomyDesc: {
    fontSize: '10px',
    color: 'var(--text-muted)'
  },
  hlrSection: {
    marginTop: '8px'
  },
  hlrItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    marginBottom: '6px'
  },
  hlrItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  hlrItemLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  hlrItemValue: {
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic'
  }
};

function getAutonomyColor(level) {
  const colors = {
    autonomous: { bg: '#10b98120', color: '#34d399' },
    supervised: { bg: '#3b82f620', color: '#60a5fa' },
    restricted: { bg: '#f59e0b20', color: '#fbbf24' }
  };
  return colors[level] || colors.supervised;
}

function getStrictnessLabel(strictness) {
  const labels = {
    low: 'Relaxed',
    medium: 'Balanced',
    high: 'Strict'
  };
  return labels[strictness] || strictness;
}

function getDepthLabel(depth) {
  const labels = {
    shallow: 'Quick',
    medium: 'Moderate',
    deep: 'Thorough'
  };
  return labels[depth] || depth;
}

export default function EnginePanel({ engine, onAskAbout }) {
  const [expanded, setExpanded] = useState(true);

  if (!engine) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Engine</div>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  const { rv2 = {}, hlr = {}, autonomy = {} } = engine;
  const autonomyColor = getAutonomyColor(autonomy.level);

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle} onClick={() => setExpanded(!expanded)}>
          <span style={{ ...styles.expandIcon, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            >
          </span>
          Engine Settings
          <span style={{
            ...styles.badge,
            ...autonomyColor
          }}>
            {autonomy.level || 'supervised'}
          </span>
        </div>
        <ExplainButton topic="engine settings" onAskAbout={onAskAbout} />
      </div>

      {expanded && (
        <>
          {/* Autonomy Level */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <span>Autonomy Level</span>
              <ExplainButton topic="autonomy level" onAskAbout={onAskAbout} />
            </div>
            <div style={styles.autonomyLevel}>
              {['autonomous', 'supervised', 'restricted'].map(level => (
                <div
                  key={level}
                  style={{
                    ...styles.autonomyOption,
                    ...(autonomy.level === level ? styles.autonomyOptionActive : {})
                  }}
                >
                  <div style={styles.autonomyLabel}>{level.charAt(0).toUpperCase() + level.slice(1)}</div>
                  <div style={styles.autonomyDesc}>
                    {level === 'autonomous' && 'Full automation'}
                    {level === 'supervised' && 'Approval needed'}
                    {level === 'restricted' && 'Manual control'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RV2 Settings */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <span>RV2 Engine</span>
              <ExplainButton topic="RV2 engine" onAskAbout={onAskAbout} />
            </div>
            <div style={styles.settingRow}>
              <span style={styles.settingLabel}>Max Iterations</span>
              <span style={styles.settingValue}>{rv2.max_iterations || 10}</span>
            </div>
            <div style={styles.settingRow}>
              <span style={styles.settingLabel}>Timeout</span>
              <span style={styles.settingValue}>{(rv2.iteration_timeout_ms || 30000) / 1000}s</span>
            </div>
            <div style={styles.settingRow}>
              <span style={styles.settingLabel}>Parallel Tools</span>
              <span style={{
                ...styles.badge,
                ...(rv2.allow_parallel_tools ? styles.enabledBadge : styles.disabledBadge)
              }}>
                {rv2.allow_parallel_tools ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div style={{ ...styles.settingRow, borderBottom: 'none' }}>
              <span style={styles.settingLabel}>On Max Iterations</span>
              <span style={styles.settingValue}>{rv2.on_max_iterations || 'ask_user'}</span>
            </div>
          </div>

          {/* HLR Settings */}
          <div style={styles.subsection}>
            <div style={{ ...styles.subsectionTitle, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>HLR (High-Level Reasoning)</span>
                <span style={{
                  ...styles.badge,
                  ...(hlr.enabled !== false ? styles.enabledBadge : styles.disabledBadge)
                }}>
                  {hlr.enabled !== false ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <ExplainButton topic="HLR high-level reasoning" onAskAbout={onAskAbout} />
            </div>

            {hlr.enabled !== false && (
              <div style={styles.hlrSection}>
                {/* Critic */}
                <div style={styles.hlrItem}>
                  <div style={styles.hlrItemLeft}>
                    <span style={{
                      ...styles.badge,
                      ...(hlr.critic?.enabled !== false ? styles.enabledBadge : styles.disabledBadge)
                    }}>
                      {hlr.critic?.enabled !== false ? 'ON' : 'OFF'}
                    </span>
                    <span style={styles.hlrItemLabel}>Critic</span>
                  </div>
                  <div>
                    {hlr.critic?.enabled !== false && (
                      <>
                        <span style={styles.hlrItemValue}>
                          Every {hlr.critic?.check_interval || 3} turns |{' '}
                          {getStrictnessLabel(hlr.critic?.strictness || 'medium')}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Reflection */}
                <div style={styles.hlrItem}>
                  <div style={styles.hlrItemLeft}>
                    <span style={{
                      ...styles.badge,
                      ...(hlr.reflection?.enabled !== false ? styles.enabledBadge : styles.disabledBadge)
                    }}>
                      {hlr.reflection?.enabled !== false ? 'ON' : 'OFF'}
                    </span>
                    <span style={styles.hlrItemLabel}>Reflection</span>
                  </div>
                  <div>
                    {hlr.reflection?.enabled !== false && (
                      <span style={styles.hlrItemValue}>
                        {getDepthLabel(hlr.reflection?.depth || 'shallow')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Replanning */}
                <div style={styles.hlrItem}>
                  <div style={styles.hlrItemLeft}>
                    <span style={{
                      ...styles.badge,
                      ...(hlr.replanning?.enabled !== false ? styles.enabledBadge : styles.disabledBadge)
                    }}>
                      {hlr.replanning?.enabled !== false ? 'ON' : 'OFF'}
                    </span>
                    <span style={styles.hlrItemLabel}>Replanning</span>
                  </div>
                  <div>
                    {hlr.replanning?.enabled !== false && (
                      <span style={styles.hlrItemValue}>
                        Max {hlr.replanning?.max_replans || 2} replans
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
