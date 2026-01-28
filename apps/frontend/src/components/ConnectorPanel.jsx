import { useState, useEffect } from 'react';
import {
  listConnectors,
  listPrebuiltConnectors,
  connectMCP,
  connectPrebuilt,
  disconnectMCP,
  getConnectorTools,
  callConnectorTool,
  importConnectorTools,
  getConnectorsADASStatus
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
  connectingBadge: {
    fontSize: '11px',
    padding: '4px 10px',
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '8px'
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(96, 165, 250, 0.3)',
    borderTopColor: '#60a5fa',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
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
  },
  adasStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    flexWrap: 'wrap'
  },
  adasBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px'
  },
  adasRunningBadge: {
    background: 'rgba(16, 185, 129, 0.12)',
    color: '#10b981'
  },
  adasStoppedBadge: {
    background: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24'
  },
  adasErrorBadge: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171'
  },
  adasNotInstalledBadge: {
    background: 'rgba(107, 114, 128, 0.12)',
    color: '#9ca3af'
  },
  adasSkillBadge: {
    background: 'rgba(59, 130, 246, 0.12)',
    color: '#60a5fa'
  },
  adasUnavailableBadge: {
    background: 'rgba(107, 114, 128, 0.08)',
    color: '#6b7280',
    fontStyle: 'italic'
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

const BackArrowIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const RefreshIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// Add spinner keyframes to document
if (typeof document !== 'undefined' && !document.getElementById('connector-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'connector-spinner-style';
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

export default function ConnectorPanel({ skillId, onToolsImported, standalone = false }) {
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
  const [loadingTools, setLoadingTools] = useState(false);

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

  // Environment variables form for prebuilt connectors
  const [expandedEnvForm, setExpandedEnvForm] = useState(null); // connector id
  const [envFormValues, setEnvFormValues] = useState({}); // { connectorId: { VAR_NAME: value } }

  // ADAS Core status
  const [adasStatus, setAdasStatus] = useState(null); // { adasAvailable, statuses }

  // Load connectors on mount
  useEffect(() => {
    loadConnectors();
  }, []);

  // Load ADAS status on mount and poll every 60 seconds
  useEffect(() => {
    loadAdasStatus();
    const interval = setInterval(loadAdasStatus, 60000);
    return () => clearInterval(interval);
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

  async function loadAdasStatus() {
    try {
      const data = await getConnectorsADASStatus();
      setAdasStatus(data);
    } catch (err) {
      // ADAS status is non-critical, fail silently
      console.warn('[ConnectorPanel] Failed to load ADAS status:', err.message);
    }
  }

  async function handleConnectPrebuilt(connectorId, envValues = {}) {
    setConnectingId(connectorId);
    setError(null);
    try {
      const result = await connectPrebuilt(connectorId, { extraEnv: envValues });
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
        // Clear the env form
        setExpandedEnvForm(null);
        setEnvFormValues(prev => {
          const next = { ...prev };
          delete next[connectorId];
          return next;
        });
        // Refresh ADAS status
        loadAdasStatus();
      }
    } catch (err) {
      // Try to parse structured error from API
      let errorData = null;
      try {
        // The error might contain JSON from the API response
        const match = err.message.match(/\{[\s\S]*\}/);
        if (match) {
          errorData = JSON.parse(match[0]);
        }
      } catch (e) {
        // Ignore parsing errors
      }

      if (errorData?.error) {
        // Structured error from validation layer
        const { title, message, recovery, severity } = errorData.error;
        setError({
          title,
          message,
          recovery,
          severity,
          connectorId
        });
      } else {
        // Fallback to simple error message
        const connector = prebuiltConnectors.find(c => c.id === connectorId);
        if (connector?.requiresAuth && err.message.includes('timeout')) {
          setError({
            title: 'Authentication required',
            message: connector.authInstructions,
            severity: 'warning',
            connectorId
          });
        } else {
          setError({
            title: 'Connection failed',
            message: err.message,
            severity: 'error',
            connectorId
          });
        }
      }
    } finally {
      setConnectingId(null);
    }
  }

  // Handle clicking Connect on a connector that requires env vars
  function handleConnectClick(connector) {
    console.log('[ENV_FORM] handleConnectClick', connector.id, 'envRequired:', connector.envRequired);
    if (connector.envRequired?.length > 0) {
      // Show env form
      setExpandedEnvForm(connector.id);
      // Initialize form values if not set
      if (!envFormValues[connector.id]) {
        const initialValues = {};
        connector.envRequired.forEach(varName => {
          initialValues[varName] = '';
        });
        setEnvFormValues(prev => ({ ...prev, [connector.id]: initialValues }));
      }
    } else {
      // Connect directly
      handleConnectPrebuilt(connector.id);
    }
  }

  function updateEnvValue(connectorId, varName, value) {
    setEnvFormValues(prev => ({
      ...prev,
      [connectorId]: {
        ...(prev[connectorId] || {}),
        [varName]: value
      }
    }));
  }

  function handleEnvFormSubmit(connector) {
    const envValues = envFormValues[connector.id] || {};
    // Check all required values are filled
    const missingVars = (connector.envRequired || []).filter(v => !envValues[v]?.trim());
    if (missingVars.length > 0) {
      setError(`Please fill in: ${missingVars.join(', ')}`);
      return;
    }
    handleConnectPrebuilt(connector.id, envValues);
  }

  function cancelEnvForm(connectorId) {
    setExpandedEnvForm(null);
    setEnvFormValues(prev => {
      const next = { ...prev };
      delete next[connectorId];
      return next;
    });
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
      // Refresh ADAS status
      loadAdasStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSelectConnection(id) {
    console.log('[ConnectorPanel] Selected connection:', id);
    setSelectedConnection(id);
    setError(null);
    setDiscoveredTools([]); // Clear while loading
    setSelectedTools(new Set());
    setLoadingTools(true);

    try {
      console.log('[ConnectorPanel] Fetching tools for:', id);
      const result = await getConnectorTools(id);
      console.log('[ConnectorPanel] Got tools:', result);
      setDiscoveredTools(result.tools || []);
    } catch (err) {
      console.error('[ConnectorPanel] Failed to load tools:', err);
      setError(`Failed to load tools: ${err.message}`);
      setDiscoveredTools([]);
    } finally {
      setLoadingTools(false);
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
      // Check if MCP returned an error in the response
      const hasError = result?.isError === true ||
                       result?.result?.isError === true ||
                       (result?.result?.content?.[0]?.text?.includes?.('error') && result?.result?.content?.[0]?.text?.includes?.('Invalid'));
      setTestResult({ success: !hasError, data: result });
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

  // Get selected connection name
  const selectedConnectionName = activeConnections.find(c => c.id === selectedConnection)?.name || selectedConnection;

  // ADAS Status Badges Component
  function ADASStatusBadges({ connectorId }) {
    if (!adasStatus) return null;

    const status = adasStatus.statuses?.[connectorId];
    if (!status && !adasStatus.adasAvailable) {
      return (
        <div style={styles.adasStatusRow}>
          <span style={{ ...styles.adasBadge, ...styles.adasUnavailableBadge }}>
            ADAS unreachable
          </span>
        </div>
      );
    }
    if (!status) return null;

    const statusBadgeStyle = {
      'running': styles.adasRunningBadge,
      'connected': styles.adasRunningBadge,
      'stopped': styles.adasStoppedBadge,
      'disconnected': styles.adasStoppedBadge,
      'error': styles.adasErrorBadge,
      'not_installed': styles.adasNotInstalledBadge
    }[status.status] || styles.adasNotInstalledBadge;

    const statusLabel = {
      'running': 'Running in ADAS',
      'connected': 'Running in ADAS',
      'stopped': 'Stopped in ADAS',
      'disconnected': 'Stopped in ADAS',
      'error': 'Error in ADAS',
      'not_installed': 'Not in ADAS'
    }[status.status] || status.status;

    const statusDot = {
      'running': '#10b981',
      'connected': '#10b981',
      'stopped': '#f59e0b',
      'disconnected': '#f59e0b',
      'error': '#ef4444',
      'not_installed': '#6b7280'
    }[status.status] || '#6b7280';

    return (
      <div style={styles.adasStatusRow}>
        {/* ADAS status badge */}
        <span style={{ ...styles.adasBadge, ...statusBadgeStyle }}>
          <span style={{
            width: '5px', height: '5px',
            borderRadius: '50%',
            background: statusDot,
            display: 'inline-block'
          }} />
          {statusLabel}
        </span>

        {/* Skills using this connector */}
        {status.usedBySkills?.length > 0 && (
          <span style={{ ...styles.adasBadge, ...styles.adasSkillBadge }}
                title={status.usedBySkills.map(s => s.name).join(', ')}>
            Used by {status.usedBySkills.length} skill{status.usedBySkills.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  }

  // Close tools view and go back to connectors list
  const handleCloseToolsView = () => {
    setSelectedConnection(null);
    setDiscoveredTools([]);
    setSelectedTools(new Set());
    setTestResult(null);
  };

  // If a connection is selected, show full-screen tools view
  if (selectedConnection) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header with back/close button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleCloseToolsView}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                fontSize: '11px'
              }}
              title="Back to connectors"
            >
              <BackArrowIcon />
              Back to connectors
            </button>
            <div>
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ ...styles.statusDot, ...styles.connectedDot }}></span>
                {selectedConnectionName}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {loadingTools ? 'Loading tools...' : `${discoveredTools.length} tools available`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
            <button
              onClick={selectAllTools}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px' }}
              disabled={loadingTools}
            >
              Select All
            </button>
            <button
              onClick={deselectAllTools}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
              disabled={loadingTools}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            ...styles.error,
            background: error.severity === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderColor: error.severity === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            color: error.severity === 'warning' ? '#fbbf24' : '#f87171'
          }}>
            <span>{typeof error === 'string' ? error : error.message}</span>
            <button onClick={() => setError(null)} style={{ ...styles.iconButton, padding: '2px' }}>
              <XIcon />
            </button>
          </div>
        )}

        {/* Tools list - takes remaining space */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loadingTools ? (
            <div style={{ ...styles.empty, display: 'flex', alignItems: 'center', gap: '8px', padding: '20px' }}>
              <span style={styles.spinner}></span>
              Fetching tools from connector...
            </div>
          ) : discoveredTools.length === 0 ? (
            <div style={styles.empty}>No tools found or connection lost</div>
          ) : (
            discoveredTools.map(tool => (
              <div
                key={tool.name}
                style={{
                  ...styles.toolCard,
                  ...(selectedTools.has(tool.name) ? styles.toolCardSelected : {})
                }}
                onClick={() => toggleToolSelection(tool.name)}
              >
                {/* Tool header row with checkbox and name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <input
                    type="checkbox"
                    checked={selectedTools.has(tool.name)}
                    onChange={() => toggleToolSelection(tool.name)}
                    style={styles.checkbox}
                  />
                  <code style={{ ...styles.toolName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.name}</code>
                </div>
                {/* Tool description */}
                <p style={{ ...styles.toolDescription, marginLeft: '22px', marginBottom: '2px' }}>
                  {tool.description || 'No description'}
                </p>
                {/* Tool inputs and test button row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginLeft: '22px', marginTop: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {tool.inputSchema?.properties ? `Inputs: ${Object.keys(tool.inputSchema.properties).join(', ')}` : ''}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleTestTool(tool); }}
                    disabled={testingTool === tool.name}
                    style={{
                      ...styles.button,
                      ...styles.secondaryButton,
                      padding: '2px 6px',
                      fontSize: '9px',
                      opacity: testingTool === tool.name ? 0.6 : 1
                    }}
                  >
                    {testingTool === tool.name ? '...' : 'Test'}
                  </button>
                </div>
              </div>
            ))
          )}

        </div>

        {/* Test Result Panel - takes half the area */}
        {testResult && (
          <div style={{
            flex: '0 0 50%',
            display: 'flex',
            flexDirection: 'column',
            borderTop: '1px solid var(--border)',
            marginTop: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid var(--border)'
            }}>
              <span style={{
                fontWeight: '600',
                fontSize: '12px',
                color: testResult.success ? '#34d399' : '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                {testResult.success ? '✓ Success' : '✗ Error'}
              </span>
              <button
                onClick={() => setTestResult(null)}
                style={{
                  ...styles.iconButton,
                  padding: '4px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px'
                }}
                title="Close test result"
              >
                <XIcon />
              </button>
            </div>
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '8px 0'
            }}>
              <pre style={{
                overflow: 'auto',
                margin: 0,
                fontSize: '11px',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {JSON.stringify(testResult.success ? testResult.data : testResult.error, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Import Button - fixed at bottom (hidden in standalone mode) */}
        {!standalone && selectedTools.size > 0 && (
          <div style={{ ...styles.importBar, marginTop: '12px' }}>
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
        {!standalone && !skillId && selectedTools.size > 0 && (
          <p style={{ ...styles.authHint, marginTop: '8px' }}>
            Please select a skill first to import tools
          </p>
        )}
      </div>
    );
  }

  // Main connectors view (no connection selected)
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

      {/* Error banner - supports both string and structured errors */}
      {error && (
        <div style={{
          ...styles.error,
          flexDirection: 'column',
          alignItems: 'stretch',
          background: error.severity === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          borderColor: error.severity === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          color: error.severity === 'warning' ? '#fbbf24' : '#f87171'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {/* Title */}
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                {typeof error === 'string' ? 'Error' : error.title || 'Error'}
              </div>
              {/* Message */}
              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                {typeof error === 'string' ? error : error.message}
              </div>
              {/* Recovery steps */}
              {error.recovery && error.recovery.length > 0 && (
                <ul style={{
                  margin: '8px 0 0 0',
                  paddingLeft: '16px',
                  fontSize: '11px',
                  opacity: 0.8
                }}>
                  {error.recovery.map((step, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>{step}</li>
                  ))}
                </ul>
              )}
            </div>
            <button onClick={() => setError(null)} style={{ ...styles.iconButton, padding: '2px', flexShrink: 0 }}>
              <XIcon />
            </button>
          </div>
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
                    cursor: 'pointer'
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
                    const isEnvFormExpanded = expandedEnvForm === connector.id;
                    const connectorEnvValues = envFormValues[connector.id] || {};

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
                          ) : connectingId === connector.id ? (
                            <span style={styles.connectingBadge}>
                              <span style={styles.spinner}></span>
                              Installing...
                            </span>
                          ) : isEnvFormExpanded ? null : (
                            <button
                              onClick={() => handleConnectClick(connector)}
                              style={{
                                ...styles.button,
                                ...styles.primaryButton,
                                marginLeft: '8px'
                              }}
                            >
                              Install & Connect
                            </button>
                          )}
                        </div>

                        {/* Environment variables form */}
                        {isEnvFormExpanded && !isConnected && (
                          <div style={{ marginTop: '12px', padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            {/* Setup instructions header */}
                            {connector.authInstructions && (
                              <div style={{
                                marginBottom: '16px',
                                padding: '10px 12px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '6px',
                                borderLeft: '3px solid #3b82f6',
                                fontSize: '12px',
                                color: '#93c5fd'
                              }}>
                                {connector.authInstructions}
                              </div>
                            )}

                            {connector.envRequired?.map(varName => {
                              const help = connector.envHelp?.[varName] || {};
                              const isSecret = varName.toLowerCase().includes('password') ||
                                              varName.toLowerCase().includes('token') ||
                                              varName.toLowerCase().includes('key') ||
                                              varName.toLowerCase().includes('secret');

                              return (
                                <div key={varName} style={{ marginBottom: '14px' }}>
                                  <label style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    color: 'var(--text-secondary)',
                                    marginBottom: '6px'
                                  }}>
                                    {help.label || varName}
                                  </label>
                                  <input
                                    type={isSecret ? 'password' : 'text'}
                                    value={connectorEnvValues[varName] || ''}
                                    onChange={(e) => updateEnvValue(connector.id, varName, e.target.value)}
                                    placeholder={help.placeholder || `Enter ${varName}`}
                                    style={{
                                      ...styles.input,
                                      fontFamily: isSecret ? 'inherit' : 'monospace',
                                      fontSize: '13px'
                                    }}
                                    autoComplete="off"
                                  />
                                  {/* Hint text */}
                                  {help.hint && (
                                    <div style={{
                                      fontSize: '11px',
                                      color: 'var(--text-muted)',
                                      marginTop: '4px',
                                      lineHeight: '1.4'
                                    }}>
                                      {help.hint}
                                    </div>
                                  )}
                                  {/* Help link */}
                                  {help.link && (
                                    <a
                                      href={help.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        fontSize: '11px',
                                        color: '#60a5fa',
                                        textDecoration: 'none',
                                        display: 'inline-block',
                                        marginTop: '4px'
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {help.linkText || 'Learn more →'}
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                              <button
                                onClick={() => handleEnvFormSubmit(connector)}
                                disabled={connectingId === connector.id}
                                style={{
                                  ...styles.button,
                                  ...styles.successButton,
                                  opacity: connectingId === connector.id ? 0.6 : 1
                                }}
                              >
                                {connectingId === connector.id ? 'Installing...' : 'Install & Connect'}
                              </button>
                              <button
                                onClick={() => cancelEnvForm(connector.id)}
                                style={{ ...styles.button, ...styles.secondaryButton }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Auth hint - show only when form is not expanded */}
                        {connector.requiresAuth && !isConnected && !isEnvFormExpanded && (
                          <p style={styles.authHint}>
                            {connector.authInstructions || 'Requires authentication setup'}
                          </p>
                        )}

                        {/* ADAS Core status indicators */}
                        <ADASStatusBadges connectorId={connector.id} />
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
                    {loading ? 'Installing...' : 'Install & Connect'}
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
    </>
  );
}
