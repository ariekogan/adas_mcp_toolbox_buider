/**
 * SolutionSummaryCard — Visual summary card for solutions
 *
 * Displays a structured overview of a solution including:
 * - Header with name, phase, and health status
 * - Skills grid with status badges
 * - Grants flow visualization
 * - Handoffs diagram
 * - Routing table
 * - Connectors list
 */

import { useState } from 'react';

// ═══════════════════════════════════════════════════════════════
// Constants (matching SolutionPanel.jsx)
// ═══════════════════════════════════════════════════════════════
const ROLE_COLORS = {
  gateway: { bg: '#f59e0b20', color: '#f59e0b', stroke: '#f59e0b' },
  worker: { bg: '#3b82f620', color: '#60a5fa', stroke: '#3b82f6' },
  orchestrator: { bg: '#8b5cf620', color: '#a78bfa', stroke: '#8b5cf6' },
  approval: { bg: '#10b98120', color: '#34d399', stroke: '#10b981' },
};

const PHASE_LABELS = {
  SOLUTION_DISCOVERY: { label: 'Discovery', color: '#6b7280' },
  SKILL_TOPOLOGY: { label: 'Topology', color: '#f59e0b' },
  GRANT_ECONOMY: { label: 'Grants', color: '#10b981' },
  HANDOFF_DESIGN: { label: 'Handoffs', color: '#8b5cf6' },
  ROUTING_CONFIG: { label: 'Routing', color: '#3b82f6' },
  SECURITY_CONTRACTS: { label: 'Security', color: '#ef4444' },
  VALIDATION: { label: 'Validation', color: '#14b8a6' },
};

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  solutionIcon: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  solutionName: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  phaseBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
  },
  healthBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
  },
  actionsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  },
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  actionButtonPrimary: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'white',
  },
  actionButtonSuccess: {
    background: '#10b98120',
    borderColor: '#10b981',
    color: '#10b981',
  },
  actionButtonWarning: {
    background: '#f59e0b20',
    borderColor: '#f59e0b',
    color: '#f59e0b',
  },
  actionButtonError: {
    background: '#ef444420',
    borderColor: '#ef4444',
    color: '#ef4444',
  },
  section: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  sectionLast: {
    padding: '12px 16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sectionCount: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  skillsGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  skillCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    minWidth: '140px',
  },
  skillInfo: {
    flex: 1,
    minWidth: 0,
  },
  skillName: {
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  skillMeta: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  skillStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: '500',
  },
  grantFlow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  grantRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    padding: '6px 10px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
  },
  grantArrow: {
    color: 'var(--text-muted)',
    fontSize: '14px',
  },
  grantKey: {
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '2px 6px',
    background: '#10b98120',
    color: '#10b981',
    borderRadius: '3px',
  },
  handoffRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    padding: '6px 10px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  handoffTrigger: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  routeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    padding: '6px 10px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  channelBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    background: '#3b82f620',
    color: '#60a5fa',
  },
  connectorsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  connectorBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    background: '#14b8a620',
    color: '#14b8a6',
    border: '1px solid #14b8a640',
  },
  emptyText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  skillPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
  },
};

// ═══════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════
function SkillPill({ skillId, skillName, role }) {
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.worker;
  // Display name if available, otherwise show a truncated ID
  const displayText = skillName || (skillId?.length > 16 ? skillId.slice(0, 14) + '...' : skillId);
  return (
    <span style={{
      ...styles.skillPill,
      background: roleColor.bg,
      color: roleColor.color,
    }} title={skillId}>
      {displayText}
    </span>
  );
}

function StatusDot({ status }) {
  const colors = {
    valid: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    pending: '#6b7280',
  };
  return (
    <span style={{
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: colors[status] || colors.pending,
    }} />
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════
export default function SolutionSummaryCard({
  solution,
  skills = [],
  onNavigate,
  onValidate,
  onExportPreview,
  validationStatus, // 'valid' | 'warning' | 'error' | 'loading' | null
  exportStatus = null // 'loading' | null
}) {
  const [expandedSections, setExpandedSections] = useState({
    skills: true,
    grants: true,
    handoffs: true,
    routing: true,
    connectors: true,
  });

  if (!solution) return null;

  const grants = solution.grants || [];
  const handoffs = solution.handoffs || [];
  const routing = solution.routing || {};
  const connectors = solution.platform_connectors || [];
  const contracts = solution.security_contracts || [];

  // Calculate health status
  const calculateHealth = () => {
    let score = 0;
    let total = 0;

    // Skills defined
    total += 1;
    if (skills.length > 0) score += 1;

    // Grants defined (if multiple skills)
    if (skills.length > 1) {
      total += 1;
      if (grants.length > 0) score += 1;
    }

    // Handoffs defined (if multiple skills)
    if (skills.length > 1) {
      total += 1;
      if (handoffs.length > 0) score += 1;
    }

    // Routing configured
    total += 1;
    if (Object.keys(routing).length > 0) score += 1;

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    return {
      percentage,
      status: percentage >= 80 ? 'ready' : percentage >= 50 ? 'partial' : 'incomplete',
    };
  };

  const health = calculateHealth();
  const phase = PHASE_LABELS[solution.phase] || PHASE_LABELS.SOLUTION_DISCOVERY;

  // Build skill lookups (role and name)
  const skillRoles = {};
  const skillNames = {};
  skills.forEach(s => {
    skillRoles[s.id] = s.role || 'worker';
    skillNames[s.id] = s.name || s.id;
  });

  // Get skill status for display
  const getSkillStatus = (skill) => {
    const hasTools = (skill.tools || []).length > 0;
    const hasPrompt = !!skill.prompt;
    if (hasTools && hasPrompt) return { status: 'valid', label: 'Ready' };
    if (hasTools || hasPrompt) return { status: 'warning', label: 'Partial' };
    return { status: 'pending', label: 'Pending' };
  };

  // Get validation button style based on status
  const getValidationButtonStyle = () => {
    if (validationStatus === 'loading') return {};
    if (validationStatus === 'valid') return styles.actionButtonSuccess;
    if (validationStatus === 'warning') return styles.actionButtonWarning;
    if (validationStatus === 'error') return styles.actionButtonError;
    return {};
  };

  const getValidationIcon = () => {
    if (validationStatus === 'loading') return '⏳';
    if (validationStatus === 'valid') return '✓';
    if (validationStatus === 'warning') return '⚠';
    if (validationStatus === 'error') return '✗';
    return '📋';
  };

  const getValidationLabel = () => {
    if (validationStatus === 'loading') return 'Validating...';
    if (validationStatus === 'valid') return 'Valid';
    if (validationStatus === 'warning') return 'Warnings';
    if (validationStatus === 'error') return 'Issues Found';
    return 'Validate Solution';
  };

  // Export button helpers
  const getExportButtonStyle = () => {
    if (exportStatus === 'loading') {
      return { opacity: 0.6, cursor: 'not-allowed' };
    }
    return {};
  };

  const getExportIcon = () => {
    return exportStatus === 'loading' ? '⏳' : '📦';
  };

  const getExportLabel = () => {
    return exportStatus === 'loading' ? 'Exporting...' : 'Export Preview';
  };

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.solutionIcon}>⌂</div>
          <span style={styles.solutionName}>{solution.name || 'Untitled Solution'}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={{
            ...styles.phaseBadge,
            background: `${phase.color}20`,
            color: phase.color,
          }}>
            {phase.label}
          </span>
          <span style={{
            ...styles.healthBadge,
            background: health.status === 'ready' ? '#10b98120' : health.status === 'partial' ? '#f59e0b20' : '#6b728020',
            color: health.status === 'ready' ? '#10b981' : health.status === 'partial' ? '#f59e0b' : '#6b7280',
          }}>
            {health.status === 'ready' ? '✓' : health.status === 'partial' ? '◐' : '○'} {health.percentage}%
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={styles.actionsBar}>
        {onValidate && (
          <button
            style={{
              ...styles.actionButton,
              ...getValidationButtonStyle(),
            }}
            onClick={onValidate}
            disabled={validationStatus === 'loading'}
          >
            {getValidationIcon()} {getValidationLabel()}
          </button>
        )}
        {onExportPreview && (
          <button
            style={{
              ...styles.actionButton,
              ...styles.actionButtonPrimary,
              ...getExportButtonStyle(),
            }}
            onClick={onExportPreview}
            disabled={exportStatus === 'loading'}
          >
            {getExportIcon()} {getExportLabel()}
          </button>
        )}
      </div>

      {/* Skills Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Skills</span>
          <span style={styles.sectionCount}>{skills.length}</span>
        </div>
        {skills.length === 0 ? (
          <span style={styles.emptyText}>No skills defined yet</span>
        ) : (
          <div style={styles.skillsGrid}>
            {skills.map(skill => {
              const roleColor = ROLE_COLORS[skill.role] || ROLE_COLORS.worker;
              const status = getSkillStatus(skill);
              const toolCount = (skill.tools || []).length;
              return (
                <div
                  key={skill.id}
                  style={{
                    ...styles.skillCard,
                    borderLeftColor: roleColor.stroke,
                    borderLeftWidth: '3px',
                    cursor: onNavigate ? 'pointer' : 'default',
                  }}
                  onClick={() => onNavigate && onNavigate('skill', skill.id)}
                >
                  <div style={styles.skillInfo}>
                    <div style={styles.skillName}>{skill.name || skill.id}</div>
                    <div style={styles.skillMeta}>
                      {(skill.role || 'worker').toUpperCase()} · {toolCount} tool{toolCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{
                    ...styles.skillStatus,
                    color: status.status === 'valid' ? '#10b981' : status.status === 'warning' ? '#f59e0b' : '#6b7280',
                  }}>
                    <StatusDot status={status.status} />
                    {status.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grants Section */}
      {(grants.length > 0 || skills.length > 1) && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Grants</span>
            <span style={styles.sectionCount}>{grants.length}</span>
          </div>
          {grants.length === 0 ? (
            <span style={styles.emptyText}>No grants defined</span>
          ) : (
            <div style={styles.grantFlow}>
              {grants.slice(0, 4).map((grant, i) => (
                <div key={grant.key || i} style={styles.grantRow}>
                  {(grant.issued_by || []).slice(0, 1).map(id => (
                    <SkillPill key={id} skillId={id} skillName={skillNames[id]} role={skillRoles[id]} />
                  ))}
                  <span style={styles.grantArrow}>→</span>
                  <span style={styles.grantKey}>{grant.key}</span>
                  <span style={styles.grantArrow}>→</span>
                  {(grant.consumed_by || []).slice(0, 1).map(id => (
                    <SkillPill key={id} skillId={id} skillName={skillNames[id]} role={skillRoles[id]} />
                  ))}
                </div>
              ))}
              {grants.length > 4 && (
                <span style={styles.emptyText}>+{grants.length - 4} more grants</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Handoffs Section */}
      {(handoffs.length > 0 || skills.length > 1) && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Handoffs</span>
            <span style={styles.sectionCount}>{handoffs.length}</span>
          </div>
          {handoffs.length === 0 ? (
            <span style={styles.emptyText}>No handoffs defined</span>
          ) : (
            <div>
              {handoffs.slice(0, 3).map((handoff, i) => (
                <div key={handoff.id || i} style={styles.handoffRow}>
                  <SkillPill skillId={handoff.from} skillName={skillNames[handoff.from]} role={skillRoles[handoff.from]} />
                  <span style={styles.grantArrow}>→</span>
                  <SkillPill skillId={handoff.to} skillName={skillNames[handoff.to]} role={skillRoles[handoff.to]} />
                  {handoff.trigger && (
                    <span style={styles.handoffTrigger}>when: {handoff.trigger}</span>
                  )}
                </div>
              ))}
              {handoffs.length > 3 && (
                <span style={styles.emptyText}>+{handoffs.length - 3} more handoffs</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Routing Section */}
      {Object.keys(routing).length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Routing</span>
            <span style={styles.sectionCount}>{Object.keys(routing).length} channel{Object.keys(routing).length !== 1 ? 's' : ''}</span>
          </div>
          <div>
            {Object.entries(routing).slice(0, 3).map(([channel, config]) => (
              <div key={channel} style={styles.routeRow}>
                <span style={styles.channelBadge}>#{channel}</span>
                <span style={styles.grantArrow}>→</span>
                <SkillPill skillId={config.default_skill} skillName={skillNames[config.default_skill]} role={skillRoles[config.default_skill]} />
              </div>
            ))}
            {Object.keys(routing).length > 3 && (
              <span style={styles.emptyText}>+{Object.keys(routing).length - 3} more routes</span>
            )}
          </div>
        </div>
      )}

      {/* Connectors Section */}
      {connectors.length > 0 && (
        <div style={styles.sectionLast}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Platform Connectors</span>
            <span style={styles.sectionCount}>{connectors.length}</span>
          </div>
          <div style={styles.connectorsList}>
            {connectors.map((conn, i) => (
              <span key={conn.id || i} style={styles.connectorBadge}>
                ⚡ {conn.id || conn}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Security Contracts Summary */}
      {contracts.length > 0 && (
        <div style={styles.sectionLast}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Security Contracts</span>
            <span style={styles.sectionCount}>{contracts.length}</span>
          </div>
          <span style={{ ...styles.emptyText, fontStyle: 'normal' }}>
            {contracts.length} contract{contracts.length !== 1 ? 's' : ''} protecting skill interactions
          </span>
        </div>
      )}
    </div>
  );
}
