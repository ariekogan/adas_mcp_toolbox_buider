/**
 * ArchitectureView — SVG Skills + Connectors diagram
 * Extracted from SolutionPanel ArchitectureView
 */
import React, { useState } from 'react';
import { ROLE_COLORS, ICONS, ROLE_ICONS, CHANNEL_ICONS, SvgIcon, SharedDefs, EmptyState, Legend } from './SvgUtils';

export default function ArchitectureView({ skills, connectors, handoffs, onSkillClick, onConnectorClick }) {
  const [hoveredSkill, setHoveredSkill] = useState(null);
  const [hoveredConnector, setHoveredConnector] = useState(null);

  if (skills.length === 0) {
    return <EmptyState message="No skills defined yet" hint="Start a conversation to add skills and view the architecture." />;
  }

  const platformIds = new Set((connectors || []).map(c => c.id));
  const customConnectorIds = new Set();
  skills.forEach(s => {
    (s.connectors || []).forEach(cId => {
      if (!platformIds.has(cId)) customConnectorIds.add(cId);
    });
  });
  const platformList = connectors || [];
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

  const connectorUsage = {};
  allConnectors.forEach(c => { connectorUsage[c.id] = 0; });
  skills.forEach(s => {
    (s.connectors || []).forEach(cId => {
      connectorUsage[cId] = (connectorUsage[cId] || 0) + 1;
    });
  });

  const SKILL_W = 184, SKILL_H = 100;
  const CONN_W = 160, CONN_H = 65;
  const SKILL_GAP = 30, CONN_GAP = 24;
  const VERTICAL_GAP = 140;
  const HEADER_H = 30;
  const TOP_PAD = 20;

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

  const isLineHighlighted = (line) => {
    if (hoveredSkill && line.skillId === hoveredSkill) return true;
    if (hoveredConnector && line.connId === hoveredConnector) return true;
    return false;
  };

  const isAnyHover = hoveredSkill || hoveredConnector;

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
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        style={{ minHeight: '400px' }}
      >
        <SharedDefs />
        <rect width={totalWidth} height={totalHeight} fill="url(#dot-grid)" />

        <text x={30} y={TOP_PAD + 14} fontSize="11" fontWeight="600" fill="#6b7280" letterSpacing="0.5" style={{ textTransform: 'uppercase' }}>
          SKILLS
        </text>
        <line x1={75} y1={TOP_PAD + 10} x2={totalWidth - 30} y2={TOP_PAD + 10} stroke="#6b7280" strokeWidth="0.5" opacity="0.3" />

        {allConnectors.length > 0 && (
          <>
            <text x={30} y={connRowY - HEADER_H + 14} fontSize="11" fontWeight="600" fill="#6b7280" letterSpacing="0.5">
              CONNECTORS
            </text>
            <line x1={115} y1={connRowY - HEADER_H + 10} x2={totalWidth - 30} y2={connRowY - HEADER_H + 10} stroke="#6b7280" strokeWidth="0.5" opacity="0.3" />
          </>
        )}

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
              onClick={() => onSkillClick && onSkillClick(skill.id)}
              style={{ cursor: 'pointer' }}
              opacity={dimmed ? 0.3 : 1}
            >
              <rect
                x={sPos.x} y={sPos.y}
                width={SKILL_W} height={SKILL_H}
                rx="10" ry="10"
                fill="var(--bg-card)"
                stroke={roleColor.stroke}
                strokeWidth={isHovered ? 2.5 : 2}
              />
              <rect
                x={sPos.x} y={sPos.y + 10}
                width="4" height={SKILL_H - 20}
                rx="2"
                fill={roleColor.stroke}
              />
              <SvgIcon
                pathD={ROLE_ICONS[skill.role] || ICONS.wrench}
                color={roleColor.color}
                x={sPos.x + 14} y={sPos.y + 10} size={16}
              />
              <text x={sPos.x + 34} y={sPos.y + 23} fontSize="12" fontWeight="600" fill="var(--text-primary)">
                {displayName}
              </text>
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
              {desc && (
                <text x={sPos.x + 14} y={sPos.y + 60} fontSize="10" fill="#6b7280">
                  {desc}
                </text>
              )}
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
              onClick={() => onConnectorClick && onConnectorClick(conn.id)}
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
              <SvgIcon
                pathD={isPlatform ? ICONS.server : ICONS.plugin}
                color={color}
                x={cPos.x + 10} y={cPos.y + 10} size={14}
              />
              <text x={cPos.x + 28} y={cPos.y + 22} fontSize="11" fontWeight="600" fill={color}>
                {displayName}
              </text>
              {desc && (
                <text x={cPos.x + 10} y={cPos.y + 38} fontSize="9" fill="#6b7280">
                  {desc}
                </text>
              )}
              {conn.required && (
                <g>
                  <rect x={cPos.x + CONN_W - 60} y={cPos.y + 46} width="50" height="14" rx="3" fill="#ef444420" />
                  <text x={cPos.x + CONN_W - 35} y={cPos.y + 56} textAnchor="middle" fontSize="8" fontWeight="600" fill="#ef4444">
                    REQUIRED
                  </text>
                </g>
              )}
              <text x={cPos.x + 10} y={cPos.y + 56} fontSize="9" fill="#6b7280">
                Used by: {usage} skill{usage !== 1 ? 's' : ''}
              </text>
            </g>
          );
        })}

        {allConnectors.length === 0 && (
          <text x={totalWidth / 2} y={connRowY + 30} textAnchor="middle" fontSize="12" fill="#6b7280">
            No connectors configured yet
          </text>
        )}
      </svg>
      {legendItems.length > 0 && <Legend items={legendItems} />}
    </div>
  );
}
