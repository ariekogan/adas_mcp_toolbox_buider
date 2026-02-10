/**
 * SolutionPanel — Displays solution-level architecture
 *
 * Five tabs:
 *   1. Overview — Summary card + verification panel
 *   2. Identity — Actor types, roles, admin privileges
 *   3. Team Map — SVG graph of skills, handoffs, and channel entries
 *   4. Architecture — Skills + connectors diagram with links
 *   5. Trust Rules — Verification requirements grouped by skill (Story Mode) + raw table (Advanced)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as api from '../api/client';
import SolutionSummaryCard from './SolutionSummaryCard';
import SolutionVerificationPanel from './SolutionVerificationPanel';
import IdentityConfigPanel from './IdentityConfigPanel';

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    padding: '0 16px',
  },
  tab: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    borderBottom: '2px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
  },
  tabActive: {
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    marginLeft: '8px',
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
};

// ═══════════════════════════════════════════════════════════════
// Role Colors & Icons
// ═══════════════════════════════════════════════════════════════
const ROLE_COLORS = {
  gateway: { bg: '#f59e0b20', color: '#f59e0b', stroke: '#f59e0b' },
  worker: { bg: '#3b82f620', color: '#60a5fa', stroke: '#3b82f6' },
  orchestrator: { bg: '#8b5cf620', color: '#a78bfa', stroke: '#8b5cf6' },
  approval: { bg: '#10b98120', color: '#34d399', stroke: '#10b981' },
};

// SVG icon paths (24x24 viewBox)
const ICONS = {
  shield: 'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 2.18l6 2.25v4.66c0 4.15-2.81 8.04-6 9.07-3.19-1.03-6-4.92-6-9.07V6.43l6-2.25z',
  wrench: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.7 4.7C.6 7.1 1 9.9 3 11.9c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1 0-1.2z',
  hub: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z',
  check: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  telegram: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .54-1.42.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.63-2.87 7.97-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z',
  email: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  api: 'M7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7zM4 3h16c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm0 2v14h16V5H4z',
  lightning: 'M7 2v11h3v9l7-12h-4l4-8z',
  envelope: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  server: 'M4 1h16c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V3c0-1.1.9-2 2-2zm0 10h16c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2zm2-6a1 1 0 100 2 1 1 0 000-2zm0 10a1 1 0 100 2 1 1 0 000-2z',
  plugin: 'M12 2v4H8V2H6v4H4c-1.1 0-2 .9-2 2v4h4v-2h2v2h4v-2h2v2h4V8c0-1.1-.9-2-2-2h-2V2h-2zm-8 12v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6H4z',
};

const ROLE_ICONS = {
  gateway: ICONS.shield,
  worker: ICONS.wrench,
  orchestrator: ICONS.hub,
  approval: ICONS.check,
};

const CHANNEL_ICONS = {
  telegram: ICONS.telegram,
  email: ICONS.email,
  api: ICONS.api,
};

function renderIcon(pathD, color, size = 14) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d={pathD} fill={color} />
    </svg>
  );
}

// SVG icon rendered inside an SVG (as nested <svg>)
function SvgIcon({ pathD, color, x, y, size = 14 }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24">
      <path d={pathD} fill={color} />
    </svg>
  );
}

const TABS = ['Overview', 'Identity', 'Team Map', 'Architecture', 'Trust Rules'];

// ═══════════════════════════════════════════════════════════════
// Shared SVG Defs
// ═══════════════════════════════════════════════════════════════
function SharedDefs() {
  return (
    <defs>
      {/* Dot-grid background pattern */}
      <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="0.8" fill="#6b7280" opacity="0.08" />
      </pattern>

      {/* Arrowhead markers */}
      <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
        <polygon points="0 0, 12 4, 0 8" fill="#4f9cf9" />
      </marker>
      <marker id="arrowhead-muted" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
      </marker>

      {/* Glow filters per role */}
      {Object.entries(ROLE_COLORS).map(([role, colors]) => (
        <filter key={role} id={`glow-${role}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood floodColor={colors.stroke} floodOpacity="0.25" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      ))}

      {/* Handoff gradient arrows per role combination */}
      {Object.entries(ROLE_COLORS).map(([fromRole, fromColors]) =>
        Object.entries(ROLE_COLORS).map(([toRole, toColors]) => (
          <linearGradient key={`grad-${fromRole}-${toRole}`} id={`grad-${fromRole}-${toRole}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={fromColors.stroke} stopOpacity="0.8" />
            <stop offset="100%" stopColor={toColors.stroke} stopOpacity="0.8" />
          </linearGradient>
        ))
      )}
    </defs>
  );
}

// ═══════════════════════════════════════════════════════════════
// Empty State Component
// ═══════════════════════════════════════════════════════════════
function EmptyState({ message = 'No skills defined yet', hint = 'Use the chat to add skills and define your solution.' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)',
    }}>
      <svg viewBox="0 0 140 80" width="140" height="80" style={{ marginBottom: '16px', opacity: 0.25 }}>
        <rect x="5" y="5" width="40" height="24" rx="6" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 2" />
        <rect x="55" y="40" width="40" height="24" rx="6" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 2" />
        <rect x="95" y="5" width="40" height="24" rx="6" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 2" />
        <path d="M 30 29 C 30 38, 70 32, 70 40" fill="none" stroke="#6b7280" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
        <path d="M 110 29 C 110 38, 80 32, 80 40" fill="none" stroke="#6b7280" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
      </svg>
      <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px', color: 'var(--text-secondary)' }}>
        {message}
      </div>
      <div style={{ fontSize: '12px' }}>
        {hint}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tooltip Component
// ═══════════════════════════════════════════════════════════════
function Tooltip({ tooltip, containerRef }) {
  if (!tooltip) return null;

  // Clamp position to stay within container
  const style = {
    position: 'absolute',
    left: `${tooltip.x}px`,
    top: `${tooltip.y}px`,
    transform: 'translate(-50%, 8px)',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 14px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    zIndex: 10,
    pointerEvents: 'none',
    maxWidth: '280px',
    lineHeight: '1.5',
    whiteSpace: 'nowrap',
  };

  return <div style={style}>{tooltip.content}</div>;
}

// ═══════════════════════════════════════════════════════════════
// Legend Component
// ═══════════════════════════════════════════════════════════════
function Legend({ items }) {
  return (
    <div style={{
      position: 'absolute', bottom: '12px', right: '12px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '8px 12px',
      fontSize: '10px', color: 'var(--text-muted)',
      display: 'flex', flexDirection: 'column', gap: '5px',
      zIndex: 5, opacity: 0.85,
    }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {item.icon}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════
export default function SolutionPanel({ solution, sidebarSkills = [], onNavigate, onSolutionUpdate, onFocusChange }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [trustRulesFilter, setTrustRulesFilter] = useState(null);
  const [mapHighlight, setMapHighlight] = useState(null);

  if (!solution) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>Select a solution to view its architecture</div>
      </div>
    );
  }

  const skills = solution.skills || [];
  const grants = solution.grants || [];
  const handoffs = solution.handoffs || [];
  const routing = solution.routing || {};
  const contracts = solution.security_contracts || [];
  const connectors = solution.platform_connectors || [];

  // Enrich solution skills with connector data from sidebar skills (fuzzy name match)
  const enrichedSkills = useMemo(() => {
    if (!sidebarSkills || sidebarSkills.length === 0) return skills;

    const norm = (str) => str.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

    // Build lookup: normalized name/id → connectors[]
    const lookup = {};
    sidebarSkills.forEach(ss => {
      if (ss.connectors && ss.connectors.length > 0) {
        lookup[norm(ss.name)] = ss.connectors;
        lookup[norm(ss.id)] = ss.connectors;
      }
    });

    // Token prefix match (ops→operations, orch→orchestrator, etc.)
    const tokenMatch = (a, b) => a === b || a.startsWith(b) || b.startsWith(a);

    // Find matching sidebar connectors for a solution skill
    const findSidebarConns = (skillId) => {
      const nId = norm(skillId);
      if (lookup[nId]) return lookup[nId];
      for (const [key, conns] of Object.entries(lookup)) {
        if (key.includes(nId) || nId.includes(key)) return conns;
      }
      // Token overlap: a single significant token match is enough (e.g. "returns" in "returns ops" matches "returns operations")
      const idTokens = nId.split(' ').filter(t => t.length > 2);
      for (const [key, conns] of Object.entries(lookup)) {
        const keyTokens = key.split(' ').filter(t => t.length > 2);
        const overlap = idTokens.filter(t => keyTokens.some(kt => tokenMatch(t, kt))).length;
        if (overlap >= 1) return conns;
      }
      return [];
    };

    return skills.map(s => {
      const sidebarConns = findSidebarConns(s.id);
      const existing = s.connectors || [];
      // Merge: union of solution connectors + sidebar connectors
      const merged = [...new Set([...existing, ...sidebarConns])];
      return merged.length > 0 ? { ...s, connectors: merged } : s;
    });
  }, [skills, sidebarSkills]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>★ {solution.name}</div>
        <div style={styles.subtitle}>
          {skills.length} skills · {grants.length} verifications · {handoffs.length} handoffs
        </div>
      </div>

      <div style={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
            onClick={() => {
              setActiveTab(tab);
              onFocusChange?.({ tab });
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === 'Overview' && (
          <OverviewView solution={solution} solutionSkills={skills} sidebarSkills={sidebarSkills} onNavigate={onNavigate} />
        )}
        {activeTab === 'Identity' && (
          <IdentityConfigPanel
            identity={solution.identity || {}}
            onUpdate={async (updates) => {
              try {
                await api.updateSolution(solution.id, updates);
                if (onSolutionUpdate) onSolutionUpdate();
              } catch (err) {
                console.error('[SolutionPanel] Identity update failed:', err);
              }
            }}
          />
        )}
        {activeTab === 'Team Map' && (
          <TopologyView skills={enrichedSkills} handoffs={handoffs} routing={routing} grants={grants} contracts={contracts} onSelectSkill={(skillId) => {
            setActiveTab('Trust Rules');
            setTrustRulesFilter(skillId);
          }} />
        )}
        {activeTab === 'Architecture' && (
          <ArchitectureView skills={enrichedSkills} connectors={connectors} handoffs={handoffs} />
        )}
        {activeTab === 'Trust Rules' && (
          <TrustRulesView grants={grants} contracts={contracts} skills={skills} handoffs={handoffs} filterSkillId={trustRulesFilter} onClearFilter={() => setTrustRulesFilter(null)} onHighlightInMap={(skillIds) => {
            setActiveTab('Team Map');
            setMapHighlight(skillIds);
          }} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 1: Overview — Summary + Verification
// ═══════════════════════════════════════════════════════════════
function OverviewView({ solution, solutionSkills, sidebarSkills, onNavigate }) {
  const [validationStatus, setValidationStatus] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [qualityData, setQualityData] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleValidate = useCallback(async () => {
    if (!solution?.id || isValidating) return;

    setIsValidating(true);
    try {
      // Use full validation report which includes intelligent LLM analysis
      const response = await api.getSolutionValidationReport(solution.id);
      const report = response.report;

      // Extract validation summary for status
      const status = report.summary?.status || 'valid';
      setValidationStatus(status);
      setValidationData(report);

      // Extract quality data from level_3_intelligent
      if (report.level_3_intelligent?.overall_score) {
        setQualityData(report.level_3_intelligent);
      }
    } catch (err) {
      console.error('Validation failed:', err);
      setValidationStatus('error');
    } finally {
      setIsValidating(false);
    }
  }, [solution?.id, isValidating]);

  const handleExportReport = useCallback(async () => {
    if (!solution?.id || isExporting) return;

    setIsExporting(true);
    try {
      // Fetch the full validation report (includes intelligent analysis)
      const response = await api.getSolutionValidationReport(solution.id);
      const report = response.report;

      // Extract quality data from level_3_intelligent
      if (report.level_3_intelligent?.overall_score) {
        setQualityData(report.level_3_intelligent);
      }

      // Download as JSON file
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${solution.name || solution.id}-validation-report.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export validation report');
    } finally {
      setIsExporting(false);
    }
  }, [solution?.id, solution?.name, isExporting]);

  if (!solution) {
    return <EmptyState message="No solution selected" hint="Select or create a solution to see its overview." />;
  }

  // Use solution.skills for topology display (semantic IDs like 'identity-assurance')
  // Use sidebarSkills for implementation details (database skills with tools/connectors)
  return (
    <div>
      <SolutionSummaryCard
        solution={solution}
        skills={solutionSkills}
        onNavigate={onNavigate}
        onValidate={handleValidate}
        onExportPreview={handleExportReport}
        validationStatus={isValidating ? 'loading' : validationStatus}
        exportStatus={isExporting ? 'loading' : null}
      />
      <SolutionVerificationPanel
        solution={solution}
        skills={sidebarSkills}
        validationData={validationData}
        qualityData={qualityData}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 2: Team Map — SVG skill graph
// ═══════════════════════════════════════════════════════════════
function TopologyView({ skills, handoffs, routing, grants, contracts, onSelectSkill }) {
  const containerRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);

  // Build skill name lookup
  const skillNameMap = {};
  const skillRoleMap = {};
  skills.forEach(s => {
    skillNameMap[s.id] = s.name || s.id;
    skillRoleMap[s.id] = s.role || 'worker';
  });

  // Build grant description lookup
  const grantDescriptions = {};
  (grants || []).forEach(g => { grantDescriptions[g.key] = g.description || g.key; });

  // Get contracts for a given skill
  const getSkillContracts = (skillId) => (contracts || []).filter(c => c.consumer === skillId);

  // Describe a rule in plain English (same logic as TrustRulesView)
  const describeRuleShort = (contract) => {
    const providerName = skillNameMap[contract.provider] || contract.provider || 'another skill';
    const toolNames = (contract.for_tools || []).map(t => {
      const parts = t.split('.');
      return parts[parts.length - 1].replace(/_/g, ' ');
    });
    const toolsText = toolNames.length > 0 ? toolNames.join(', ') : 'sensitive actions';
    const validation = contract.validation || '';
    const levelMatch = validation.match(/[Ll](?:evel\s*)?(\d+)/);
    if (levelMatch) {
      return `${toolsText} requires Level ${levelMatch[1]}+ from ${providerName}`;
    }
    return `${toolsText} requires verification from ${providerName}`;
  };

  if (skills.length === 0) {
    return <EmptyState message="No skills defined yet" hint="Start a conversation to add skills and define your topology." />;
  }

  // Layout: arrange by role rows
  const ROW_ORDER = ['gateway', 'orchestrator', 'worker', 'approval'];
  const rows = {};
  ROW_ORDER.forEach(r => rows[r] = []);
  skills.forEach(s => {
    const role = s.role || 'worker';
    if (!rows[role]) rows[role] = [];
    rows[role].push(s);
  });

  // Node dimensions (bigger for richer content)
  const NODE_W = 184, NODE_H = 94, PAD_X = 60, PAD_Y = 110;
  const CHANNEL_ROW_H = 60;

  // Compute positions
  const nodePositions = {};
  let y = CHANNEL_ROW_H;
  let maxRowWidth = 0;
  const activeRows = ROW_ORDER.filter(r => rows[r].length > 0);

  activeRows.forEach(role => {
    const row = rows[role];
    const rowWidth = row.length * NODE_W + (row.length - 1) * PAD_X;
    if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
    row.forEach((skill, i) => {
      nodePositions[skill.id] = {
        x: i * (NODE_W + PAD_X),
        y: y,
        role: skill.role || 'worker',
      };
    });
    y += NODE_H + PAD_Y;
  });

  // Center rows horizontally
  activeRows.forEach(role => {
    const row = rows[role];
    const rowWidth = row.length * NODE_W + (row.length - 1) * PAD_X;
    const offset = (maxRowWidth - rowWidth) / 2;
    row.forEach(skill => {
      nodePositions[skill.id].x += offset;
    });
  });

  const svgW = maxRowWidth + 60;
  const svgH = y + 30;

  // Channel entry points
  const channelEntries = Object.entries(routing).map(([channel, config]) => ({
    channel,
    targetSkill: config.default_skill,
  }));

  // Handlers
  const handleNodeEnter = (skill, pos, e) => {
    setHoveredNode(skill.id);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const channels = (skill.entry_channels || []).join(', ');
      const connCount = (skill.connectors || []).length;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        content: (
          <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{skill.name || skill.id}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Role: <span style={{ color: (ROLE_COLORS[skill.role] || ROLE_COLORS.worker).color }}>{(skill.role || 'worker').toUpperCase()}</span>
            </div>
            {skill.description && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{skill.description}</div>
            )}
            {channels && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Channels: {channels}</div>
            )}
            {connCount > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Connectors: {connCount}</div>
            )}
          </div>
        ),
      });
    }
  };

  // Build skill name lookup for handoff tooltips
  const skillNames = {};
  skills.forEach(s => { skillNames[s.id] = s.name || s.id; });

  const handleEdgeEnter = (handoff, midX, midY, e) => {
    setHoveredEdge(handoff.id);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const grantsText = (handoff.grants_passed || []).map(g => g.split('.').pop()).join(', ');
      const droppedText = (handoff.grants_dropped || []).map(g => g.split('.').pop()).join(', ');
      const fromName = skillNames[handoff.from] || handoff.from;
      const toName = skillNames[handoff.to] || handoff.to;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        content: (
          <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{fromName} → {toName}</div>
            {handoff.trigger && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Trigger: {handoff.trigger}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Mechanism: {handoff.mechanism === 'handoff-controller-mcp' ? 'Live handoff' : handoff.mechanism || 'internal'}
            </div>
            {grantsText && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Grants: {grantsText}</div>
            )}
            {droppedText && (
              <div style={{ fontSize: '11px', color: 'var(--error)' }}>Dropped: {droppedText}</div>
            )}
          </div>
        ),
      });
    }
  };

  const handleLeave = () => {
    setHoveredNode(null);
    setHoveredEdge(null);
    setTooltip(null);
  };

  // Legend items
  const legendItems = [
    ...Object.entries(ROLE_COLORS).map(([role, colors]) => ({
      icon: <span style={{ width: 10, height: 10, borderRadius: '50%', background: colors.stroke, display: 'inline-block' }} />,
      label: role.charAt(0).toUpperCase() + role.slice(1),
    })),
    {
      icon: <span style={{ width: 16, height: 0, borderTop: '2px solid #4f9cf9', display: 'inline-block' }} />,
      label: 'Live handoff',
    },
    {
      icon: <span style={{ width: 16, height: 0, borderTop: '2px dashed #6b7280', display: 'inline-block' }} />,
      label: 'Channel entry',
    },
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'auto' }}>
      <svg
        width="100%"
        viewBox={`-30 -10 ${svgW} ${svgH}`}
        style={{ minHeight: '300px' }}
      >
        <SharedDefs />

        {/* Background grid */}
        <rect x="-30" y="-10" width={svgW} height={svgH} fill="url(#dot-grid)" />

        {/* Channel entry arrows from top */}
        {channelEntries.map(({ channel, targetSkill }) => {
          const target = nodePositions[targetSkill];
          if (!target) return null;
          const targetRole = target.role || 'worker';
          const roleColor = ROLE_COLORS[targetRole] || ROLE_COLORS.worker;
          const tx = target.x + NODE_W / 2;
          const ty = target.y;
          const isHighlighted = hoveredNode === targetSkill;

          // Spread channels evenly across node width
          const channelIdx = channelEntries.filter(ce => ce.targetSkill === targetSkill).indexOf(
            channelEntries.find(ce => ce.channel === channel && ce.targetSkill === targetSkill)
          );
          const channelCount = channelEntries.filter(ce => ce.targetSkill === targetSkill).length;
          const spread = Math.min(60, (NODE_W - 40) / Math.max(channelCount, 1));
          const cx = target.x + NODE_W / 2 + (channelIdx - (channelCount - 1) / 2) * spread;

          return (
            <g key={`ch-${channel}`} opacity={isHighlighted ? 1 : 0.6}>
              {/* Channel icon in circle */}
              <circle cx={cx} cy={14} r={14} fill="var(--bg-card)" stroke={isHighlighted ? roleColor.stroke : 'var(--border)'} strokeWidth="1.5" />
              <SvgIcon pathD={CHANNEL_ICONS[channel] || ICONS.api} color={isHighlighted ? roleColor.color : '#6b7280'} x={cx - 7} y={7} size={14} />
              <text x={cx} y={38} textAnchor="middle" fontSize="9" fontWeight="500" fill={isHighlighted ? roleColor.color : '#6b7280'}>
                {channel}
              </text>
              <line
                x1={cx} y1={42}
                x2={tx} y2={ty}
                stroke={isHighlighted ? roleColor.stroke : '#6b7280'}
                strokeWidth={isHighlighted ? 2 : 1.5}
                strokeDasharray={isHighlighted ? 'none' : '4 3'}
                markerEnd="url(#arrowhead-muted)"
                opacity={isHighlighted ? 0.8 : 0.4}
              />
            </g>
          );
        })}

        {/* Handoff arrows */}
        {handoffs.map(handoff => {
          const from = nodePositions[handoff.from];
          const to = nodePositions[handoff.to];
          if (!from || !to) return null;

          const fromRole = from.role || 'worker';
          const toRole = to.role || 'worker';
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const midY = (y1 + y2) / 2;
          const midX = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

          const isEdgeHovered = hoveredEdge === handoff.id;
          const isRelatedNode = hoveredNode === handoff.from || hoveredNode === handoff.to;
          const isHighlighted = isEdgeHovered || isRelatedNode;
          const isAnyHover = hoveredNode || hoveredEdge;
          const dimmed = isAnyHover && !isHighlighted;

          const grantsCount = (handoff.grants_passed || []).length;
          const grantsLabel = grantsCount > 0
            ? (isHighlighted
              ? (handoff.grants_passed || []).map(g => g.split('.').pop()).join(', ')
              : `${grantsCount} grant${grantsCount > 1 ? 's' : ''}`)
            : '';

          const isLive = handoff.mechanism === 'handoff-controller-mcp';

          return (
            <g
              key={handoff.id}
              onMouseEnter={(e) => handleEdgeEnter(handoff, midX, midY, e)}
              onMouseLeave={handleLeave}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible wider hit area */}
              <path d={path} fill="none" stroke="transparent" strokeWidth="16" />

              {/* Visible arrow */}
              <path
                d={path}
                fill="none"
                stroke={`url(#grad-${fromRole}-${toRole})`}
                strokeWidth={isHighlighted ? 3 : 2}
                markerEnd="url(#arrowhead)"
                opacity={dimmed ? 0.15 : (isHighlighted ? 0.9 : 0.6)}
                style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
              />

              {/* Mechanism badge at midpoint */}
              <circle
                cx={midX} cy={midY} r={isHighlighted ? 10 : 8}
                fill="var(--bg-card)"
                stroke={isLive ? '#4f9cf9' : '#6b7280'}
                strokeWidth="1.5"
                strokeDasharray={isLive ? 'none' : '3 2'}
                opacity={dimmed ? 0.15 : 1}
                style={{ transition: 'opacity 0.2s' }}
              />
              <SvgIcon
                pathD={isLive ? ICONS.lightning : ICONS.envelope}
                color={dimmed ? '#6b728040' : (isLive ? '#4f9cf9' : '#6b7280')}
                x={midX - 6} y={midY - 6} size={12}
              />

              {/* Grant label */}
              {grantsLabel && (
                <text
                  x={midX + (isHighlighted ? 14 : 12)}
                  y={midY + 4}
                  fontSize={isHighlighted ? '10' : '9'}
                  fill={dimmed ? '#6b728040' : 'var(--text-muted)'}
                  fontFamily={isHighlighted ? 'monospace' : 'inherit'}
                  style={{ transition: 'opacity 0.2s' }}
                >
                  {grantsLabel}
                </text>
              )}

              {/* Trigger label on hover */}
              {isHighlighted && handoff.trigger && (
                <text
                  x={midX}
                  y={midY - 16}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="500"
                  fill="var(--text-secondary)"
                >
                  {handoff.trigger}
                </text>
              )}
            </g>
          );
        })}

        {/* Skill nodes */}
        {skills.map(skill => {
          const pos = nodePositions[skill.id];
          if (!pos) return null;
          const roleColor = ROLE_COLORS[pos.role] || ROLE_COLORS.worker;
          const isHovered = hoveredNode === skill.id;
          const isAnyHover = hoveredNode || hoveredEdge;
          // Highlight if this node is hovered or is part of a hovered edge
          const isRelatedEdge = hoveredEdge && handoffs.some(h =>
            h.id === hoveredEdge && (h.from === skill.id || h.to === skill.id)
          );
          const isHighlighted = isHovered || isRelatedEdge;
          const dimmed = isAnyHover && !isHighlighted;

          const channels = skill.entry_channels || [];
          const connCount = (skill.connectors || []).length;
          // Use skill.name if available, otherwise fall back to skill.id
          const skillLabel = skill.name || skill.id;
          const displayName = skillLabel.length > 20 ? skillLabel.slice(0, 18) + '...' : skillLabel;
          const desc = skill.description
            ? (skill.description.length > 35 ? skill.description.slice(0, 33) + '...' : skill.description)
            : '';

          const isSelected = selectedSkill === skill.id;

          return (
            <g
              key={skill.id}
              filter={isHovered ? `url(#glow-${pos.role})` : 'none'}
              onMouseEnter={(e) => handleNodeEnter(skill, pos, e)}
              onMouseLeave={handleLeave}
              onClick={() => setSelectedSkill(isSelected ? null : skill.id)}
              style={{ cursor: 'pointer' }}
              opacity={dimmed ? 0.3 : 1}
            >
              {/* Main rect */}
              <rect
                x={pos.x} y={pos.y}
                width={NODE_W} height={NODE_H}
                rx="12" ry="12"
                fill="var(--bg-card)"
                stroke={isSelected ? 'var(--accent)' : roleColor.stroke}
                strokeWidth={isHovered ? 2.5 : 2}
              />

              {/* Divider line between header and description */}
              <line
                x1={pos.x + 10} y1={pos.y + 42}
                x2={pos.x + NODE_W - 10} y2={pos.y + 42}
                stroke={roleColor.stroke} strokeWidth="0.5" opacity="0.3"
              />

              {/* Role icon */}
              <SvgIcon
                pathD={ROLE_ICONS[pos.role] || ICONS.wrench}
                color={roleColor.color}
                x={pos.x + 10} y={pos.y + 10} size={16}
              />

              {/* Skill name */}
              <text
                x={pos.x + 30}
                y={pos.y + 22}
                fontSize="12"
                fontWeight="600"
                fill="var(--text-primary)"
              >
                {displayName}
              </text>

              {/* Role badge */}
              <rect
                x={pos.x + 30}
                y={pos.y + 27}
                width={((skill.role || 'worker').length * 6) + 10}
                height="14"
                rx="3"
                fill={roleColor.bg}
              />
              <text
                x={pos.x + 35}
                y={pos.y + 37}
                fontSize="8"
                fontWeight="600"
                fill={roleColor.color}
              >
                {(skill.role || 'worker').toUpperCase()}
              </text>

              {/* Description */}
              {desc && (
                <text
                  x={pos.x + 10}
                  y={pos.y + 56}
                  fontSize="10"
                  fill="#6b7280"
                >
                  {desc}
                </text>
              )}

              {/* Channel badges */}
              {channels.map((ch, i) => (
                <g key={ch}>
                  <rect
                    x={pos.x + 10 + i * 52}
                    y={pos.y + 64}
                    width="48" height="16"
                    rx="4"
                    fill="var(--bg-tertiary)"
                    opacity="0.5"
                  />
                  <SvgIcon
                    pathD={CHANNEL_ICONS[ch] || ICONS.api}
                    color="#9ca3af"
                    x={pos.x + 12 + i * 52} y={pos.y + 65} size={12}
                  />
                  <text
                    x={pos.x + 26 + i * 52}
                    y={pos.y + 76}
                    fontSize="8"
                    fill="#9ca3af"
                  >
                    {ch.length > 5 ? ch.slice(0, 5) : ch}
                  </text>
                </g>
              ))}

              {/* Connector count badge (top-right corner) */}
              {connCount > 0 && (
                <g>
                  <circle
                    cx={pos.x + NODE_W - 12}
                    cy={pos.y + 12}
                    r={9}
                    fill="var(--bg-tertiary)"
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text
                    x={pos.x + NODE_W - 12}
                    y={pos.y + 16}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="var(--text-muted)"
                  >
                    {connCount}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      <Tooltip tooltip={tooltip} containerRef={containerRef} />

      {/* Legend */}
      <Legend items={legendItems} />

      {/* Skill detail panel (trust rules summary) */}
      {selectedSkill && (() => {
        const skill = skills.find(s => s.id === selectedSkill);
        if (!skill) return null;
        const roleColor = ROLE_COLORS[skill.role || 'worker'] || ROLE_COLORS.worker;
        const skillContracts = getSkillContracts(selectedSkill);
        const displayName = skillNameMap[selectedSkill] || selectedSkill;

        return (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '280px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            zIndex: 20,
            overflow: 'hidden',
          }}>
            {/* Header with close button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              background: `${roleColor.stroke}08`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px', height: '8px',
                  borderRadius: '50%', background: roleColor.stroke,
                }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {displayName}
                </span>
              </div>
              <button
                onClick={() => setSelectedSkill(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '16px', color: 'var(--text-muted)', padding: '0 4px',
                  lineHeight: '1',
                }}
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Trust rules for this skill */}
            <div style={{ padding: '8px 14px 12px', maxHeight: '300px', overflow: 'auto' }}>
              {skillContracts.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
                  No verification rules for this skill
                </div>
              ) : (
                <>
                  <div style={{
                    fontSize: '10px', fontWeight: '600',
                    color: 'var(--text-muted)', textTransform: 'uppercase',
                    letterSpacing: '0.5px', marginBottom: '8px',
                  }}>
                    Trust Rules
                  </div>
                  {skillContracts.map((contract, i) => (
                    <div key={i} style={{
                      padding: '8px 0',
                      borderBottom: i < skillContracts.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      lineHeight: '1.5',
                    }}>
                      {describeRuleShort(contract)}
                    </div>
                  ))}
                </>
              )}

              {/* Link to full Trust Rules tab */}
              <button
                onClick={() => onSelectSkill && onSelectSkill(selectedSkill)}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: '500',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                View all rules for {displayName}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 2: Architecture — Pure SVG Skills + Connectors diagram
// ═══════════════════════════════════════════════════════════════
function ArchitectureView({ skills, connectors, handoffs }) {
  const [hoveredSkill, setHoveredSkill] = useState(null);
  const [hoveredConnector, setHoveredConnector] = useState(null);

  if (skills.length === 0) {
    return <EmptyState message="No skills defined yet" hint="Start a conversation to add skills and view the architecture." />;
  }

  // Derive all connectors
  const platformIds = new Set(connectors.map(c => c.id));
  const customConnectorIds = new Set();
  skills.forEach(s => {
    (s.connectors || []).forEach(cId => {
      if (!platformIds.has(cId)) customConnectorIds.add(cId);
    });
  });
  const platformList = connectors;
  const CONNECTOR_LABELS = {
    'orders-mcp': 'Order management',
    'fulfillment-mcp': 'Fulfillment tracking',
    'support-mcp': 'Support tickets',
    'returns-mcp': 'Returns processing',
    'identity-mcp': 'Identity verification',
    'handoff-controller-mcp': 'Handoff sessions',
  };
  const customList = [...customConnectorIds].map(id => ({ id, description: CONNECTOR_LABELS[id] || 'Custom connector' }));
  const allConnectors = [...platformList, ...customList];

  // Count how many skills use each connector
  const connectorUsage = {};
  allConnectors.forEach(c => { connectorUsage[c.id] = 0; });
  skills.forEach(s => {
    (s.connectors || []).forEach(cId => {
      connectorUsage[cId] = (connectorUsage[cId] || 0) + 1;
    });
  });

  // Layout constants
  const SKILL_W = 184, SKILL_H = 100;
  const CONN_W = 160, CONN_H = 65;
  const SKILL_GAP = 30, CONN_GAP = 24;
  const VERTICAL_GAP = 140;
  const HEADER_H = 30;
  const TOP_PAD = 20;

  // Compute skill positions (top row, centered)
  const skillRowWidth = skills.length * SKILL_W + (skills.length - 1) * SKILL_GAP;
  const connRowWidth = allConnectors.length * CONN_W + (allConnectors.length - 1) * CONN_GAP;
  const totalWidth = Math.max(skillRowWidth, connRowWidth, 400) + 60;
  const skillRowY = TOP_PAD + HEADER_H;
  const connRowY = skillRowY + SKILL_H + VERTICAL_GAP + HEADER_H;
  const totalHeight = connRowY + CONN_H + 40;

  const skillPositions = {};
  const skillRowOffset = (totalWidth - skillRowWidth) / 2;
  skills.forEach((skill, i) => {
    skillPositions[skill.id] = {
      x: skillRowOffset + i * (SKILL_W + SKILL_GAP),
      y: skillRowY,
    };
  });

  const connPositions = {};
  const connRowOffset = (totalWidth - connRowWidth) / 2;
  allConnectors.forEach((conn, i) => {
    connPositions[conn.id] = {
      x: connRowOffset + i * (CONN_W + CONN_GAP),
      y: connRowY,
    };
  });

  // Compute connection lines
  const lines = [];
  skills.forEach(skill => {
    const sPos = skillPositions[skill.id];
    if (!sPos) return;
    (skill.connectors || []).forEach(cId => {
      const cPos = connPositions[cId];
      if (!cPos) return;
      const isPlatform = platformIds.has(cId);
      lines.push({
        sx: sPos.x + SKILL_W / 2,
        sy: sPos.y + SKILL_H,
        cx: cPos.x + CONN_W / 2,
        cy: cPos.y,
        isPlatform,
        skillId: skill.id,
        connId: cId,
      });
    });
  });

  // Hover logic
  const isLineHighlighted = (line) => {
    if (hoveredSkill && line.skillId === hoveredSkill) return true;
    if (hoveredConnector && line.connId === hoveredConnector) return true;
    return false;
  };

  const isAnyHover = hoveredSkill || hoveredConnector;

  // Legend items
  const legendItems = [];
  if (platformList.length > 0) {
    legendItems.push({
      icon: <span style={{ width: 16, height: 0, borderTop: '2px solid #14b8a6', display: 'inline-block' }} />,
      label: 'Platform connector',
    });
  }
  if (customList.length > 0) {
    legendItems.push({
      icon: <span style={{ width: 16, height: 0, borderTop: '2px dashed #f59e0b', display: 'inline-block' }} />,
      label: 'Custom connector',
    });
  }
  Object.entries(ROLE_COLORS).forEach(([role, colors]) => {
    if (skills.some(s => (s.role || 'worker') === role)) {
      legendItems.push({
        icon: <span style={{ width: 10, height: 10, borderRadius: '2px', background: colors.stroke, display: 'inline-block' }} />,
        label: role.charAt(0).toUpperCase() + role.slice(1),
      });
    }
  });

  return (
    <div style={{ position: 'relative', overflow: 'auto' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        style={{ minHeight: '400px' }}
      >
        <SharedDefs />

        {/* Background grid */}
        <rect width={totalWidth} height={totalHeight} fill="url(#dot-grid)" />

        {/* Section header: SKILLS */}
        <text x={30} y={TOP_PAD + 14} fontSize="11" fontWeight="600" fill="#6b7280" letterSpacing="0.5" style={{ textTransform: 'uppercase' }}>
          SKILLS
        </text>
        <line x1={75} y1={TOP_PAD + 10} x2={totalWidth - 30} y2={TOP_PAD + 10} stroke="#6b7280" strokeWidth="0.5" opacity="0.3" />

        {/* Section header: CONNECTORS */}
        {allConnectors.length > 0 && (
          <>
            <text x={30} y={connRowY - HEADER_H + 14} fontSize="11" fontWeight="600" fill="#6b7280" letterSpacing="0.5">
              CONNECTORS
            </text>
            <line x1={115} y1={connRowY - HEADER_H + 10} x2={totalWidth - 30} y2={connRowY - HEADER_H + 10} stroke="#6b7280" strokeWidth="0.5" opacity="0.3" />
          </>
        )}

        {/* Connection lines (behind cards) */}
        {lines.map((line, i) => {
          const highlighted = isLineHighlighted(line);
          const dimmed = isAnyHover && !highlighted;
          const midY = (line.sy + line.cy) / 2;
          const path = `M ${line.sx} ${line.sy} C ${line.sx} ${midY}, ${line.cx} ${midY}, ${line.cx} ${line.cy}`;

          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={line.isPlatform ? '#14b8a6' : '#f59e0b'}
              strokeWidth={highlighted ? 2.5 : 1.5}
              opacity={dimmed ? 0.08 : (highlighted ? 0.85 : 0.35)}
              strokeDasharray={line.isPlatform ? 'none' : '6 4'}
              style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
            />
          );
        })}

        {/* Skill cards */}
        {skills.map(skill => {
          const sPos = skillPositions[skill.id];
          if (!sPos) return null;
          const roleColor = ROLE_COLORS[skill.role] || ROLE_COLORS.worker;
          const isHovered = hoveredSkill === skill.id;
          const isConnectedToHoveredConn = hoveredConnector && (skill.connectors || []).includes(hoveredConnector);
          const isHighlighted = isHovered || isConnectedToHoveredConn;
          const dimmed = isAnyHover && !isHighlighted;

          const channels = skill.entry_channels || [];
          const connCount = (skill.connectors || []).length;
          // Use skill.name if available, otherwise fall back to skill.id
          const skillLabel = skill.name || skill.id;
          const displayName = skillLabel.length > 20 ? skillLabel.slice(0, 18) + '...' : skillLabel;
          const desc = skill.description
            ? (skill.description.length > 40 ? skill.description.slice(0, 38) + '...' : skill.description)
            : '';

          return (
            <g
              key={skill.id}
              filter={isHovered ? `url(#glow-${skill.role || 'worker'})` : 'none'}
              onMouseEnter={() => setHoveredSkill(skill.id)}
              onMouseLeave={() => setHoveredSkill(null)}
              style={{ cursor: 'pointer' }}
              opacity={dimmed ? 0.3 : 1}
            >
              {/* Card background */}
              <rect
                x={sPos.x} y={sPos.y}
                width={SKILL_W} height={SKILL_H}
                rx="10" ry="10"
                fill="var(--bg-card)"
                stroke={roleColor.stroke}
                strokeWidth={isHovered ? 2.5 : 2}
              />

              {/* Left accent bar */}
              <rect
                x={sPos.x} y={sPos.y + 10}
                width="4" height={SKILL_H - 20}
                rx="2"
                fill={roleColor.stroke}
              />

              {/* Role icon */}
              <SvgIcon
                pathD={ROLE_ICONS[skill.role] || ICONS.wrench}
                color={roleColor.color}
                x={sPos.x + 14} y={sPos.y + 10} size={16}
              />

              {/* Skill name */}
              <text x={sPos.x + 34} y={sPos.y + 23} fontSize="12" fontWeight="600" fill="var(--text-primary)">
                {displayName}
              </text>

              {/* Role badge */}
              <rect
                x={sPos.x + 14}
                y={sPos.y + 30}
                width={((skill.role || 'worker').length * 6) + 10}
                height="14"
                rx="3"
                fill={roleColor.bg}
              />
              <text x={sPos.x + 19} y={sPos.y + 40} fontSize="8" fontWeight="600" fill={roleColor.color}>
                {(skill.role || 'worker').toUpperCase()}
              </text>

              {/* Description */}
              {desc && (
                <text x={sPos.x + 14} y={sPos.y + 60} fontSize="10" fill="#6b7280">
                  {desc}
                </text>
              )}

              {/* Bottom row: channels + connector count */}
              {channels.length > 0 && channels.map((ch, i) => (
                <g key={ch}>
                  <rect x={sPos.x + 14 + i * 48} y={sPos.y + 72} width="44" height="16" rx="4" fill="var(--bg-tertiary)" opacity="0.5" />
                  <SvgIcon pathD={CHANNEL_ICONS[ch] || ICONS.api} color="#9ca3af" x={sPos.x + 16 + i * 48} y={sPos.y + 73} size={12} />
                  <text x={sPos.x + 30 + i * 48} y={sPos.y + 84} fontSize="8" fill="#9ca3af">
                    {ch.length > 4 ? ch.slice(0, 4) : ch}
                  </text>
                </g>
              ))}

              {connCount > 0 && (
                <g>
                  <circle cx={sPos.x + SKILL_W - 16} cy={sPos.y + SKILL_H - 16} r={10} fill="var(--bg-tertiary)" stroke="var(--border)" strokeWidth="1" />
                  <text x={sPos.x + SKILL_W - 16} y={sPos.y + SKILL_H - 12} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-muted)">
                    {connCount}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Connector cards */}
        {allConnectors.map(conn => {
          const cPos = connPositions[conn.id];
          if (!cPos) return null;
          const isPlatform = platformIds.has(conn.id);
          const color = isPlatform ? '#14b8a6' : '#f59e0b';
          const isHovered = hoveredConnector === conn.id;
          const isConnectedToHoveredSkill = hoveredSkill && skills.some(s =>
            s.id === hoveredSkill && (s.connectors || []).includes(conn.id)
          );
          const isHighlighted = isHovered || isConnectedToHoveredSkill;
          const dimmed = isAnyHover && !isHighlighted;
          const usage = connectorUsage[conn.id] || 0;
          const displayName = conn.id.length > 18 ? conn.id.slice(0, 16) + '...' : conn.id;
          const desc = conn.description
            ? (conn.description.length > 30 ? conn.description.slice(0, 28) + '...' : conn.description)
            : '';

          return (
            <g
              key={conn.id}
              onMouseEnter={() => setHoveredConnector(conn.id)}
              onMouseLeave={() => setHoveredConnector(null)}
              style={{ cursor: 'pointer' }}
              opacity={dimmed ? 0.25 : 1}
            >
              <rect
                x={cPos.x} y={cPos.y}
                width={CONN_W} height={CONN_H}
                rx="8" ry="8"
                fill={`${color}08`}
                stroke={`${color}60`}
                strokeWidth={isHovered ? 2.5 : 2}
                strokeDasharray={isPlatform ? 'none' : '6 3'}
              />

              {/* Connector icon */}
              <SvgIcon
                pathD={isPlatform ? ICONS.server : ICONS.plugin}
                color={color}
                x={cPos.x + 10} y={cPos.y + 10} size={14}
              />

              {/* Name */}
              <text x={cPos.x + 28} y={cPos.y + 22} fontSize="11" fontWeight="600" fill={color}>
                {displayName}
              </text>

              {/* Description */}
              {desc && (
                <text x={cPos.x + 10} y={cPos.y + 38} fontSize="9" fill="#6b7280">
                  {desc}
                </text>
              )}

              {/* Required badge */}
              {conn.required && (
                <g>
                  <rect x={cPos.x + CONN_W - 60} y={cPos.y + 46} width="50" height="14" rx="3" fill="#ef444420" />
                  <text x={cPos.x + CONN_W - 35} y={cPos.y + 56} textAnchor="middle" fontSize="8" fontWeight="600" fill="#ef4444">
                    REQUIRED
                  </text>
                </g>
              )}

              {/* Usage count */}
              <text x={cPos.x + 10} y={cPos.y + 56} fontSize="9" fill="#6b7280">
                Used by: {usage} skill{usage !== 1 ? 's' : ''}
              </text>
            </g>
          );
        })}

        {/* Empty connector state */}
        {allConnectors.length === 0 && (
          <text x={totalWidth / 2} y={connRowY + 30} textAnchor="middle" fontSize="12" fill="#6b7280">
            No connectors configured yet
          </text>
        )}
      </svg>

      {/* Legend */}
      {legendItems.length > 0 && <Legend items={legendItems} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 3: Trust Rules — Story Mode + System View toggle
// ═══════════════════════════════════════════════════════════════

// Sensitivity levels for sorting rules
const SENSITIVITY = { high: 0, standard: 1 };

function TrustRulesView({ grants, contracts, skills, handoffs, filterSkillId, onClearFilter, onHighlightInMap }) {
  const [mode, setMode] = useState('story'); // 'story' | 'system'
  const [expandedRule, setExpandedRule] = useState(null); // index for flow strip

  // Build lookups
  const skillRoles = {};
  const skillNames = {};
  skills.forEach(s => {
    skillRoles[s.id] = s.role || 'worker';
    skillNames[s.id] = s.name || s.id;
  });

  // Build grant lookup for descriptions
  const grantDescriptions = {};
  grants.forEach(g => { grantDescriptions[g.key] = g.description || g.key; });

  const renderSkillPill = (skillId, opts = {}) => {
    const roleColor = ROLE_COLORS[skillRoles[skillId]] || ROLE_COLORS.worker;
    const displayName = skillNames[skillId] || (skillId?.length > 16 ? skillId.slice(0, 14) + '...' : skillId);
    return (
      <span key={skillId} style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: '500',
        background: roleColor.bg,
        color: roleColor.color,
        marginRight: '4px',
        marginBottom: '2px',
        cursor: opts.clickable ? 'pointer' : 'default',
      }} title={skillId} onClick={opts.onClick}>
        {displayName}
      </span>
    );
  };

  // ── Story Mode: group contracts by consumer skill ──
  const contractsBySkill = {};
  contracts.forEach(contract => {
    const consumer = contract.consumer || 'unknown';
    if (!contractsBySkill[consumer]) contractsBySkill[consumer] = [];
    contractsBySkill[consumer].push(contract);
  });

  // Filter if coming from Team Map click
  const visibleSkillIds = filterSkillId
    ? [filterSkillId]
    : Object.keys(contractsBySkill);

  // ── Determine sensitivity level of a contract ──
  const getSensitivity = (contract) => {
    const validation = contract.validation || '';
    const levelMatch = validation.match(/[Ll](?:evel\s*)?(\d+)/);
    if (levelMatch && parseInt(levelMatch[1]) >= 2) return 'high';
    // Check tool names for high-risk keywords
    const tools = (contract.for_tools || []).join(' ').toLowerCase();
    if (/cancel|delete|refund|remove|revoke|transfer/.test(tools)) return 'high';
    return 'standard';
  };

  // ── Generate "why" explanation for a contract ──
  const getWhyExplanation = (contract) => {
    const sensitivity = getSensitivity(contract);
    const tools = (contract.for_tools || []).join(' ').toLowerCase();
    if (/cancel/.test(tools)) return 'Cancellations are irreversible — stronger verification prevents accidental or fraudulent cancellations';
    if (/refund/.test(tools)) return 'Refunds involve money leaving the system — identity must be confirmed to prevent fraud';
    if (/delete|remove/.test(tools)) return 'Destructive actions need higher trust to protect customer data';
    if (/update.*address|shipping/.test(tools)) return 'Address changes can redirect deliveries — basic identity check prevents theft';
    if (/transfer/.test(tools)) return 'Transfers move value between accounts — requires strong identity confirmation';
    if (sensitivity === 'high') return 'This is a high-impact action — elevated verification prevents unauthorized changes';
    // Check for PII masking
    if (/mask|pii|hide|sensitive/.test(contract.validation || '')) return 'Personal data must be protected until the caller proves their identity';
    return 'Verification ensures only authorized users can perform this action';
  };

  // ── Describe a contract as a policy sentence ──
  const describeRule = (contract) => {
    const consumerName = skillNames[contract.consumer] || contract.consumer || 'This skill';
    const providerName = skillNames[contract.provider] || contract.provider || 'another skill';
    const validation = contract.validation || '';

    // Extract tool action names
    const toolActions = (contract.for_tools || []).map(t => {
      const parts = t.split('.');
      return parts[parts.length - 1].replace(/_/g, ' ');
    });

    // Build a human-friendly action phrase
    const actionPhrase = toolActions.length > 0
      ? toolActions.length <= 2
        ? toolActions.join(' or ')
        : `${toolActions.slice(0, 2).join(', ')} and ${toolActions.length - 2} more`
      : 'perform sensitive actions';

    // Check for assurance level
    const levelMatch = validation.match(/[Ll](?:evel\s*)?(\d+)/);

    // Check for PII masking pattern
    if (/mask|pii|hide/i.test(validation) || /mask|pii|hide/i.test(contract.name || '')) {
      return `${consumerName} hides personal data until ${providerName} confirms the caller's identity`;
    }

    if (levelMatch) {
      const level = levelMatch[1];
      return `${consumerName} can ${actionPhrase} only after ${providerName} confirms Level ${level}`;
    }

    // Fallback with grant names
    const grantNames = (contract.requires_grants || []).map(g => {
      const desc = grantDescriptions[g];
      if (desc && desc !== g) return desc.toLowerCase();
      return g.replace(/^[^.]+\./, '').replace(/[._]/g, ' ');
    });
    const requiresText = grantNames.length > 0 ? grantNames.join(' and ') : 'verification';

    return `${consumerName} can ${actionPhrase} only after ${providerName} provides ${requiresText}`;
  };

  // ── Render verification flow strip for a rule ──
  const renderFlowStrip = (contract) => {
    const consumerName = skillNames[contract.consumer] || contract.consumer;
    const providerName = skillNames[contract.provider] || contract.provider || '?';
    const validation = contract.validation || '';
    const levelMatch = validation.match(/[Ll](?:evel\s*)?(\d+)/);
    const levelText = levelMatch ? `Level ${levelMatch[1]} verified` : 'Identity confirmed';
    const toolActions = (contract.for_tools || []).map(t => t.split('.').pop().replace(/_/g, ' '));
    const actionText = toolActions.length > 0 ? toolActions[0] : 'proceed';

    const steps = [
      { icon: ICONS.hub, label: 'Customer', sublabel: 'requests action', color: '#6b7280' },
      { icon: ICONS.shield, label: providerName, sublabel: levelText, color: '#f59e0b' },
      { icon: ICONS.check, label: 'Verification', sublabel: 'granted', color: '#10b981' },
      { icon: ICONS.wrench, label: consumerName, sublabel: actionText, color: '#3b82f6' },
    ];

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        marginTop: '8px',
        overflow: 'auto',
      }}>
        {steps.map((step, i) => (
          <React.Fragment key={i}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '80px',
              flex: '0 0 auto',
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: `${step.color}18`,
                border: `2px solid ${step.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '4px',
              }}>
                {renderIcon(step.icon, step.color, 14)}
              </div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'center', lineHeight: '1.3' }}>
                {step.label.length > 14 ? step.label.slice(0, 12) + '...' : step.label}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>
                {step.sublabel}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: '1 1 20px',
                height: '2px',
                background: `linear-gradient(to right, ${step.color}60, ${steps[i + 1].color}60)`,
                margin: '0 4px',
                marginBottom: '20px',
                minWidth: '20px',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ── System View: original raw table ──
  const renderSystemView = () => (
    <div>
      {/* Verifications Table */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Verifications</div>

        {grants.length === 0 ? (
          <div style={styles.empty}>No verifications defined yet</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr 1fr 1fr 70px',
            gap: '1px',
            background: 'var(--border)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            {['Key', 'Description', 'Issued By', 'Consumed By', 'TTL'].map(h => (
              <div key={h} style={{
                background: 'var(--bg-secondary)',
                padding: '8px 10px',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                {h}
              </div>
            ))}

            {grants.map(grant => (
              <React.Fragment key={grant.key}>
                <div style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  {grant.key}
                  {grant.internal && (
                    <span style={{
                      fontSize: '9px', padding: '1px 4px',
                      borderRadius: '3px', background: '#6b728020',
                      color: '#9ca3af',
                    }}>int</span>
                  )}
                </div>
                <div style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}>
                  {grant.description || '—'}
                </div>
                <div style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                }}>
                  {(grant.issued_by || []).map(id => renderSkillPill(id))}
                  {(!grant.issued_by || grant.issued_by.length === 0) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
                <div style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                }}>
                  {(grant.consumed_by || []).map(id => renderSkillPill(id))}
                  {(!grant.consumed_by || grant.consumed_by.length === 0) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
                <div style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}>
                  {grant.ttl_seconds ? `${grant.ttl_seconds}s` : '—'}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Rules Table */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Rules</div>

        {contracts.length === 0 ? (
          <div style={styles.empty}>No rules defined yet</div>
        ) : (
          contracts.map((contract, i) => (
            <div key={i} style={styles.card}>
              <div style={styles.cardTitle}>{contract.name}</div>
              <div style={{ ...styles.cardMeta, marginTop: '6px' }}>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Consumer:</span>{' '}
                  {renderSkillPill(contract.consumer)}
                  {contract.provider && (
                    <>
                      <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>←</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Provider:</span>{' '}
                      {renderSkillPill(contract.provider)}
                    </>
                  )}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Requires:</span>{' '}
                  {(contract.requires_grants || []).map(g => (
                    <span key={g} style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                      marginRight: '4px',
                      marginBottom: '2px',
                    }}>
                      {g}
                    </span>
                  ))}
                </div>
                {contract.for_tools?.length > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Protected tools:</span>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {contract.for_tools.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ── Story Mode: human-readable rules grouped by skill ──
  const renderStoryView = () => {
    if (contracts.length === 0 && grants.length === 0) {
      return <EmptyState message="No trust rules defined yet" hint="Use the chat to define verification requirements between skills." />;
    }

    return (
      <div>
        {visibleSkillIds.map(skillId => {
          const skillContracts = contractsBySkill[skillId] || [];
          if (skillContracts.length === 0) return null;

          const roleColor = ROLE_COLORS[skillRoles[skillId]] || ROLE_COLORS.worker;
          const displayName = skillNames[skillId] || skillId;

          // Sort contracts by sensitivity (high first)
          const sorted = [...skillContracts].sort((a, b) =>
            (SENSITIVITY[getSensitivity(a)] || 1) - (SENSITIVITY[getSensitivity(b)] || 1)
          );

          // Group into high / standard
          const highRules = sorted.filter(c => getSensitivity(c) === 'high');
          const standardRules = sorted.filter(c => getSensitivity(c) === 'standard');

          const renderRuleItem = (contract, globalIndex) => {
            const sensitivity = getSensitivity(contract);
            const isExpanded = expandedRule === `${skillId}-${globalIndex}`;
            const ruleKey = `${skillId}-${globalIndex}`;

            return (
              <div key={globalIndex}>
                <div
                  style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--bg-tertiary)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onClick={() => setExpandedRule(isExpanded ? null : ruleKey)}
                >
                  {/* Sensitivity indicator */}
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: sensitivity === 'high' ? '#ef444418' : 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '1px',
                  }}>
                    <svg viewBox="0 0 24 24" width="11" height="11">
                      <path d={ICONS.shield} fill={sensitivity === 'high' ? '#ef4444' : 'var(--text-muted)'} />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      lineHeight: '1.5',
                    }}>
                      {describeRule(contract)}
                    </div>
                    {/* Why explanation - always visible as subtle text */}
                    <div style={{
                      marginTop: '3px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                    }}>
                      {getWhyExplanation(contract)}
                    </div>
                  </div>
                  {/* Expand indicator */}
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    marginTop: '2px',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}>
                    ›
                  </div>
                </div>
                {/* Flow strip - shown when expanded */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 12px' }}>
                    {renderFlowStrip(contract)}
                  </div>
                )}
              </div>
            );
          };

          let ruleIndex = 0;

          return (
            <div key={skillId} style={{
              marginBottom: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}>
              {/* Skill header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                background: `${roleColor.stroke}08`,
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: roleColor.stroke,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                }}>
                  {displayName}
                </span>
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}>
                  {skillContracts.length} rule{skillContracts.length !== 1 ? 's' : ''}
                </span>
                {onHighlightInMap && (
                  <button
                    onClick={() => onHighlightInMap([skillId, ...skillContracts.map(c => c.provider).filter(Boolean)])}
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title="Show in Team Map"
                  >
                    Show in map
                  </button>
                )}
              </div>

              {/* Rules grouped by sensitivity */}
              <div>
                {highRules.length > 0 && (
                  <div>
                    <div style={{
                      padding: '8px 16px 4px',
                      fontSize: '10px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}>
                      <svg viewBox="0 0 24 24" width="10" height="10"><path d={ICONS.shield} fill="#ef4444" /></svg>
                      Sensitive actions
                    </div>
                    {highRules.map(contract => {
                      const item = renderRuleItem(contract, ruleIndex);
                      ruleIndex++;
                      return item;
                    })}
                  </div>
                )}
                {standardRules.length > 0 && (
                  <div>
                    {highRules.length > 0 && (
                      <div style={{
                        padding: '8px 16px 4px',
                        fontSize: '10px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}>
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d={ICONS.shield} fill="var(--text-muted)" /></svg>
                        Standard verification
                      </div>
                    )}
                    {standardRules.map(contract => {
                      const item = renderRuleItem(contract, ruleIndex);
                      ruleIndex++;
                      return item;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Skills with no rules */}
        {!filterSkillId && skills.filter(s => !contractsBySkill[s.id]).length > 0 && (
          <div style={{
            padding: '14px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: '#10b98118', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" width="11" height="11"><path d={ICONS.check} fill="#10b981" /></svg>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {skills.filter(s => !contractsBySkill[s.id]).map(s => skillNames[s.id] || s.id).join(', ')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                These skills can operate freely — no identity verification required
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Mode toggle + filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {filterSkillId && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'var(--bg-tertiary)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              Filtered: {renderSkillPill(filterSkillId)}
              <button
                onClick={onClearFilter}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  padding: '0 2px',
                  lineHeight: '1',
                }}
                title="Clear filter"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Story / System View toggle */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          padding: '2px',
        }}>
          {[
            { id: 'story', label: 'Story' },
            { id: 'system', label: 'System View' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: '500',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: mode === m.id ? 'var(--accent)' : 'transparent',
                color: mode === m.id ? '#fff' : 'var(--text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'story' ? renderStoryView() : renderSystemView()}
    </div>
  );
}
