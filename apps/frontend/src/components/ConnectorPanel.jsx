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

// Icons as simple SVG components
const PlugIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export default function ConnectorPanel({ skillId, onToolsImported }) {
  const [activeConnections, setActiveConnections] = useState([]);
  const [prebuiltConnectors, setPrebuiltConnectors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [discoveredTools, setDiscoveredTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [testingTool, setTestingTool] = useState(null);
  const [testResult, setTestResult] = useState(null);

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
    setLoading(true);
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
      setLoading(false);
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

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <PlugIcon />
            Connectors
          </h2>
          <button
            onClick={loadConnectors}
            className="p-2 hover:bg-gray-800 rounded"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Connect to external services and import their tools
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right">
            <XIcon />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Active Connections */}
        {activeConnections.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Active Connections</h3>
            <div className="space-y-2">
              {activeConnections.map(conn => (
                <div
                  key={conn.id}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedConnection === conn.id
                      ? 'bg-blue-900/30 border-blue-600'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => handleSelectConnection(conn.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="font-medium">{conn.name}</span>
                      <span className="text-xs text-gray-500">({conn.toolCount} tools)</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDisconnect(conn.id); }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pre-built Connectors - grouped by category */}
        <section>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Available Connectors ({prebuiltConnectors.length})
          </h3>
          {(() => {
            // Group connectors by category
            const categories = {};
            prebuiltConnectors.forEach(connector => {
              const cat = connector.category || 'other';
              if (!categories[cat]) categories[cat] = [];
              categories[cat].push(connector);
            });

            // Category display names and order
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

            return categoryOrder
              .filter(cat => categories[cat]?.length > 0)
              .map(cat => (
                <div key={cat} className="mb-4">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    {categoryNames[cat] || cat}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {categories[cat].map(connector => {
                      const isConnected = activeConnections.some(c => c.id === connector.id);
                      return (
                        <div
                          key={connector.id}
                          className="p-3 rounded border border-gray-700 bg-gray-800"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{connector.name}</span>
                              <p className="text-xs text-gray-400 truncate">{connector.description}</p>
                            </div>
                            {isConnected ? (
                              <span className="text-green-400 text-sm flex items-center gap-1 ml-2">
                                <CheckIcon /> Connected
                              </span>
                            ) : (
                              <button
                                onClick={() => handleConnectPrebuilt(connector.id)}
                                disabled={loading}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm ml-2 whitespace-nowrap"
                              >
                                {loading ? '...' : 'Connect'}
                              </button>
                            )}
                          </div>
                          {connector.requiresAuth && !isConnected && (
                            <p className="text-xs text-yellow-500 mt-1">
                              {connector.authInstructions || 'Requires authentication setup'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
          })()}
        </section>

        {/* Custom MCP Connection */}
        <section>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Custom MCP Server</h3>
          {!showCustomForm ? (
            <button
              onClick={() => setShowCustomForm(true)}
              className="w-full p-3 border border-dashed border-gray-600 rounded hover:border-gray-500 text-gray-400 hover:text-gray-300"
            >
              + Connect your own MCP server
            </button>
          ) : (
            <div className="p-4 border border-gray-700 rounded bg-gray-800 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={customConfig.name}
                  onChange={e => setCustomConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My MCP Server"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Command *</label>
                <input
                  type="text"
                  value={customConfig.command}
                  onChange={e => setCustomConfig(prev => ({ ...prev, command: e.target.value }))}
                  placeholder="python /path/to/server.py"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Arguments (space-separated)</label>
                <input
                  type="text"
                  value={customConfig.args}
                  onChange={e => setCustomConfig(prev => ({ ...prev, args: e.target.value }))}
                  placeholder="--port 8080 --verbose"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Environment (JSON)</label>
                <input
                  type="text"
                  value={customConfig.env}
                  onChange={e => setCustomConfig(prev => ({ ...prev, env: e.target.value }))}
                  placeholder='{"API_KEY": "xxx"}'
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConnectCustom}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-sm"
                >
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Discovered Tools */}
        {selectedConnection && discoveredTools.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-300">
                Discovered Tools ({discoveredTools.length})
              </h3>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAllTools} className="text-blue-400 hover:text-blue-300">
                  Select All
                </button>
                <button onClick={deselectAllTools} className="text-gray-400 hover:text-gray-300">
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-auto">
              {discoveredTools.map(tool => (
                <div
                  key={tool.name}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedTools.has(tool.name)
                      ? 'bg-green-900/20 border-green-700'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => toggleToolSelection(tool.name)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTools.has(tool.name)}
                          onChange={() => toggleToolSelection(tool.name)}
                          className="rounded"
                        />
                        <code className="text-sm font-mono text-blue-300">{tool.name}</code>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 ml-6">
                        {tool.description || 'No description'}
                      </p>
                      {tool.inputSchema?.properties && (
                        <div className="text-xs text-gray-500 mt-1 ml-6">
                          Inputs: {Object.keys(tool.inputSchema.properties).join(', ')}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTestTool(tool); }}
                      disabled={testingTool === tool.name}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                    >
                      {testingTool === tool.name ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`mt-2 p-3 rounded text-xs font-mono ${
                testResult.success ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
              }`}>
                <div className="font-bold mb-1">
                  {testResult.success ? 'Success' : 'Error'}
                </div>
                <pre className="overflow-auto max-h-32">
                  {JSON.stringify(testResult.success ? testResult.data : testResult.error, null, 2)}
                </pre>
              </div>
            )}

            {/* Import Button */}
            {selectedTools.size > 0 && (
              <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {selectedTools.size} tool{selectedTools.size > 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={handleImportTools}
                    disabled={loading || !skillId}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm font-medium"
                  >
                    {loading ? 'Importing...' : 'Import to Skill'}
                  </button>
                </div>
                {!skillId && (
                  <p className="text-xs text-yellow-500 mt-2">
                    Please select a skill first to import tools
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
