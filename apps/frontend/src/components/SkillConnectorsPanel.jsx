import { useState, useEffect } from 'react';
import { listConnectors, listPrebuiltConnectors } from '../api/client';

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
  },
  // Internal solution connectors (imported from packages)
  linkCardInternal: {
    background: 'rgba(99, 102, 241, 0.1)',  // Indigo tint
    border: '1px solid rgba(99, 102, 241, 0.4)',
    color: 'var(--text-primary)'
  },
  // Public/external connectors
  linkCardPublic: {
    background: 'rgba(34, 197, 94, 0.08)',  // Green tint
    border: '1px solid rgba(34, 197, 94, 0.3)',
    color: 'var(--text-primary)'
  },
  connectorTypeLabel: {
    fontSize: '10px',
    fontWeight: '500',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: 'auto'
  },
  internalLabel: {
    background: 'rgba(99, 102, 241, 0.2)',
    color: 'rgb(129, 140, 248)'  // Indigo text
  },
  publicLabel: {
    background: 'rgba(34, 197, 94, 0.15)',
    color: 'rgb(74, 222, 128)'  // Green text
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

  // Load all available connectors (prebuilt + imported from packages)
  useEffect(() => {
    loadGlobalConnectors();
  }, []);

  async function loadGlobalConnectors() {
    try {
      // Get prebuilt + imported connectors (from /api/connectors/prebuilt)
      const prebuiltResult = await listPrebuiltConnectors();
      const prebuiltConnectors = prebuiltResult.connectors || [];

      // Also get manually connected ones (from /api/connectors)
      const connectedResult = await listConnectors();
      const connectedConnectors = connectedResult.connections || [];

      // Merge both lists, preferring prebuilt data but marking connected status
      const connectorMap = new Map();

      // Add prebuilt/imported connectors
      for (const c of prebuiltConnectors) {
        connectorMap.set(c.id, { ...c, connected: false });
      }

      // Mark connected ones and add any manual connections not in prebuilt
      for (const c of connectedConnectors) {
        if (connectorMap.has(c.id)) {
          connectorMap.get(c.id).connected = true;
        } else {
          connectorMap.set(c.id, { ...c, connected: true });
        }
      }

      setGlobalConnectors(Array.from(connectorMap.values()));
    } catch (err) {
      console.error('Failed to load connectors:', err);
    } finally {
      setLoading(false);
    }
  }

  // Get linked connectors from skill (those referenced by tools)
  // Recalculate when globalConnectors finishes loading so names/metadata resolve
  const linkedConnectors = getLinkedConnectors(tools, globalConnectors);

  // Helper to check if connector is internal (imported from a package/solution)
  function isInternalConnector(connector) {
    return !!(connector.importedFrom || connector.source === 'package' || connector.packageId);
  }

  // Get available connectors to link (globally connected but not linked to this skill)
  // Sort: internal solution connectors first, then public connectors
  const availableToLink = globalConnectors
    .filter(gc => !linkedConnectors.some(lc => lc.id === gc.id))
    .sort((a, b) => {
      const aInternal = isInternalConnector(a);
      const bInternal = isInternalConnector(b);
      if (aInternal && !bInternal) return -1;  // a first
      if (!aInternal && bInternal) return 1;   // b first
      return (a.name || a.id).localeCompare(b.name || b.id);  // alphabetical
    });

  function getLinkedConnectors(tools, globalConns) {
    const connectorMap = new Map();

    tools.forEach(tool => {
      if (tool.source?.type === 'mcp_bridge' && tool.source?.connection_id) {
        const connId = tool.source.connection_id;
        if (!connectorMap.has(connId)) {
          const globalConn = globalConns.find(gc => gc.id === connId);
          connectorMap.set(connId, {
            id: connId,
            name: globalConn?.name || connId,
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
          const globalConn = globalConns.find(gc => gc.id === connId);
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
                {availableToLink.map(connector => {
                  const isInternal = isInternalConnector(connector);
                  return (
                    <div
                      key={connector.id}
                      style={{
                        ...styles.linkCard,
                        ...(isInternal ? styles.linkCardInternal : styles.linkCardPublic)
                      }}
                      onClick={() => handleLink(connector)}
                    >
                      {CONNECTOR_ICONS[guessConnectorType(connector.id)] || CONNECTOR_ICONS.default}
                      {connector.name || connector.id}
                      <span style={{
                        ...styles.connectorTypeLabel,
                        ...(isInternal ? styles.internalLabel : styles.publicLabel)
                      }}>
                        {isInternal ? 'Solution' : 'Public'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
