import { useState, useEffect } from 'react';
import { downloadMCPExport, getMCPFile, startMCPServer, stopMCPServer, getMCPServerStatus } from '../api/client';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },
  modal: {
    background: 'var(--bg-primary)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '1100px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid var(--border)'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px'
  },
  headerContent: {
    flex: 1
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px'
  },
  description: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5
  },
  badges: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px'
  },
  badge: {
    fontSize: '11px',
    padding: '4px 10px',
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
  runningBadge: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399',
    animation: 'pulse 2s infinite'
  },
  toolsBadge: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '6px',
    fontSize: '20px',
    lineHeight: 1
  },
  // Tabs
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    padding: '0 24px'
  },
  tab: {
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginBottom: '-1px'
  },
  tabActive: {
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px'
  },
  toolCard: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '14px 16px',
    marginBottom: '10px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  toolCardSelected: {
    borderColor: 'var(--accent)',
    background: 'rgba(16, 185, 129, 0.05)'
  },
  toolName: {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--accent)',
    marginBottom: '6px'
  },
  toolDescription: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5
  },
  toolMeta: {
    display: 'flex',
    gap: '12px',
    marginTop: '10px',
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px'
  },
  footerInfo: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  footerActions: {
    display: 'flex',
    gap: '10px'
  },
  button: {
    padding: '10px 18px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  primaryButton: {
    background: '#10b981',
    color: 'white'
  },
  runButton: {
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: 'white'
  },
  stopButton: {
    background: '#ef4444',
    color: 'white'
  },
  secondaryButton: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)'
  },
  // Tool Test Panel
  testPanel: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
    border: '1px solid var(--border)'
  },
  testPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  testPanelTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  paramInput: {
    marginBottom: '12px'
  },
  paramLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  },
  paramType: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontWeight: 'normal',
    marginLeft: '6px'
  },
  paramRequired: {
    fontSize: '10px',
    color: '#f87171',
    marginLeft: '4px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontFamily: 'monospace'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontFamily: 'monospace',
    minHeight: '80px',
    resize: 'vertical'
  },
  testActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px'
  },
  testButton: {
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: 'white'
  },
  resultPanel: {
    marginTop: '16px',
    padding: '12px',
    background: 'var(--bg-primary)',
    borderRadius: '6px',
    border: '1px solid var(--border)'
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  resultTitle: {
    fontSize: '12px',
    fontWeight: '600'
  },
  resultSuccess: {
    color: '#34d399'
  },
  resultError: {
    color: '#f87171'
  },
  resultContent: {
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflow: 'auto'
  },
  // Files Tab
  filesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '20px'
  },
  fileCard: {
    background: 'var(--bg-card)',
    padding: '12px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.15s ease'
  },
  fileCardSelected: {
    borderColor: 'var(--accent)',
    background: 'rgba(16, 185, 129, 0.05)'
  },
  fileName: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--accent)',
    marginBottom: '4px'
  },
  fileSize: {
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  // File Viewer
  fileViewer: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    overflow: 'hidden'
  },
  fileViewerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)'
  },
  fileViewerTitle: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--accent)'
  },
  fileViewerContent: {
    padding: '16px',
    maxHeight: '400px',
    overflow: 'auto'
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--text-primary)',
    margin: 0
  },
  // Server Status
  serverStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: 'var(--bg-card)',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  statusRunning: {
    background: '#10b981',
    boxShadow: '0 0 8px #10b981'
  },
  statusStopped: {
    background: 'var(--text-muted)'
  }
};

// Add pulse animation
if (typeof document !== 'undefined' && !document.getElementById('mcp-modal-styles')) {
  const style = document.createElement('style');
  style.id = 'mcp-modal-styles';
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

// Icons
const CloseIcon = () => (
  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const DownloadIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const PlayIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const StopIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);

const ToolIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const FileIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MCPDetailModal({ mcp, onClose }) {
  const [activeTab, setActiveTab] = useState('tools');
  const [selectedTool, setSelectedTool] = useState(null);
  const [paramValues, setParamValues] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // File viewer state
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  // Server state
  const [serverStatus, setServerStatus] = useState({ running: false });
  const [startingServer, setStartingServer] = useState(false);
  const [stoppingServer, setStoppingServer] = useState(false);

  // Check server status on mount
  useEffect(() => {
    checkServerStatus();
  }, [mcp.id]);

  const checkServerStatus = async () => {
    try {
      const status = await getMCPServerStatus(mcp.id);
      setServerStatus(status);
    } catch (err) {
      console.error('Failed to get server status:', err);
    }
  };

  const handleToolClick = (tool) => {
    if (selectedTool?.name === tool.name) {
      setSelectedTool(null);
      setParamValues({});
      setTestResult(null);
    } else {
      setSelectedTool(tool);
      const initial = {};
      (tool.parameters || []).forEach(p => {
        initial[p.name] = p.default || '';
      });
      setParamValues(initial);
      setTestResult(null);
    }
  };

  const handleParamChange = (paramName, value) => {
    setParamValues(prev => ({ ...prev, [paramName]: value }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    // Simulate test - in real implementation, this would call the MCP server
    setTimeout(() => {
      setTestResult({
        success: true,
        data: {
          message: `Tool "${selectedTool.name}" executed successfully (simulated)`,
          input: paramValues,
          output: { result: 'Sample output data' }
        }
      });
      setTesting(false);
    }, 1000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const data = await downloadMCPExport(mcp.id, mcp.version);
      data.files.forEach((file, index) => {
        setTimeout(() => downloadFile(file.name, file.content), index * 150);
      });
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleFileClick = async (file) => {
    if (selectedFile === file.name) {
      setSelectedFile(null);
      setFileContent(null);
      return;
    }

    setSelectedFile(file.name);
    setLoadingFile(true);

    try {
      const data = await getMCPFile(mcp.id, mcp.version, file.name);
      setFileContent(data.content);
    } catch (err) {
      console.error('Failed to load file:', err);
      setFileContent('// Error loading file');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleStartServer = async () => {
    setStartingServer(true);
    try {
      const result = await startMCPServer(mcp.id);
      setServerStatus({ running: true, ...result });
    } catch (err) {
      console.error('Failed to start server:', err);
      alert(`Failed to start server: ${err.message}`);
    } finally {
      setStartingServer(false);
    }
  };

  const handleStopServer = async () => {
    setStoppingServer(true);
    try {
      await stopMCPServer(mcp.id);
      setServerStatus({ running: false });
    } catch (err) {
      console.error('Failed to stop server:', err);
    } finally {
      setStoppingServer(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <div style={styles.title}>
              <ToolIcon />
              {mcp.name}
            </div>
            <div style={styles.description}>
              {mcp.description}
            </div>
            <div style={styles.badges}>
              <span style={{ ...styles.badge, ...styles.mcpBadge }}>MCP Server</span>
              <span style={{ ...styles.badge, ...styles.versionBadge }}>v{mcp.version}</span>
              <span style={{ ...styles.badge, ...styles.toolsBadge }}>{mcp.toolsCount} tools</span>
              {serverStatus.running && (
                <span style={{ ...styles.badge, ...styles.runningBadge }}>Running on :{serverStatus.port}</span>
              )}
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeTab === 'tools' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('tools')}
          >
            Tools ({mcp.toolsCount})
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'files' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('files')}
          >
            Files ({mcp.files?.length || 0})
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {activeTab === 'tools' && (
            <>
              {(mcp.tools || []).map(tool => (
                <div key={tool.name}>
                  <div
                    style={{
                      ...styles.toolCard,
                      ...(selectedTool?.name === tool.name ? styles.toolCardSelected : {})
                    }}
                    onClick={() => handleToolClick(tool)}
                  >
                    <div style={styles.toolName}>{tool.name}</div>
                    <div style={styles.toolDescription}>{tool.description}</div>
                    <div style={styles.toolMeta}>
                      <span>{(tool.parameters || []).length} parameters</span>
                      <span>Returns: {tool.returns?.type || 'any'}</span>
                      {tool.policy?.requires_approval && (
                        <span style={{ color: '#f59e0b' }}>Requires approval</span>
                      )}
                    </div>
                  </div>

                  {/* Test Panel */}
                  {selectedTool?.name === tool.name && (
                    <div style={styles.testPanel}>
                      <div style={styles.testPanelHeader}>
                        <div style={styles.testPanelTitle}>
                          <PlayIcon />
                          Test Tool: {tool.name}
                        </div>
                      </div>

                      {(tool.parameters || []).length > 0 ? (
                        (tool.parameters || []).map(param => (
                          <div key={param.name} style={styles.paramInput}>
                            <label style={styles.paramLabel}>
                              {param.name}
                              <span style={styles.paramType}>({param.type || 'string'})</span>
                              {param.required && <span style={styles.paramRequired}>*</span>}
                            </label>
                            {param.type === 'object' || param.type === 'array' ? (
                              <textarea
                                style={styles.textarea}
                                value={paramValues[param.name] || ''}
                                onChange={e => handleParamChange(param.name, e.target.value)}
                                placeholder={param.description || `Enter ${param.name}...`}
                              />
                            ) : (
                              <input
                                style={styles.input}
                                type={param.type === 'number' ? 'number' : 'text'}
                                value={paramValues[param.name] || ''}
                                onChange={e => handleParamChange(param.name, e.target.value)}
                                placeholder={param.description || `Enter ${param.name}...`}
                              />
                            )}
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                          This tool has no parameters
                        </div>
                      )}

                      <div style={styles.testActions}>
                        <button
                          style={{ ...styles.button, ...styles.testButton }}
                          onClick={handleTest}
                          disabled={testing}
                        >
                          <PlayIcon />
                          {testing ? 'Testing...' : 'Run Test'}
                        </button>
                        <button
                          style={{ ...styles.button, ...styles.secondaryButton }}
                          onClick={() => {
                            setSelectedTool(null);
                            setTestResult(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>

                      {testResult && (
                        <div style={styles.resultPanel}>
                          <div style={styles.resultHeader}>
                            <span style={{
                              ...styles.resultTitle,
                              ...(testResult.success ? styles.resultSuccess : styles.resultError)
                            }}>
                              {testResult.success ? 'Success' : 'Error'}
                            </span>
                          </div>
                          <pre style={styles.resultContent}>
                            {JSON.stringify(testResult.data || testResult.error, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {activeTab === 'files' && (
            <>
              <div style={styles.filesGrid}>
                {(mcp.files || []).map(file => (
                  <div
                    key={file.name}
                    style={{
                      ...styles.fileCard,
                      ...(selectedFile === file.name ? styles.fileCardSelected : {})
                    }}
                    onClick={() => handleFileClick(file)}
                  >
                    <div style={styles.fileName}>
                      <FileIcon /> {file.name}
                    </div>
                    <div style={styles.fileSize}>{formatBytes(file.size)}</div>
                  </div>
                ))}
              </div>

              {/* File Viewer */}
              {selectedFile && (
                <div style={styles.fileViewer}>
                  <div style={styles.fileViewerHeader}>
                    <span style={styles.fileViewerTitle}>{selectedFile}</span>
                    <button
                      style={{ ...styles.button, ...styles.secondaryButton, padding: '6px 12px' }}
                      onClick={() => {
                        setSelectedFile(null);
                        setFileContent(null);
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <div style={styles.fileViewerContent}>
                    {loadingFile ? (
                      <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
                    ) : (
                      <pre style={styles.codeBlock}>{fileContent}</pre>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerInfo}>
            Generated {formatDate(mcp.exportedAt)} | {mcp.exportType}
          </div>
          <div style={styles.footerActions}>
            {serverStatus.running ? (
              <button
                style={{ ...styles.button, ...styles.stopButton }}
                onClick={handleStopServer}
                disabled={stoppingServer}
              >
                <StopIcon />
                {stoppingServer ? 'Stopping...' : 'Stop'}
              </button>
            ) : (
              <button
                style={{ ...styles.button, ...styles.runButton }}
                onClick={handleStartServer}
                disabled={startingServer}
              >
                <PlayIcon />
                {startingServer ? 'Starting...' : 'Run'}
              </button>
            )}
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={handleDownload}
              disabled={downloading}
            >
              <DownloadIcon />
              {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
