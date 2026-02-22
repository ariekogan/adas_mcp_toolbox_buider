/**
 * MapWorkspace — Full-area workspace showing Team Map or Architecture view
 * With 2 small toggle icons in the top-right corner
 */
import React, { useState, useMemo } from 'react';
import TeamMapView from './TeamMapView';
import ArchitectureView from './ArchitectureView';

export default function MapWorkspace({ solution, sidebarSkills = [], onSkillClick }) {
  const [activeView, setActiveView] = useState('team-map'); // 'team-map' | 'architecture'

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

      {/* Map content */}
      <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
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
          />
        )}
      </div>
    </div>
  );
}
