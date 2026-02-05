/**
 * SolutionPanel — Displays solution-level architecture
 *
 * Three tabs:
 *   1. Topology — SVG graph of skills, handoffs, and channel entries
 *   2. Architecture — Skills + connectors diagram with links
 *   3. Access & Grants — Grant economy table + security contracts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api/client';

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

const ROLE_COLORS = {
  gateway: { bg: '#f59e0b20', color: '#f59e0b', stroke: '#f59e0b' },
  worker: { bg: '#3b82f620', color: '#60a5fa', stroke: '#3b82f6' },
  orchestrator: { bg: '#8b5cf620', color: '#a78bfa', stroke: '#8b5cf6' },
  approval: { bg: '#10b98120', color: '#34d399', stroke: '#10b981' },
};

const TABS = ['Topology', 'Architecture', 'Access & Grants'];

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════
export default function SolutionPanel({ solution }) {
  const [activeTab, setActiveTab] = useState('Topology');

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>★ {solution.name}</div>
        <div style={styles.subtitle}>
          {skills.length} skills · {grants.length} grants · {handoffs.length} handoffs
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
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === 'Topology' && (
          <TopologyView skills={skills} handoffs={handoffs} routing={routing} />
        )}
        {activeTab === 'Architecture' && (
          <ArchitectureView skills={skills} connectors={connectors} />
        )}
        {activeTab === 'Access & Grants' && (
          <AccessGrantsView grants={grants} contracts={contracts} skills={skills} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 1: Topology — SVG skill graph
// ═══════════════════════════════════════════════════════════════
function TopologyView({ skills, handoffs, routing }) {
  if (skills.length === 0) {
    return <div style={styles.empty}>No skills defined yet. Start a conversation to add skills.</div>;
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

  // Node dimensions
  const NODE_W = 160, NODE_H = 70, PAD_X = 50, PAD_Y = 100;
  const CHANNEL_ROW_H = 50; // space for channel/user icons at top

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

  const svgW = maxRowWidth + 40; // padding
  const svgH = y + 20;

  // Channel entry points
  const channelEntries = Object.entries(routing).map(([channel, config]) => ({
    channel,
    targetSkill: config.default_skill,
  }));

  return (
    <div style={{ overflow: 'auto' }}>
      <svg
        width="100%"
        viewBox={`-20 -10 ${svgW} ${svgH}`}
        style={{ minHeight: '300px' }}
      >
        {/* Arrowhead marker */}
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
          </marker>
          <marker id="arrowhead-muted" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
        </defs>

        {/* Channel entry arrows from top */}
        {channelEntries.map(({ channel, targetSkill }) => {
          const target = nodePositions[targetSkill];
          if (!target) return null;
          const tx = target.x + NODE_W / 2;
          const ty = target.y;
          return (
            <g key={`ch-${channel}`}>
              {/* User icon at top */}
              <text x={tx} y={8} textAnchor="middle" fontSize="16" fill="#6b7280">👤</text>
              <text x={tx} y={25} textAnchor="middle" fontSize="10" fill="#6b7280">{channel}</text>
              <line
                x1={tx} y1={30}
                x2={tx} y2={ty}
                stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 3"
                markerEnd="url(#arrowhead-muted)"
              />
            </g>
          );
        })}

        {/* Handoff arrows */}
        {handoffs.map(handoff => {
          const from = nodePositions[handoff.from];
          const to = nodePositions[handoff.to];
          if (!from || !to) return null;

          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;

          // Bezier curve
          const midY = (y1 + y2) / 2;
          const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

          const grantsLabel = (handoff.grants_passed || []).length > 0
            ? (handoff.grants_passed || []).map(g => g.split('.').pop()).join(', ')
            : '';

          return (
            <g key={handoff.id}>
              <path
                d={path}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
                opacity="0.7"
              />
              {grantsLabel && (
                <text
                  x={(x1 + x2) / 2 + 8}
                  y={midY}
                  fontSize="9"
                  fill="var(--text-muted)"
                  dominantBaseline="middle"
                >
                  {grantsLabel}
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

          return (
            <g key={skill.id}>
              <rect
                x={pos.x} y={pos.y}
                width={NODE_W} height={NODE_H}
                rx="10" ry="10"
                fill="var(--bg-card)"
                stroke={roleColor.stroke}
                strokeWidth="2"
              />
              <text
                x={pos.x + NODE_W / 2}
                y={pos.y + 24}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--text-primary)"
              >
                {skill.id.length > 18 ? skill.id.slice(0, 16) + '…' : skill.id}
              </text>
              {/* Role badge */}
              <rect
                x={pos.x + NODE_W / 2 - 28}
                y={pos.y + 36}
                width="56" height="18"
                rx="4"
                fill={roleColor.bg}
              />
              <text
                x={pos.x + NODE_W / 2}
                y={pos.y + 49}
                textAnchor="middle"
                fontSize="9"
                fontWeight="500"
                fill={roleColor.color}
              >
                {(skill.role || 'worker').toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 2: Architecture — Skills at top, Connectors at bottom, links between
// ═══════════════════════════════════════════════════════════════
function ArchitectureView({ skills, connectors }) {
  const containerRef = useRef(null);
  const skillRefs = useRef({});
  const connectorRefs = useRef({});
  const [lines, setLines] = useState([]);

  // Derive all connectors: from platform_connectors + from skill.connectors
  const platformIds = new Set(connectors.map(c => c.id));
  const customConnectorIds = new Set();
  skills.forEach(s => {
    (s.connectors || []).forEach(cId => {
      if (!platformIds.has(cId)) customConnectorIds.add(cId);
    });
  });

  const platformList = connectors;
  const customList = [...customConnectorIds].map(id => ({ id, description: 'Custom connector' }));

  // Compute lines after render
  const computeLines = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLines = [];

    skills.forEach(skill => {
      const skillEl = skillRefs.current[skill.id];
      if (!skillEl) return;
      const skillRect = skillEl.getBoundingClientRect();
      const sx = skillRect.left + skillRect.width / 2 - containerRect.left;
      const sy = skillRect.bottom - containerRect.top;

      (skill.connectors || []).forEach(cId => {
        const connEl = connectorRefs.current[cId];
        if (!connEl) return;
        const connRect = connEl.getBoundingClientRect();
        const cx = connRect.left + connRect.width / 2 - containerRect.left;
        const cy = connRect.top - containerRect.top;

        const isPlatform = platformIds.has(cId);
        newLines.push({ sx, sy, cx, cy, isPlatform, skillId: skill.id, connId: cId });
      });
    });

    setLines(newLines);
  }, [skills, connectors]);

  useEffect(() => {
    // Compute after a small delay to let DOM settle
    const timer = setTimeout(computeLines, 100);
    return () => clearTimeout(timer);
  }, [computeLines]);

  if (skills.length === 0) {
    return <div style={styles.empty}>No skills defined yet. Start a conversation to add skills.</div>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', minHeight: '400px' }}>
      {/* Skills row */}
      <div style={styles.sectionTitle}>Skills</div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '12px',
        marginBottom: '60px', position: 'relative', zIndex: 1,
      }}>
        {skills.map(skill => {
          const roleColor = ROLE_COLORS[skill.role] || ROLE_COLORS.worker;
          return (
            <div
              key={skill.id}
              ref={el => { skillRefs.current[skill.id] = el; }}
              style={{
                ...styles.card,
                borderColor: roleColor.stroke,
                borderWidth: '2px',
                minWidth: '140px',
                maxWidth: '200px',
                flex: '1 0 140px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{skill.id}</span>
              </div>
              <span style={{
                ...styles.badge,
                background: roleColor.bg,
                color: roleColor.color,
                marginLeft: 0,
                fontSize: '10px',
              }}>
                {(skill.role || 'worker').toUpperCase()}
              </span>
              {skill.description && (
                <div style={{ ...styles.cardMeta, marginTop: '6px', fontSize: '11px' }}>
                  {skill.description.length > 60 ? skill.description.slice(0, 58) + '…' : skill.description}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SVG overlay for lines */}
      <svg style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}>
        {lines.map((line, i) => {
          const midY = (line.sy + line.cy) / 2;
          const path = `M ${line.sx} ${line.sy} C ${line.sx} ${midY}, ${line.cx} ${midY}, ${line.cx} ${line.cy}`;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={line.isPlatform ? '#14b8a6' : '#f59e0b'}
              strokeWidth="1.5"
              opacity="0.5"
              strokeDasharray={line.isPlatform ? 'none' : '4 3'}
            />
          );
        })}
      </svg>

      {/* Connectors row */}
      {(platformList.length > 0 || customList.length > 0) && (
        <>
          {platformList.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={styles.sectionTitle}>Platform Connectors</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', position: 'relative', zIndex: 1 }}>
                {platformList.map(conn => (
                  <div
                    key={conn.id}
                    ref={el => { connectorRefs.current[conn.id] = el; }}
                    style={{
                      ...styles.card,
                      borderColor: '#14b8a650',
                      borderWidth: '2px',
                      minWidth: '130px',
                      flex: '0 1 auto',
                      background: '#14b8a608',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#14b8a6' }}>{conn.id}</div>
                    {conn.description && (
                      <div style={{ ...styles.cardMeta, fontSize: '10px', marginTop: '2px' }}>
                        {conn.description.length > 50 ? conn.description.slice(0, 48) + '…' : conn.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {customList.length > 0 && (
            <div>
              <div style={styles.sectionTitle}>Custom Connectors</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', position: 'relative', zIndex: 1 }}>
                {customList.map(conn => (
                  <div
                    key={conn.id}
                    ref={el => { connectorRefs.current[conn.id] = el; }}
                    style={{
                      ...styles.card,
                      borderColor: '#f59e0b50',
                      borderWidth: '2px',
                      minWidth: '130px',
                      flex: '0 1 auto',
                      background: '#f59e0b08',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#f59e0b' }}>{conn.id}</div>
                    <div style={{ ...styles.cardMeta, fontSize: '10px', marginTop: '2px' }}>
                      {conn.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {platformList.length === 0 && customList.length === 0 && (
        <div style={{ ...styles.empty, paddingTop: '0' }}>
          No connectors configured yet
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 3: Access & Grants — Grant table + Security contracts
// ═══════════════════════════════════════════════════════════════
function AccessGrantsView({ grants, contracts, skills }) {
  // Build a role lookup for skill pills
  const skillRoles = {};
  skills.forEach(s => { skillRoles[s.id] = s.role || 'worker'; });

  const renderSkillPill = (skillId) => {
    const roleColor = ROLE_COLORS[skillRoles[skillId]] || ROLE_COLORS.worker;
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
      }}>
        {skillId}
      </span>
    );
  };

  const renderGrantPill = (grantKey) => (
    <span key={grantKey} style={{
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
      {grantKey}
    </span>
  );

  return (
    <div>
      {/* Grant Economy Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Grant Economy</div>

        {grants.length === 0 ? (
          <div style={styles.empty}>No grants defined yet</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr 1fr 1fr 70px',
            gap: '1px',
            background: 'var(--border)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            {/* Header */}
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

            {/* Rows */}
            {grants.map(grant => (
              <>
                <div key={`${grant.key}-key`} style={{
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
                <div key={`${grant.key}-desc`} style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}>
                  {grant.description || '—'}
                </div>
                <div key={`${grant.key}-issued`} style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                }}>
                  {(grant.issued_by || []).map(id => renderSkillPill(id))}
                  {(!grant.issued_by || grant.issued_by.length === 0) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
                <div key={`${grant.key}-consumed`} style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                }}>
                  {(grant.consumed_by || []).map(id => renderSkillPill(id))}
                  {(!grant.consumed_by || grant.consumed_by.length === 0) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
                <div key={`${grant.key}-ttl`} style={{
                  background: 'var(--bg-card)',
                  padding: '8px 10px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}>
                  {grant.ttl_seconds ? `${grant.ttl_seconds}s` : '—'}
                </div>
              </>
            ))}
          </div>
        )}
      </div>

      {/* Security Contracts Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Security Contracts</div>

        {contracts.length === 0 ? (
          <div style={styles.empty}>No security contracts defined yet</div>
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
                  {(contract.requires_grants || []).map(g => renderGrantPill(g))}
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
}
