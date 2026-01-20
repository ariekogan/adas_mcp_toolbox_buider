import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    overflow: 'hidden'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  closeBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px'
  },
  section: {
    marginBottom: '32px'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: '12px',
    letterSpacing: '0.5px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '16px'
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid var(--border)',
    transition: 'border-color 0.15s'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px'
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0
  },
  connectorName: {
    fontSize: '15px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    flex: 1
  },
  connectorType: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    background: 'var(--bg-tertiary)',
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase'
  },
  cardMeta: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '12px'
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border)'
  },
  actionBtn: {
    background: 'var(--bg-tertiary)',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  actionBtnDanger: {
    color: 'var(--error)'
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: 'var(--text-muted)'
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  },
  emptyText: {
    fontSize: '13px',
    maxWidth: '300px',
    margin: '0 auto'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--text-muted)'
  },
  toolCount: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  prebuiltGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px'
  },
  prebuiltCard: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'border-color 0.15s, background 0.15s'
  },
  prebuiltIcon: {
    fontSize: '24px',
    marginBottom: '8px'
  },
  prebuiltName: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-primary)'
  },
  prebuiltCategory: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  }
};

// Status colors
const STATUS_COLORS = {
  connected: '#10b981',
  connecting: '#f59e0b',
  error: '#ef4444',
  stopped: '#6b7280'
};

// Connector type icons
const CONNECTOR_ICONS = {
  gmail: '📧',
  github: '🐙',
  slack: '💬',
  postgres: '🐘',
  filesystem: '📁',
  custom: '🔌',
  default: '🔗'
};

export default function ConnectorsPage({ onClose }) {
  const [connectors, setConnectors] = useState([]);
  const [prebuilt, setPrebuilt] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadConnectors = useCallback(async () => {
    try {
      setLoading(true);
      const [activeList, prebuiltList] = await Promise.all([
        api.listConnectors(),
        api.listPrebuiltConnectors()
      ]);
      setConnectors(activeList.connections || []);
      setPrebuilt(prebuiltList.connectors || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
    // Poll for status updates every 5 seconds
    const interval = setInterval(loadConnectors, 5000);
    return () => clearInterval(interval);
  }, [loadConnectors]);

  const handleDisconnect = async (id) => {
    try {
      await api.disconnectMCP(id);
      loadConnectors();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const handleConnect = async (connectorId) => {
    try {
      await api.connectPrebuilt(connectorId);
      loadConnectors();
    } catch (err) {
      console.error('Failed to connect:', err);
      // For prebuilt connectors that need env vars, show a message
      alert(`Failed to connect: ${err.message}\n\nMake sure required environment variables are set.`);
    }
  };

  if (loading && connectors.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Connectors</div>
            <div style={styles.subtitle}>Manage MCP connections for your skills</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div style={styles.loading}>Loading connectors...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Connectors</div>
          <div style={styles.subtitle}>Manage MCP connections for your skills</div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div style={styles.content}>
        {error && (
          <div style={{ color: 'var(--error)', marginBottom: '16px', padding: '12px', background: '#ef444420', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {/* Active Connections */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Active Connections ({connectors.length})</div>

          {connectors.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyTitle}>No active connections</div>
              <div style={styles.emptyText}>
                Connect to an MCP server below to enable external tools for your skills.
              </div>
            </div>
          ) : (
            <div style={styles.grid}>
              {connectors.map(conn => (
                <div key={conn.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div
                      style={{
                        ...styles.statusDot,
                        background: STATUS_COLORS[conn.status] || STATUS_COLORS.stopped
                      }}
                      title={conn.status}
                    />
                    <div style={styles.connectorName}>
                      {CONNECTOR_ICONS[conn.type] || CONNECTOR_ICONS.default} {conn.name || conn.id}
                    </div>
                    <div style={styles.connectorType}>{conn.type}</div>
                  </div>

                  <div style={styles.cardMeta}>
                    {conn.tools_count !== undefined && (
                      <span style={styles.toolCount}>{conn.tools_count} tools available</span>
                    )}
                    {conn.error && (
                      <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>
                        {conn.error}
                      </div>
                    )}
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      style={styles.actionBtn}
                      onClick={() => loadConnectors()}
                    >
                      ↻ Refresh
                    </button>
                    <button
                      style={{ ...styles.actionBtn, ...styles.actionBtnDanger }}
                      onClick={() => handleDisconnect(conn.id)}
                    >
                      ✕ Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Connectors */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Available Connectors</div>

          <div style={styles.prebuiltGrid}>
            {prebuilt.map(conn => {
              const isConnected = connectors.some(c => c.type === conn.id);
              return (
                <div
                  key={conn.id}
                  style={{
                    ...styles.prebuiltCard,
                    opacity: isConnected ? 0.5 : 1,
                    cursor: isConnected ? 'default' : 'pointer',
                    borderColor: isConnected ? 'var(--success)' : 'var(--border)'
                  }}
                  onClick={() => !isConnected && handleConnect(conn.id)}
                >
                  <div style={styles.prebuiltIcon}>
                    {CONNECTOR_ICONS[conn.id] || CONNECTOR_ICONS.default}
                  </div>
                  <div style={styles.prebuiltName}>{conn.name}</div>
                  <div style={styles.prebuiltCategory}>{conn.category}</div>
                  {isConnected && (
                    <div style={{ fontSize: '10px', color: 'var(--success)', marginTop: '4px' }}>
                      Connected
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
