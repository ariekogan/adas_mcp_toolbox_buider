import { useState, useEffect } from 'react';
import { listConnectors } from '../api/client';

const styles = {
  section: {
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  description: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '16px'
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '8px',
    border: '1px solid var(--border)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  connectorName: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  toolsList: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  },
  status: {
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  statusBlocked: {
    color: 'var(--warning)'
  },
  statusOk: {
    color: 'var(--success)'
  },
  button: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    cursor: 'pointer'
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  buttonPrimary: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'white'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '24px'
  },
  linkSection: {
    marginTop: '16px',
    padding: '12px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px'
  },
  linkTitle: {
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  },
  linkGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  linkCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'border-color 0.15s'
  }
};

const CONNECTOR_ICONS = {
  gmail: '📧',
  github: '🐙',
  slack: '💬',
  postgres: '🐘',
  filesystem: '📁',
  git: '📦',
  default: '🔌'
};

export default function SkillConnectorsPanel({
  skill,
  tools = [],
  onLinkConnector,
  onUnlinkConnector
}) {
  const [globalConnectors, setGlobalConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  // Load globally connected connectors
  useEffect(() => {
    loadGlobalConnectors();
  }, []);

  async function loadGlobalConnectors() {
    try {
      const result = await listConnectors();
      setGlobalConnectors(result.connections || []);
    } catch (err) {
      console.error('Failed to load connectors:', err);
    } finally {
      setLoading(false);
    }
  }

  // Get linked connectors from skill (those referenced by tools)
  const linkedConnectors = getLinkedConnectors(tools);

  // Get available connectors to link (globally connected but not linked to this skill)
  const availableToLink = globalConnectors.filter(
    gc => !linkedConnectors.some(lc => lc.id === gc.id)
  );

  function getLinkedConnectors(tools) {
    const connectorMap = new Map();

    tools.forEach(tool => {
      if (tool.source?.type === 'mcp_bridge' && tool.source?.connection_id) {
        const connId = tool.source.connection_id;
        if (!connectorMap.has(connId)) {
          connectorMap.set(connId, {
            id: connId,
            name: connId,
            type: guessConnectorType(connId),
            tools: []
          });
        }
        connectorMap.get(connId).tools.push(tool.name);
      }
    });

    // Also include skill.connectors if it exists (linked but no tools yet)
    if (skill?.connectors) {
      skill.connectors.forEach(connId => {
        if (!connectorMap.has(connId)) {
          const globalConn = globalConnectors.find(gc => gc.id === connId);
          connectorMap.set(connId, {
            id: connId,
            name: globalConn?.name || connId,
            type: guessConnectorType(connId),
            tools: []
          });
        }
      });
    }

    return Array.from(connectorMap.values());
  }

  function guessConnectorType(connId) {
    const id = connId.toLowerCase();
    if (id.includes('gmail') || id.includes('mail')) return 'gmail';
    if (id.includes('github')) return 'github';
    if (id.includes('slack')) return 'slack';
    if (id.includes('postgres')) return 'postgres';
    if (id.includes('git')) return 'git';
    if (id.includes('file')) return 'filesystem';
    return 'default';
  }

  function canRemove(connector) {
    return connector.tools.length === 0;
  }

  function handleRemove(connector) {
    if (!canRemove(connector)) return;
    if (onUnlinkConnector) {
      onUnlinkConnector(connector.id);
    }
  }

  function handleLink(connector) {
    if (onLinkConnector) {
      onLinkConnector(connector.id);
    }
    setShowLinkPicker(false);
  }

  return (
    <div>
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>
            CONNECTORS ({linkedConnectors.length})
          </span>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={() => setShowLinkPicker(!showLinkPicker)}
          >
            + Link
          </button>
        </div>

        <p style={styles.description}>
          Connectors linked to this skill and the tools that use them
        </p>

        {linkedConnectors.length === 0 ? (
          <div style={styles.empty}>
            No connectors linked to this skill yet.
            <br />
            Link a connector to import tools from it.
          </div>
        ) : (
          linkedConnectors.map(connector => (
            <div key={connector.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.connectorName}>
                  {CONNECTOR_ICONS[connector.type] || CONNECTOR_ICONS.default}
                  {connector.name}
                </span>
                <button
                  style={{
                    ...styles.button,
                    ...(canRemove(connector) ? {} : styles.buttonDisabled)
                  }}
                  onClick={() => handleRemove(connector)}
                  disabled={!canRemove(connector)}
                  title={canRemove(connector) ? 'Remove connector' : 'Cannot remove - tools depend on it'}
                >
                  Remove
                </button>
              </div>

              <div style={styles.toolsList}>
                Tools using: {connector.tools.length > 0
                  ? connector.tools.join(', ')
                  : <em>none</em>
                }
              </div>

              <div style={{
                ...styles.status,
                ...(canRemove(connector) ? styles.statusOk : styles.statusBlocked)
              }}>
                {canRemove(connector)
                  ? '✓ Can be removed'
                  : `⚠️ Cannot remove - ${connector.tools.length} tool${connector.tools.length > 1 ? 's' : ''} depend on it`
                }
              </div>
            </div>
          ))
        )}

        {/* Link Connector Picker */}
        {showLinkPicker && (
          <div style={styles.linkSection}>
            <div style={styles.linkTitle}>
              Available connectors to link:
            </div>
            {loading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : availableToLink.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                No more connectors available. Connect more in the global Connectors page.
              </div>
            ) : (
              <div style={styles.linkGrid}>
                {availableToLink.map(connector => (
                  <div
                    key={connector.id}
                    style={styles.linkCard}
                    onClick={() => handleLink(connector)}
                  >
                    {CONNECTOR_ICONS[guessConnectorType(connector.id)] || CONNECTOR_ICONS.default}
                    {connector.name || connector.id}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
