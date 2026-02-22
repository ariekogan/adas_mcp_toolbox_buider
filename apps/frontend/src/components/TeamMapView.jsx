/**
 * TeamMapView — SVG skill topology graph
 * Extracted from SolutionPanel TopologyView
 * Added onSkillClick callback for navigating to skill detail
 */
import React, { useState, useRef } from 'react';
import { ROLE_COLORS, ICONS, ROLE_ICONS, CHANNEL_ICONS, SvgIcon, SharedDefs, EmptyState, Tooltip, Legend } from './SvgUtils';

export default function TeamMapView({ skills, handoffs, routing, grants, contracts, onSkillClick }) {
  const containerRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [selectedSkill, setSelectedSkill] = useState(null);

  const skillNameMap = {};
  const skillRoleMap = {};
  skills.forEach(s => {
    skillNameMap[s.id] = s.name || s.id;
    skillRoleMap[s.id] = s.role || 'worker';
  });

  const grantDescriptions = {};
  (grants || []).forEach(g => { grantDescriptions[g.key] = g.description || g.key; });

  const getSkillContracts = (skillId) => (contracts || []).filter(c => c.consumer === skillId);

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

  const NODE_W = 184, NODE_H = 94, PAD_X = 60, PAD_Y = 110;
  const CHANNEL_ROW_H = 60;

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

  const channelEntries = Object.entries(routing || {}).map(([channel, config]) => ({
    channel,
    targetSkill: config.default_skill,
  }));

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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto' }}>
      <svg
        width="100%"
        viewBox={`-30 -10 ${svgW} ${svgH}`}
        style={{ minHeight: '300px' }}
      >
        <SharedDefs />
        <rect x="-30" y="-10" width={svgW} height={svgH} fill="url(#dot-grid)" />

        {/* Channel entry arrows */}
        {channelEntries.map(({ channel, targetSkill }) => {
          const target = nodePositions[targetSkill];
          if (!target) return null;
          const targetRole = target.role || 'worker';
          const roleColor = ROLE_COLORS[targetRole] || ROLE_COLORS.worker;
          const tx = target.x + NODE_W / 2;
          const ty = target.y;
          const isHighlighted = hoveredNode === targetSkill;
          const channelIdx = channelEntries.filter(ce => ce.targetSkill === targetSkill).indexOf(
            channelEntries.find(ce => ce.channel === channel && ce.targetSkill === targetSkill)
          );
          const channelCount = channelEntries.filter(ce => ce.targetSkill === targetSkill).length;
          const spread = Math.min(60, (NODE_W - 40) / Math.max(channelCount, 1));
          const cx = target.x + NODE_W / 2 + (channelIdx - (channelCount - 1) / 2) * spread;

          return (
            <g key={`ch-${channel}`} opacity={isHighlighted ? 1 : 0.6}>
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
        {(handoffs || []).map(handoff => {
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
              <path d={path} fill="none" stroke="transparent" strokeWidth="16" />
              <path
                d={path}
                fill="none"
                stroke={`url(#grad-${fromRole}-${toRole})`}
                strokeWidth={isHighlighted ? 3 : 2}
                markerEnd="url(#arrowhead)"
                opacity={dimmed ? 0.15 : (isHighlighted ? 0.9 : 0.6)}
                style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
              />
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
          const isRelatedEdge = hoveredEdge && (handoffs || []).some(h =>
            h.id === hoveredEdge && (h.from === skill.id || h.to === skill.id)
          );
          const isHighlighted = isHovered || isRelatedEdge;
          const dimmed = isAnyHover && !isHighlighted;

          const channels = skill.entry_channels || [];
          const connCount = (skill.connectors || []).length;
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
              onClick={() => {
                if (onSkillClick) {
                  onSkillClick(skill.id);
                } else {
                  setSelectedSkill(isSelected ? null : skill.id);
                }
              }}
              style={{ cursor: 'pointer' }}
              opacity={dimmed ? 0.3 : 1}
            >
              <rect
                x={pos.x} y={pos.y}
                width={NODE_W} height={NODE_H}
                rx="12" ry="12"
                fill="var(--bg-card)"
                stroke={isSelected ? 'var(--accent)' : roleColor.stroke}
                strokeWidth={isHovered ? 2.5 : 2}
              />
              <line
                x1={pos.x + 10} y1={pos.y + 42}
                x2={pos.x + NODE_W - 10} y2={pos.y + 42}
                stroke={roleColor.stroke} strokeWidth="0.5" opacity="0.3"
              />
              <SvgIcon
                pathD={ROLE_ICONS[pos.role] || ICONS.wrench}
                color={roleColor.color}
                x={pos.x + 10} y={pos.y + 10} size={16}
              />
              <text
                x={pos.x + 30}
                y={pos.y + 22}
                fontSize="12"
                fontWeight="600"
                fill="var(--text-primary)"
              >
                {displayName}
              </text>
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

      <Tooltip tooltip={tooltip} containerRef={containerRef} />
      <Legend items={legendItems} />

      {/* Skill detail panel (trust rules summary) — only shown when no onSkillClick (standalone usage) */}
      {!onSkillClick && selectedSkill && (() => {
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
            </div>
          </div>
        );
      })()}
    </div>
  );
}
