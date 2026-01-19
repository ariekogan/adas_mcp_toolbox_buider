import { useState, useEffect } from 'react';
import {
  listConnectors,
  listPrebuiltConnectors,
  connectMCP,
  connectPrebuilt,
  disconnectMCP,
  getConnectorTools,
  callConnectorTool,
  importConnectorTools
} from '../api/client';

// Styles matching other panels (IdentityPanel, IntentsPanel, PolicyPanel)
const styles = {
  section: {
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
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
  expandIcon: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    transition: 'transform 0.2s'
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid transparent',
    transition: 'border-color 0.2s'
  },
  cardSelected: {
    borderColor: 'var(--accent)'
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic'
  },
  subsection: {
    marginBottom: '16px'
  },
  subsectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textTransform: 'uppercase'
  },
  categoryTitle: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    marginTop: '12px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },
  connectedDot: {
    background: '#10b981'
  },
  button: {
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.15s ease'
  },
  primaryButton: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)'
  },
  secondaryButton: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)'
  },
  dangerButton: {
    background: 'transparent',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)'
  },
  successButton: {
    background: '#10b981',
    color: 'white'
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    outline: 'none'
  },
  label: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase',
    display: 'block'
  },
  error: {
    padding: '10px 12px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#f87171',
    fontSize: '12px',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  tag: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)'
  },
  connectedBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  toolCard: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '6px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  toolCardSelected: {
    background: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.4)'
  },
  toolName: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--accent)'
  },
  toolDescription: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  checkbox: {
    width: '14px',
    height: '14px',
    accentColor: 'var(--accent)'
  },
  formGroup: {
    marginBottom: '12px'
  },
  formCard: {
    padding: '16px',
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  customButton: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px dashed var(--border)',
    borderRadius: '8px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.15s ease'
  },
  testResult: {
    marginTop: '8px',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: 'monospace'
  },
  testSuccess: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)'
  },
  testError: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)'
  },
  importBar: {
    marginTop: '12px',
    padding: '12px',
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  scrollArea: {
    maxHeight: '300px',
    overflowY: 'auto'
  },
  iconButton: {
    padding: '6px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authHint: {
    fontSize: '11px',
    color: '#f59e0b',
    marginTop: '4px'
  }
};

// Icons as simple SVG components
const PlugIcon = () => (
  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const CheckIcon = () => (
  <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const RefreshIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export default function ConnectorPanel({ skillId, onToolsImported }) {
  const [activeConnections, setActiveConnections] = useState([]);
  const [prebuiltConnectors, setPrebuiltConnectors] = useState([]);
  const [connectingId, setConnectingId] = useState(null); // Track which connector is connecting
  const [loading, setLoading] = useState(false); // For general loading (import, custom connect)
  const [error, setError] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [discoveredTools, setDiscoveredTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [testingTool, setTestingTool] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Section expansion state
  const [expanded, setExpanded] = useState({
    active: true,
    available: true,
    custom: false,
    tools: true
  });

  // Custom MCP connection form
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customConfig, setCustomConfig] = useState({
    name: '',
    command: '',
    args: '',
    env: ''
  });

  // Load connectors on mount
  useEffect(() => {
    loadConnectors();
  }, []);

  async function loadConnectors() {
    try {
      const [active, prebuilt] = await Promise.all([
        listConnectors(),
        listPrebuiltConnectors()
      ]);
      setActiveConnections(active.connections || []);
      setPrebuiltConnectors(prebuilt.connectors || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConnectPrebuilt(connectorId) {
    setConnectingId(connectorId);
    setError(null);
    try {
      const result = await connectPrebuilt(connectorId);
      if (result.success) {
        setActiveConnections(prev => [...prev, {
          id: result.connection.id,
          name: prebuiltConnectors.find(c => c.id === connectorId)?.name || connectorId,
          connected: true,
          toolCount: result.connection.tools?.length || 0
        }]);
        // Auto-select and show tools
        setSelectedConnection(result.connection.id);
        setDiscoveredTools(result.connection.tools || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setConnectingId(null);
    }
  }

  async function handleConnectCustom() {
    if (!customConfig.command) {
      setError('Command is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const config = {
        name: customConfig.name || customConfig.command,
        command: customConfig.command,
        args: customConfig.args ? customConfig.args.split(' ').filter(Boolean) : [],
        env: customConfig.env ? JSON.parse(customConfig.env) : {}
      };

      const result = await connectMCP(config);
      if (result.success) {
        setActiveConnections(prev => [...prev, {
          id: result.connection.id,
          name: config.name,
          connected: true,
          toolCount: result.connection.tools?.length || 0
        }]);
        setSelectedConnection(result.connection.id);
        setDiscoveredTools(result.connection.tools || []);
        setShowCustomForm(false);
        setCustomConfig({ name: '', command: '', args: '', env: '' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(id) {
    try {
      await disconnectMCP(id);
      setActiveConnections(prev => prev.filter(c => c.id !== id));
      if (selectedConnection === id) {
        setSelectedConnection(null);
        setDiscoveredTools([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSelectConnection(id) {
    setSelectedConnection(id);
    setError(null);
    try {
      const result = await getConnectorTools(id);
      setDiscoveredTools(result.tools || []);
      setSelectedTools(new Set()); // Reset selection
    } catch (err) {
      setError(err.message);
      setDiscoveredTools([]);
    }
  }

  function toggleToolSelection(toolName) {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  }

  function selectAllTools() {
    setSelectedTools(new Set(discoveredTools.map(t => t.name)));
  }

  function deselectAllTools() {
    setSelectedTools(new Set());
  }

  async function handleTestTool(tool) {
    setTestingTool(tool.name);
    setTestResult(null);
    try {
      // For testing, we'll call with empty args or minimal args
      const result = await callConnectorTool(selectedConnection, tool.name, {});
      setTestResult({ success: true, data: result });
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingTool(null);
    }
  }

  async function handleImportTools() {
    if (!skillId) {
      setError('No skill selected. Please select a skill first.');
      return;
    }
    if (selectedTools.size === 0) {
      setError('Please select at least one tool to import.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await importConnectorTools(
        selectedConnection,
        skillId,
        Array.from(selectedTools),
        { requires_approval: 'never' } // Default policy
      );

      if (result.success && onToolsImported) {
        await onToolsImported(result.importedTools);
        // Clear selection after successful import
        setSelectedTools(new Set());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleSection = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Group connectors by category
  const groupedConnectors = {};
  prebuiltConnectors.forEach(connector => {
    const cat = connector.category || 'other';
    if (!groupedConnectors[cat]) groupedConnectors[cat] = [];
    groupedConnectors[cat].push(connector);
  });

  const categoryNames = {
    communication: 'Communication',
    development: 'Development',
    data: 'Data & Databases',
    utilities: 'Utilities',
    search: 'Search',
    automation: 'Automation',
    storage: 'Storage',
    location: 'Location',
    media: 'Media',
    reasoning: 'Reasoning',
    other: 'Other'
  };

  const categoryOrder = ['communication', 'development', 'data', 'utilities', 'search', 'automation', 'storage', 'location', 'media', 'reasoning', 'other'];

  return (
    <>
      {/* Section header with title and refresh */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--border)'
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: '600',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <PlugIcon />
          Connectors
        </span>
        <button
          onClick={loadConnectors}
          style={styles.iconButton}
          title="Refresh connectors"
        >
          <RefreshIcon />
        </button>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Connect to external services and import their tools
      </p>

      {/* Error banner */}
      {error && (
        <div style={styles.error}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ ...styles.iconButton, padding: '2px' }}>
            <XIcon />
          </button>
        </div>
      )}

      {/* Active Connections */}
      {activeConnections.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('active')}>
            <div style={styles.sectionTitle}>
              <span style={{ ...styles.expandIcon, transform: expanded.active ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
              Active Connections ({activeConnections.length})
            </div>
          </div>
          {expanded.active && (
            <div>
              {activeConnections.map(conn => (
                <div
                  key={conn.id}
                  style={{
                    ...styles.card,
                    cursor: 'pointer',
                    ...(selectedConnection === conn.id ? styles.cardSelected : {})
                  }}
                  onClick={() => handleSelectConnection(conn.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ ...styles.statusDot, ...styles.connectedDot }}></span>
                      <span style={{ fontSize: '13px', fontWeight: '500' }}>{conn.name}</span>
                      <span style={styles.tag}>{conn.toolCount} tools</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDisconnect(conn.id); }}
                      style={{ ...styles.button, ...styles.dangerButton, padding: '4px 8px', fontSize: '11px' }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Available Connectors */}
      <div style={styles.section}>
        <div style={styles.sectionHeader} onClick={() => toggleSection('available')}>
          <div style={styles.sectionTitle}>
            <span style={{ ...styles.expandIcon, transform: expanded.available ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Available Connectors ({prebuiltConnectors.length})
          </div>
        </div>
        {expanded.available && (
          <div>
            {categoryOrder
              .filter(cat => groupedConnectors[cat]?.length > 0)
              .map(cat => (
                <div key={cat}>
                  <div style={styles.categoryTitle}>
                    {categoryNames[cat] || cat}
                  </div>
                  {groupedConnectors[cat].map(connector => {
                    const isConnected = activeConnections.some(c => c.id === connector.id);
                    return (
                      <div key={connector.id} style={styles.card}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>{connector.name}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {connector.description}
                            </p>
                          </div>
                          {isConnected ? (
                            <span style={styles.connectedBadge}>
                              <CheckIcon /> Connected
                            </span>
                          ) : (
                            <button
                              onClick={() => handleConnectPrebuilt(connector.id)}
                              disabled={connectingId === connector.id}
                              style={{
                                ...styles.button,
                                ...styles.primaryButton,
                                marginLeft: '8px',
                                opacity: connectingId === connector.id ? 0.6 : 1
                              }}
                            >
                              {connectingId === connector.id ? '...' : 'Connect'}
                            </button>
                          )}
                        </div>
                        {connector.requiresAuth && !isConnected && (
                          <p style={styles.authHint}>
                            {connector.authInstructions || 'Requires authentication setup'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Custom MCP Server */}
      <div style={styles.section}>
        <div style={styles.sectionHeader} onClick={() => toggleSection('custom')}>
          <div style={styles.sectionTitle}>
            <span style={{ ...styles.expandIcon, transform: expanded.custom ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Custom MCP Server
          </div>
        </div>
        {expanded.custom && (
          <>
            {!showCustomForm ? (
              <button
                onClick={() => setShowCustomForm(true)}
                style={styles.customButton}
                onMouseEnter={(e) => { e.target.style.borderColor = 'var(--text-muted)'; e.target.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-muted)'; }}
              >
                + Connect your own MCP server
              </button>
            ) : (
              <div style={styles.formCard}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Name (optional)</label>
                  <input
                    type="text"
                    value={customConfig.name}
                    onChange={e => setCustomConfig(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="My MCP Server"
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Command *</label>
                  <input
                    type="text"
                    value={customConfig.command}
                    onChange={e => setCustomConfig(prev => ({ ...prev, command: e.target.value }))}
                    placeholder="python /path/to/server.py"
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Arguments (space-separated)</label>
                  <input
                    type="text"
                    value={customConfig.args}
                    onChange={e => setCustomConfig(prev => ({ ...prev, args: e.target.value }))}
                    placeholder="--port 8080 --verbose"
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Environment (JSON)</label>
                  <input
                    type="text"
                    value={customConfig.env}
                    onChange={e => setCustomConfig(prev => ({ ...prev, env: e.target.value }))}
                    placeholder='{"API_KEY": "xxx"}'
                    style={styles.input}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleConnectCustom}
                    disabled={loading}
                    style={{
                      ...styles.button,
                      ...styles.primaryButton,
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    {loading ? 'Connecting...' : 'Connect'}
                  </button>
                  <button
                    onClick={() => setShowCustomForm(false)}
                    style={{ ...styles.button, ...styles.secondaryButton }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Discovered Tools */}
      {selectedConnection && discoveredTools.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('tools')}>
            <div style={styles.sectionTitle}>
              <span style={{ ...styles.expandIcon, transform: expanded.tools ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
              Discovered Tools ({discoveredTools.length})
            </div>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); selectAllTools(); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px' }}
              >
                Select All
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deselectAllTools(); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
              >
                Clear
              </button>
            </div>
          </div>

          {expanded.tools && (
            <>
              <div style={styles.scrollArea}>
                {discoveredTools.map(tool => (
                  <div
                    key={tool.name}
                    style={{
                      ...styles.toolCard,
                      ...(selectedTools.has(tool.name) ? styles.toolCardSelected : {})
                    }}
                    onClick={() => toggleToolSelection(tool.name)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={selectedTools.has(tool.name)}
                            onChange={() => toggleToolSelection(tool.name)}
                            style={styles.checkbox}
                          />
                          <code style={styles.toolName}>{tool.name}</code>
                        </div>
                        <p style={{ ...styles.toolDescription, marginLeft: '22px' }}>
                          {tool.description || 'No description'}
                        </p>
                        {tool.inputSchema?.properties && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '22px' }}>
                            Inputs: {Object.keys(tool.inputSchema.properties).join(', ')}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTestTool(tool); }}
                        disabled={testingTool === tool.name}
                        style={{
                          ...styles.button,
                          ...styles.secondaryButton,
                          padding: '3px 8px',
                          fontSize: '10px',
                          opacity: testingTool === tool.name ? 0.6 : 1
                        }}
                      >
                        {testingTool === tool.name ? 'Testing...' : 'Test'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Test Result */}
              {testResult && (
                <div style={{
                  ...styles.testResult,
                  ...(testResult.success ? styles.testSuccess : styles.testError)
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: testResult.success ? '#34d399' : '#f87171' }}>
                    {testResult.success ? 'Success' : 'Error'}
                  </div>
                  <pre style={{ overflow: 'auto', maxHeight: '100px', margin: 0 }}>
                    {JSON.stringify(testResult.success ? testResult.data : testResult.error, null, 2)}
                  </pre>
                </div>
              )}

              {/* Import Button */}
              {selectedTools.size > 0 && (
                <div style={styles.importBar}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {selectedTools.size} tool{selectedTools.size > 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={handleImportTools}
                    disabled={loading || !skillId}
                    style={{
                      ...styles.button,
                      ...styles.successButton,
                      opacity: (loading || !skillId) ? 0.6 : 1
                    }}
                  >
                    {loading ? 'Importing...' : 'Import to Skill'}
                  </button>
                </div>
              )}
              {!skillId && selectedTools.size > 0 && (
                <p style={{ ...styles.authHint, marginTop: '8px' }}>
                  Please select a skill first to import tools
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
