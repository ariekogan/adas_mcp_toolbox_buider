/**
 * SolutionVerificationPanel — Verification dashboard for solutions
 *
 * Displays validation status for:
 * - Per-skill validation (tools, prompts, examples)
 * - Grant validation (source/target exist, data types match)
 * - Handoff validation (skills exist, context defined)
 * - Routing validation (channels mapped, no conflicts)
 * - Security validation (contracts defined, no excessive permissions)
 * - Overall deployment readiness score
 */

import { useState, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════
const ROLE_COLORS = {
  gateway: { bg: '#f59e0b20', color: '#f59e0b' },
  worker: { bg: '#3b82f620', color: '#60a5fa' },
  orchestrator: { bg: '#8b5cf620', color: '#a78bfa' },
  approval: { bg: '#10b98120', color: '#34d399' },
};

const STATUS_COLORS = {
  valid: { bg: '#10b98120', color: '#10b981', icon: '✓' },
  warning: { bg: '#f59e0b20', color: '#f59e0b', icon: '⚠' },
  error: { bg: '#ef444420', color: '#ef4444', icon: '✗' },
  info: { bg: '#3b82f620', color: '#60a5fa', icon: 'ℹ' },
};

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
const styles = {
  panel: {
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
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  scoreContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  scoreBar: {
    width: '100px',
    height: '8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  scoreText: {
    fontSize: '13px',
    fontWeight: '600',
    minWidth: '40px',
    textAlign: 'right',
  },
  section: {
    borderBottom: '1px solid var(--border)',
  },
  sectionLast: {
    // no border
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    cursor: 'pointer',
    background: 'transparent',
    transition: 'background 0.15s',
  },
  sectionHeaderHover: {
    background: 'var(--bg-secondary)',
  },
  sectionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionIcon: {
    width: '18px',
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-primary)',
  },
  sectionCount: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
  },
  sectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
  },
  sectionContent: {
    padding: '0 16px 12px 42px',
  },
  issueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  issueItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 10px',
    background: 'var(--bg-tertiary)',
    borderRadius: '6px',
    fontSize: '12px',
  },
  issueIcon: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '600',
  },
  issueContent: {
    flex: 1,
  },
  issueTitle: {
    fontWeight: '500',
    color: 'var(--text-primary)',
    marginBottom: '2px',
  },
  issueDetail: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  skillPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: '500',
    marginRight: '4px',
  },
  emptyState: {
    padding: '12px 16px 16px 42px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
};

// ═══════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════
function StatusIcon({ status }) {
  const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.info;
  return (
    <span style={{
      ...styles.issueIcon,
      background: statusStyle.bg,
      color: statusStyle.color,
    }}>
      {statusStyle.icon}
    </span>
  );
}

function SkillPill({ skillId, role }) {
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.worker;
  return (
    <span style={{
      ...styles.skillPill,
      background: roleColor.bg,
      color: roleColor.color,
    }}>
      {skillId}
    </span>
  );
}

function ValidationSection({ title, icon, items, status, expanded, onToggle }) {
  const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.valid;
  const hasIssues = items.length > 0;
  const [hovering, setHovering] = useState(false);

  return (
    <div style={hasIssues ? styles.section : styles.sectionLast}>
      <div
        style={{
          ...styles.sectionHeader,
          ...(hovering ? styles.sectionHeaderHover : {}),
        }}
        onClick={onToggle}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div style={styles.sectionLeft}>
          <span style={styles.sectionIcon}>{expanded ? '▼' : '▶'}</span>
          <span style={styles.sectionTitle}>{title}</span>
          {items.length > 0 && (
            <span style={styles.sectionCount}>{items.length}</span>
          )}
        </div>
        <div style={styles.sectionStatus}>
          <span style={{
            ...styles.statusBadge,
            background: statusStyle.bg,
            color: statusStyle.color,
          }}>
            {statusStyle.icon}
          </span>
        </div>
      </div>

      {expanded && items.length > 0 && (
        <div style={styles.sectionContent}>
          <div style={styles.issueList}>
            {items.map((item, i) => (
              <div key={i} style={styles.issueItem}>
                <StatusIcon status={item.status} />
                <div style={styles.issueContent}>
                  <div style={styles.issueTitle}>{item.title}</div>
                  {item.detail && (
                    <div style={styles.issueDetail}>{item.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded && items.length === 0 && (
        <div style={styles.emptyState}>All checks passed</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════
export default function SolutionVerificationPanel({ solution, skills = [], validationData }) {
  const [expandedSections, setExpandedSections] = useState({
    skills: true,
    grants: false,
    handoffs: false,
    routing: false,
    security: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Convert backend validation data to our format
  const backendValidation = useMemo(() => {
    if (!validationData) return null;

    // Convert backend issues format to our display format
    const mapIssue = (issue) => ({
      status: issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info',
      title: issue.title,
      detail: issue.detail,
    });

    const allIssues = validationData.issues || [];
    const categories = validationData.categories || {};

    return {
      score: validationData.score || 0,
      status: validationData.status || 'valid',
      skillIssues: (categories.skills?.issues || allIssues.filter(i => i.category === 'skills')).map(mapIssue),
      grantIssues: (categories.grants?.issues || allIssues.filter(i => i.category === 'grants')).map(mapIssue),
      handoffIssues: (categories.handoffs?.issues || allIssues.filter(i => i.category === 'handoffs')).map(mapIssue),
      routingIssues: (categories.routing?.issues || allIssues.filter(i => i.category === 'routing')).map(mapIssue),
      securityIssues: (categories.security?.issues || allIssues.filter(i => i.category === 'security')).map(mapIssue),
      skillStatus: categories.skills?.status || 'valid',
      grantStatus: categories.grants?.status || 'valid',
      handoffStatus: categories.handoffs?.status || 'valid',
      routingStatus: categories.routing?.status || 'valid',
      securityStatus: categories.security?.status || 'valid',
    };
  }, [validationData]);

  // Compute local validation results (fallback when no backend data)
  const localValidation = useMemo(() => {
    if (!solution) return null;

    const skillRoles = {};
    skills.forEach(s => { skillRoles[s.id] = s.role || 'worker'; });

    const grants = solution.grants || [];
    const handoffs = solution.handoffs || [];
    const routing = solution.routing || {};
    const contracts = solution.security_contracts || [];

    // Skill validation
    const skillIssues = [];
    skills.forEach(skill => {
      // Use tools array length, or fall back to tools_count from list endpoint
      const toolCount = (skill.tools || []).length || skill.tools_count || 0;
      const hasPrompt = !!skill.prompt;
      const hasExamples = (skill.example_conversations || []).length > 0;

      if (toolCount === 0) {
        skillIssues.push({
          status: 'warning',
          title: `${skill.name || skill.id}: No tools defined`,
          detail: 'Define at least one tool for this skill',
        });
      }
      if (!hasPrompt) {
        skillIssues.push({
          status: 'warning',
          title: `${skill.name || skill.id}: No system prompt`,
          detail: 'Add a system prompt to guide the skill behavior',
        });
      }
      if (!hasExamples) {
        skillIssues.push({
          status: 'info',
          title: `${skill.name || skill.id}: No example conversations`,
          detail: 'Consider adding examples for better documentation',
        });
      }
    });

    // Grant validation
    const grantIssues = [];
    const skillIds = new Set(skills.map(s => s.id));

    grants.forEach(grant => {
      const issuers = grant.issued_by || [];
      const consumers = grant.consumed_by || [];

      issuers.forEach(id => {
        if (!skillIds.has(id)) {
          grantIssues.push({
            status: 'error',
            title: `Grant "${grant.key}": Invalid issuer`,
            detail: `Skill "${id}" doesn't exist`,
          });
        }
      });

      consumers.forEach(id => {
        if (!skillIds.has(id)) {
          grantIssues.push({
            status: 'error',
            title: `Grant "${grant.key}": Invalid consumer`,
            detail: `Skill "${id}" doesn't exist`,
          });
        }
      });

      if (issuers.length === 0) {
        grantIssues.push({
          status: 'warning',
          title: `Grant "${grant.key}": No issuers`,
          detail: 'Define which skill issues this grant',
        });
      }

      if (consumers.length === 0) {
        grantIssues.push({
          status: 'info',
          title: `Grant "${grant.key}": No consumers`,
          detail: 'Consider defining which skills consume this grant',
        });
      }
    });

    // Handoff validation
    const handoffIssues = [];
    handoffs.forEach(handoff => {
      if (!skillIds.has(handoff.from)) {
        handoffIssues.push({
          status: 'error',
          title: `Handoff: Invalid source "${handoff.from}"`,
          detail: 'Source skill doesn\'t exist',
        });
      }
      if (!skillIds.has(handoff.to)) {
        handoffIssues.push({
          status: 'error',
          title: `Handoff: Invalid target "${handoff.to}"`,
          detail: 'Target skill doesn\'t exist',
        });
      }
      if (!handoff.trigger) {
        handoffIssues.push({
          status: 'warning',
          title: `Handoff ${handoff.from} → ${handoff.to}: No trigger`,
          detail: 'Define when this handoff should occur',
        });
      }
    });

    // Routing validation
    const routingIssues = [];
    Object.entries(routing).forEach(([channel, config]) => {
      if (!config.default_skill) {
        routingIssues.push({
          status: 'error',
          title: `Channel "${channel}": No default skill`,
          detail: 'Each channel needs a default skill',
        });
      } else if (!skillIds.has(config.default_skill)) {
        routingIssues.push({
          status: 'error',
          title: `Channel "${channel}": Invalid skill`,
          detail: `Skill "${config.default_skill}" doesn't exist`,
        });
      }
    });

    if (Object.keys(routing).length === 0 && skills.length > 0) {
      routingIssues.push({
        status: 'warning',
        title: 'No routing configured',
        detail: 'Define channel routing for external access',
      });
    }

    // Security validation
    const securityIssues = [];
    if (contracts.length === 0 && skills.length > 1) {
      securityIssues.push({
        status: 'info',
        title: 'No security contracts defined',
        detail: 'Consider defining contracts for skill interactions',
      });
    }

    contracts.forEach(contract => {
      if (!skillIds.has(contract.consumer)) {
        securityIssues.push({
          status: 'error',
          title: `Contract "${contract.name}": Invalid consumer`,
          detail: `Skill "${contract.consumer}" doesn't exist`,
        });
      }
      if (contract.provider && !skillIds.has(contract.provider)) {
        securityIssues.push({
          status: 'error',
          title: `Contract "${contract.name}": Invalid provider`,
          detail: `Skill "${contract.provider}" doesn't exist`,
        });
      }
    });

    // Calculate overall score
    const errorCount = [
      ...skillIssues.filter(i => i.status === 'error'),
      ...grantIssues.filter(i => i.status === 'error'),
      ...handoffIssues.filter(i => i.status === 'error'),
      ...routingIssues.filter(i => i.status === 'error'),
      ...securityIssues.filter(i => i.status === 'error'),
    ].length;

    const warningCount = [
      ...skillIssues.filter(i => i.status === 'warning'),
      ...grantIssues.filter(i => i.status === 'warning'),
      ...handoffIssues.filter(i => i.status === 'warning'),
      ...routingIssues.filter(i => i.status === 'warning'),
      ...securityIssues.filter(i => i.status === 'warning'),
    ].length;

    let score = 100;
    score -= errorCount * 15;
    score -= warningCount * 5;
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'valid',
      skillIssues,
      grantIssues,
      handoffIssues,
      routingIssues,
      securityIssues,
      skillStatus: skillIssues.some(i => i.status === 'error') ? 'error' : skillIssues.some(i => i.status === 'warning') ? 'warning' : 'valid',
      grantStatus: grantIssues.some(i => i.status === 'error') ? 'error' : grantIssues.some(i => i.status === 'warning') ? 'warning' : 'valid',
      handoffStatus: handoffIssues.some(i => i.status === 'error') ? 'error' : handoffIssues.some(i => i.status === 'warning') ? 'warning' : 'valid',
      routingStatus: routingIssues.some(i => i.status === 'error') ? 'error' : routingIssues.some(i => i.status === 'warning') ? 'warning' : 'valid',
      securityStatus: securityIssues.some(i => i.status === 'error') ? 'error' : securityIssues.some(i => i.status === 'warning') ? 'warning' : securityIssues.length > 0 ? 'info' : 'valid',
    };
  }, [solution, skills]);

  // Use backend validation if available, otherwise fall back to local
  const validation = backendValidation || localValidation;

  if (!solution || !validation) return null;

  const scoreColor = validation.status === 'valid' ? '#10b981' : validation.status === 'warning' ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.panel}>
      {/* Header with score */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span>📋</span>
          <span>Verification</span>
        </div>
        <div style={styles.scoreContainer}>
          <div style={styles.scoreBar}>
            <div style={{
              ...styles.scoreFill,
              width: `${validation.score}%`,
              background: scoreColor,
            }} />
          </div>
          <span style={{
            ...styles.scoreText,
            color: scoreColor,
          }}>
            {validation.score}%
          </span>
        </div>
      </div>

      {/* Validation Sections */}
      <ValidationSection
        title={`Skills (${skills.length})`}
        icon="⚡"
        items={validation.skillIssues}
        status={validation.skillStatus}
        expanded={expandedSections.skills}
        onToggle={() => toggleSection('skills')}
      />

      <ValidationSection
        title={`Grants (${(solution.grants || []).length})`}
        icon="🎫"
        items={validation.grantIssues}
        status={validation.grantStatus}
        expanded={expandedSections.grants}
        onToggle={() => toggleSection('grants')}
      />

      <ValidationSection
        title={`Handoffs (${(solution.handoffs || []).length})`}
        icon="🔄"
        items={validation.handoffIssues}
        status={validation.handoffStatus}
        expanded={expandedSections.handoffs}
        onToggle={() => toggleSection('handoffs')}
      />

      <ValidationSection
        title={`Routing (${Object.keys(solution.routing || {}).length} channels)`}
        icon="📡"
        items={validation.routingIssues}
        status={validation.routingStatus}
        expanded={expandedSections.routing}
        onToggle={() => toggleSection('routing')}
      />

      <ValidationSection
        title={`Security (${(solution.security_contracts || []).length} contracts)`}
        icon="🔒"
        items={validation.securityIssues}
        status={validation.securityStatus}
        expanded={expandedSections.security}
        onToggle={() => toggleSection('security')}
      />
    </div>
  );
}
