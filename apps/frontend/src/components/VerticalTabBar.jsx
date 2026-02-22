/**
 * VerticalTabBar — Vertical skill editing sidebar with HOME icon
 * Replaces horizontal tabs from SkillPanel
 */
import React, { useState } from 'react';

const TAB_ICONS = {
  identity: { path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z', label: 'ID' },
  intents: { path: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z', label: 'IN' },
  tools: { path: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.7 4.7C.6 7.1 1 9.9 3 11.9c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1 0-1.2z', label: 'TL' },
  connectors: { path: 'M4 1h16c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V3c0-1.1.9-2 2-2zm0 10h16c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2zm2-6a1 1 0 100 2 1 1 0 000-2zm0 10a1 1 0 100 2 1 1 0 000-2z', label: 'CN' },
  policy: { path: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z', label: 'PL' },
  security: { path: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z', label: 'SC' },
  engine: { path: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z', label: 'EN' },
  triggers: { path: 'M7 2v11h3v9l7-12h-4l4-8z', label: 'TR' },
};

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'intents', label: 'Intents' },
  { id: 'tools', label: 'Tools' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'policy', label: 'Policy' },
  { id: 'security', label: 'Security' },
  { id: 'engine', label: 'Engine' },
  { id: 'triggers', label: 'Triggers' },
];

export default function VerticalTabBar({ activeTab, onTabChange, onGoHome, getTabBadge, skill }) {
  const [hoveredTab, setHoveredTab] = useState(null);

  return (
    <div style={{
      width: '52px',
      minWidth: '52px',
      height: '100%',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '8px',
      gap: '2px',
      overflow: 'hidden',
    }}>
      {/* HOME button */}
      <button
        onClick={onGoHome}
        onMouseEnter={() => setHoveredTab('home')}
        onMouseLeave={() => setHoveredTab(null)}
        style={{
          width: '40px',
          height: '40px',
          border: 'none',
          borderRadius: '8px',
          background: hoveredTab === 'home' ? 'var(--bg-hover)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '8px',
          position: 'relative',
        }}
        title="Back to Map"
      >
        <span style={{
          fontSize: '20px',
          color: hoveredTab === 'home' ? 'var(--accent)' : 'var(--text-muted)',
          lineHeight: 1,
        }}>⌂</span>
      </button>

      {/* Separator */}
      <div style={{
        width: '28px',
        height: '1px',
        background: 'var(--border)',
        marginBottom: '8px',
      }} />

      {/* Tab icons */}
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const isHovered = hoveredTab === tab.id;
        const icon = TAB_ICONS[tab.id];
        const badge = getTabBadge ? getTabBadge(tab.id, skill) : null;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            onMouseEnter={() => setHoveredTab(tab.id)}
            onMouseLeave={() => setHoveredTab(null)}
            style={{
              width: '40px',
              height: '40px',
              border: 'none',
              borderRadius: '8px',
              background: isActive ? 'var(--bg-tertiary)' : (isHovered ? 'var(--bg-hover)' : 'transparent'),
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
            }}
            title={tab.label}
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d={icon.path}
                fill={isActive ? 'var(--accent)' : (isHovered ? 'var(--text-secondary)' : 'var(--text-muted)')}
              />
            </svg>
            <span style={{
              fontSize: '8px',
              fontWeight: '600',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              marginTop: '1px',
              letterSpacing: '0.5px',
            }}>
              {icon.label}
            </span>

            {/* Badge dot */}
            {badge && (
              <div style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: badge.style?.color || 'var(--text-muted)',
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
