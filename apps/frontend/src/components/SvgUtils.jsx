/**
 * SvgUtils — Shared SVG constants, icons, and defs for Team Map & Architecture views
 */
import React from 'react';

export const ROLE_COLORS = {
  gateway: { bg: '#f59e0b20', color: '#f59e0b', stroke: '#f59e0b' },
  worker: { bg: '#3b82f620', color: '#60a5fa', stroke: '#3b82f6' },
  orchestrator: { bg: '#8b5cf620', color: '#a78bfa', stroke: '#8b5cf6' },
  approval: { bg: '#10b98120', color: '#34d399', stroke: '#10b981' },
};

export const ICONS = {
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

export const ROLE_ICONS = {
  gateway: ICONS.shield,
  worker: ICONS.wrench,
  orchestrator: ICONS.hub,
  approval: ICONS.check,
};

export const CHANNEL_ICONS = {
  telegram: ICONS.telegram,
  email: ICONS.email,
  api: ICONS.api,
};

export function renderIcon(pathD, color, size = 14) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d={pathD} fill={color} />
    </svg>
  );
}

export function SvgIcon({ pathD, color, x, y, size = 14 }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24">
      <path d={pathD} fill={color} />
    </svg>
  );
}

export function SharedDefs() {
  return (
    <defs>
      <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="0.8" fill="#6b7280" opacity="0.08" />
      </pattern>
      <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
        <polygon points="0 0, 12 4, 0 8" fill="#4f9cf9" />
      </marker>
      <marker id="arrowhead-muted" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
      </marker>
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

export function EmptyState({ message = 'No skills defined yet', hint = 'Use the chat to add skills and define your solution.' }) {
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

export function Tooltip({ tooltip, containerRef }) {
  if (!tooltip) return null;
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

export function Legend({ items }) {
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
