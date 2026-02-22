/**
 * MapWorkspace — Full-area workspace showing Team Map or Architecture view
 * With toggle icons in the top-right and zoom controls in the bottom-right
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import TeamMapView from './TeamMapView';
import ArchitectureView from './ArchitectureView';

const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

export default function MapWorkspace({ solution, sidebarSkills = [], onSkillClick, onConnectorClick }) {
  const [activeView, setActiveView] = useState('team-map');
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const fitDoneRef = useRef(false);

  const skills = solution?.skills || [];
  const handoffs = solution?.handoffs || [];
  const routing = solution?.routing || {};
  const grants = solution?.grants || [];
  const contracts = solution?.security_contracts || [];
  const connectors = solution?.platform_connectors || [];

  // Enrich solution skills with connector data from sidebar skills
  const enrichedSkills = useMemo(() => {
    if (!sidebarSkills || sidebarSkills.length === 0) return skills;

    const norm = (str) => str.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const lookup = {};
    sidebarSkills.forEach(ss => {
      if (ss.connectors && ss.connectors.length > 0) {
        lookup[norm(ss.name)] = ss.connectors;
        lookup[norm(ss.id)] = ss.connectors;
      }
    });

    const tokenMatch = (a, b) => a === b || a.startsWith(b) || b.startsWith(a);
    const findSidebarConns = (skillId) => {
      const nId = norm(skillId);
      if (lookup[nId]) return lookup[nId];
      for (const [key, conns] of Object.entries(lookup)) {
        if (key.includes(nId) || nId.includes(key)) return conns;
      }
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
      const merged = [...new Set([...existing, ...sidebarConns])];
      return merged.length > 0 ? { ...s, connectors: merged } : s;
    });
  }, [skills, sidebarSkills]);

  // Calculate zoom to fit all content in the viewport
  const fitAll = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Temporarily set to 100% to measure natural SVG size
    content.style.width = '100%';

    requestAnimationFrame(() => {
      const svg = content.querySelector('svg');
      if (!svg) return;

      const containerH = container.clientHeight;
      const containerW = container.clientWidth;
      const svgRect = svg.getBoundingClientRect();

      if (svgRect.height <= 0 || svgRect.width <= 0) return;

      // Calculate zoom so SVG fits entirely within container
      const fitW = containerW / svgRect.width;
      const fitH = containerH / svgRect.height;
      let fitZoom = Math.min(fitW, fitH, 1.0);
      fitZoom = Math.max(fitZoom, MIN_ZOOM);

      setZoom(fitZoom);
    });
  }, []);

  // Auto-fit on mount and when view changes
  useEffect(() => {
    fitDoneRef.current = false;
    const timer = setTimeout(() => {
      fitAll();
      fitDoneRef.current = true;
    }, 200);
    return () => clearTimeout(timer);
  }, [activeView, fitAll, enrichedSkills]);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  // Ctrl + mouse wheel zoom
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP * 0.5 : ZOOM_STEP * 0.5;
      setZoom(z => Math.max(Math.min(z + delta, MAX_ZOOM), MIN_ZOOM));
    }
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  // Width-based zoom: set the inner content width as a percentage
  // SVGs with viewBox will scale proportionally
  const contentWidth = `${zoom * 100}%`;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Corner toggle icons */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 10,
        display: 'flex',
        gap: '2px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '3px',
      }}>
        <button
          onClick={() => setActiveView('team-map')}
          style={{
            background: activeView === 'team-map' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none',
            borderRadius: '5px',
            padding: '5px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Team Map"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
              fill={activeView === 'team-map' ? 'var(--accent)' : 'var(--text-muted)'}
            />
          </svg>
        </button>
        <button
          onClick={() => setActiveView('architecture')}
          style={{
            background: activeView === 'architecture' ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none',
            borderRadius: '5px',
            padding: '5px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Architecture"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M4 3h16c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm0 2v14h16V5H4zm2 2h5v5H6V7zm7 0h5v5h-5V7zm-7 7h5v5H6v-5zm7 0h5v5h-5v-5z"
              fill={activeView === 'architecture' ? 'var(--accent)' : 'var(--text-muted)'}
            />
          </svg>
        </button>
      </div>

      {/* Zoom controls — bottom right */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '3px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <button onClick={handleZoomIn} style={zoomBtnStyle} title="Zoom in">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M8 3v10M3 8h10" stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        <button
          onClick={fitAll}
          style={{ ...zoomBtnStyle, fontSize: '9px', fontWeight: '600', color: 'var(--text-muted)', fontFamily: 'system-ui' }}
          title="Fit all"
        >
          {zoomPercent}%
        </button>
        <button onClick={handleZoomOut} style={zoomBtnStyle} title="Zoom out">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 8h10" stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>

      {/* Map content — width-based zoom (SVGs scale via viewBox) */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        style={{ width: '100%', height: '100%', overflow: 'auto' }}
      >
        <div
          ref={contentRef}
          style={{
            width: contentWidth,
            margin: zoom <= 1 ? '0 auto' : undefined,
          }}
        >
          {activeView === 'team-map' ? (
            <TeamMapView
              skills={enrichedSkills}
              handoffs={handoffs}
              routing={routing}
              grants={grants}
              contracts={contracts}
              onSkillClick={onSkillClick}
            />
          ) : (
            <ArchitectureView
              skills={enrichedSkills}
              connectors={connectors}
              handoffs={handoffs}
              onSkillClick={onSkillClick}
              onConnectorClick={onConnectorClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const zoomBtnStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '5px',
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '32px',
  minHeight: '28px',
};
