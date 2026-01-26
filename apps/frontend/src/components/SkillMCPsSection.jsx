import { useState, useEffect } from 'react';
import { listSkillMCPs } from '../api/client';

const styles = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--border)'
  },
  title: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  refreshBtn: {
    padding: '6px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderRadius: '4px'
  },
  list: {
    flex: 1,
    overflow: 'auto'
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '10px',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.15s ease'
  },
  cardHover: {
    borderColor: 'var(--accent)'
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  cardMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  badge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '500'
  },
  mcpBadge: {
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))',
    color: '#a78bfa'
  },
  versionBadge: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic',
    padding: '20px 0',
    textAlign: 'center'
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block'
  }
};

// Icons
const MCPIcon = () => (
  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

const RefreshIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// Add spinner keyframes
if (typeof document !== 'undefined' && !document.getElementById('skill-mcp-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'skill-mcp-spinner-style';
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SkillMCPsSection({ onSelectMCP }) {
  const [mcps, setMcps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    loadMcps();
  }, []);

  async function loadMcps() {
    setLoading(true);
    try {
      const data = await listSkillMCPs();
      setMcps(data);
    } catch (err) {
      console.error('Failed to load skill MCPs:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>
          <MCPIcon />
          Skills MCPs
        </div>
        <button onClick={loadMcps} style={styles.refreshBtn} title="Refresh">
          <RefreshIcon />
        </button>
      </div>

      <div style={styles.list}>
        {loading ? (
          <div style={styles.empty}>
            <span style={styles.spinner}></span>
            <span style={{ marginLeft: '8px' }}>Loading...</span>
          </div>
        ) : mcps.length === 0 ? (
          <div style={styles.empty}>
            No generated MCPs yet.<br />
            Export a skill to create one.
          </div>
        ) : (
          mcps.map(mcp => (
            <div
              key={mcp.id}
              style={{
                ...styles.card,
                ...(hoveredId === mcp.id ? styles.cardHover : {})
              }}
              onClick={() => onSelectMCP(mcp)}
              onMouseEnter={() => setHoveredId(mcp.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={styles.cardTitle}>
                <span>{mcp.name}</span>
                <span style={{ ...styles.badge, ...styles.versionBadge }}>v{mcp.version}</span>
              </div>
              <div style={styles.cardMeta}>
                <span>{mcp.toolsCount} tools</span>
                <span>{formatDate(mcp.exportedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
