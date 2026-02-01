import { useState, useRef, useEffect, useCallback } from 'react';
import ConnectorPanel from './ConnectorPanel';
import SkillMCPsSection from './SkillMCPsSection';
import MCPDetailModal from './MCPDetailModal';
import { importPackage, importSolutionPack, listImportedPackages, deployAllPackage } from '../api/client';

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
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  importBtn: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
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
    display: 'flex',
    overflow: 'hidden'
  },
  // Side-by-side panels - equal width split
  leftPanel: {
    flex: 1,
    minWidth: '300px',
    maxWidth: '50%',
    borderRight: '1px solid var(--border)',
    padding: '20px 24px',
    overflow: 'auto',
    background: 'var(--bg-secondary)'
  },
  rightPanel: {
    flex: 1,
    minWidth: '300px',
    padding: '20px 24px',
    overflow: 'auto'
  },
  // Import Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: 'var(--bg-secondary)',
    borderRadius: '12px',
    padding: '24px',
    width: '560px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflow: 'auto',
    border: '1px solid var(--border)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  modalDescription: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '20px',
    lineHeight: '1.5'
  },
  uploadArea: {
    border: '2px dashed var(--border)',
    borderRadius: '8px',
    padding: '32px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '16px'
  },
  uploadAreaActive: {
    borderColor: '#60a5fa',
    background: 'rgba(59, 130, 246, 0.05)'
  },
  uploadIcon: {
    fontSize: '32px',
    marginBottom: '12px'
  },
  uploadText: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  },
  uploadHint: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '16px 0',
    color: 'var(--text-muted)',
    fontSize: '12px'
  },
  orLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border)'
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    padding: '12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: 'var(--text-primary)',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box'
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid var(--border)'
  },
  cancelBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '10px 16px',
    fontSize: '13px',
    cursor: 'pointer'
  },
  submitBtn: {
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  submitBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  error: {
    padding: '12px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#f87171',
    fontSize: '12px',
    marginBottom: '16px'
  },
  success: {
    padding: '12px',
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '6px',
    color: '#34d399',
    fontSize: '12px',
    marginBottom: '16px'
  },
  // Imported Packages banner
  packagesBanner: {
    padding: '12px 24px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  packageChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '8px',
    fontSize: '13px',
    color: 'var(--text-primary)'
  },
  packageLabel: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontWeight: '500'
  },
  deployAllBtn: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  },
  deployAllBtnDisabled: {
    background: '#374151',
    cursor: 'not-allowed',
    opacity: 0.6
  },
  // Deploy Modal
  deployOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001
  },
  deployModal: {
    background: 'var(--bg-secondary)',
    borderRadius: '12px',
    padding: '24px',
    width: '600px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflow: 'auto',
    border: '1px solid var(--border)'
  },
  deployItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'var(--bg-primary)',
    marginBottom: '6px',
    fontSize: '13px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0
  },
  progressBar: {
    width: '100%',
    height: '4px',
    background: 'var(--bg-primary)',
    borderRadius: '2px',
    overflow: 'hidden',
    margin: '16px 0'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3b82f6, #10b981)',
    borderRadius: '2px',
    transition: 'width 0.3s ease'
  },
  fileTypeTag: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase'
  }
};

const UploadIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

// Helper: detect file type from extension/name
function detectFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return 'solution-pack';
  if (name.endsWith('.json')) return 'json';
  return 'unknown';
}

// Rocket icon for Deploy All
const RocketIcon = () => (
  <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 003.46-8.62 2.25 2.25 0 00-2.18-2.18c-3.22-.2-6.26 1.06-8.62 3.46m5.34 7.34L7.15 21.1A2.12 2.12 0 012.9 16.85l6.74-6.74" />
  </svg>
);

export default function ConnectorsPage({ onClose }) {
  const [selectedMCP, setSelectedMCP] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null); // For tar.gz uploads
  const fileInputRef = useRef(null);
  const connectorPanelRef = useRef(null);

  // Imported packages state
  const [packages, setPackages] = useState([]);

  // Deploy All state
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployingPackage, setDeployingPackage] = useState(null);
  const [deployProgress, setDeployProgress] = useState([]); // Array of { id, name, type, status, message }
  const [deployDone, setDeployDone] = useState(false);
  const [deployError, setDeployError] = useState(null);

  // Fetch imported packages on mount
  const loadPackages = useCallback(async () => {
    try {
      const data = await listImportedPackages();
      setPackages(data.packages || []);
    } catch (err) {
      console.error('Failed to load packages:', err);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const type = detectFileType(file);

    if (type === 'solution-pack') {
      // Store the File object for tar.gz upload
      setSelectedFile(file);
      setImportJson('');
      setImportError(null);
    } else {
      // JSON file — read text content
      setSelectedFile(null);
      try {
        const text = await file.text();
        setImportJson(text);
        setImportError(null);
      } catch (err) {
        setImportError('Failed to read file: ' + err.message);
      }
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const type = detectFileType(file);

    if (type === 'solution-pack') {
      setSelectedFile(file);
      setImportJson('');
      setImportError(null);
    } else {
      setSelectedFile(null);
      try {
        const text = await file.text();
        setImportJson(text);
        setImportError(null);
      } catch (err) {
        setImportError('Failed to read file: ' + err.message);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleImport = async () => {
    // Solution pack (.tar.gz) import
    if (selectedFile) {
      setImporting(true);
      setImportError(null);
      setImportSuccess(null);

      try {
        const result = await importSolutionPack(selectedFile);

        if (result.ok) {
          const summary = result.summary || {};
          const parts = [];
          if (summary.skills > 0) parts.push(`${summary.skills} skill${summary.skills > 1 ? 's' : ''}`);
          if (summary.connectors > 0) parts.push(`${summary.connectors} connector${summary.connectors > 1 ? 's' : ''}`);
          if (summary.mcpStoreConnectors > 0) parts.push(`${summary.mcpStoreConnectors} MCP source bundle${summary.mcpStoreConnectors > 1 ? 's' : ''}`);

          setImportSuccess(`Imported solution pack "${result.packageName || selectedFile.name}": ${parts.join(', ') || 'empty'}`);
          setSelectedFile(null);
          loadPackages();

          setTimeout(() => {
            setShowImportModal(false);
            setImportSuccess(null);
            window.location.reload();
          }, 2500);
        } else {
          setImportError(result.error || 'Import failed');
        }
      } catch (err) {
        setImportError(err.message || 'Import failed');
      } finally {
        setImporting(false);
      }
      return;
    }

    // JSON manifest import (existing logic)
    if (!importJson.trim()) {
      setImportError('Please provide manifest JSON or a .tar.gz solution pack');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const manifest = JSON.parse(importJson);
      const result = await importPackage(manifest);

      if (result.ok) {
        setImportSuccess(result.message || `Successfully imported ${result.package?.mcps?.length || 0} connectors`);
        setImportJson('');
        loadPackages();

        setTimeout(() => {
          setShowImportModal(false);
          setImportSuccess(null);
          window.location.reload();
        }, 2000);
      } else {
        setImportError(result.error || 'Import failed');
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        setImportError('Invalid JSON format. Please check the manifest file.');
      } else {
        setImportError(err.message || 'Import failed');
      }
    } finally {
      setImporting(false);
    }
  };

  const closeModal = () => {
    setShowImportModal(false);
    setImportJson('');
    setSelectedFile(null);
    setImportError(null);
    setImportSuccess(null);
  };

  // ---- Deploy All ----

  const handleDeployAll = async (pkg) => {
    setDeployingPackage(pkg);
    setShowDeployModal(true);
    setDeployDone(false);
    setDeployError(null);

    // Build initial progress items
    const items = [];
    if (pkg.mcps) {
      for (const mcp of pkg.mcps) {
        items.push({ id: mcp.id, name: mcp.name || mcp.id, type: 'connector', status: 'pending', message: '' });
      }
    }
    if (pkg.skills) {
      for (const skill of pkg.skills) {
        items.push({ id: skill.id, name: skill.name || skill.id, type: 'skill', status: 'pending', message: '' });
      }
    }
    setDeployProgress([...items]);

    try {
      await deployAllPackage(pkg.name, (event) => {
        setDeployProgress(prev => {
          const updated = [...prev];

          if (event.type === 'connector_progress') {
            const idx = updated.findIndex(i => i.id === event.connectorId && i.type === 'connector');
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                status: event.status, // 'deploying', 'done', 'error'
                message: event.message || ''
              };
            }
          } else if (event.type === 'skill_progress') {
            const idx = updated.findIndex(i => i.id === event.skillId && i.type === 'skill');
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                status: event.status,
                message: event.message || ''
              };
            }
          } else if (event.type === 'complete') {
            setDeployDone(true);
          } else if (event.type === 'error') {
            setDeployError(event.error || 'Deploy failed');
            setDeployDone(true);
          }

          return updated;
        });
      });
    } catch (err) {
      setDeployError(err.message);
      setDeployDone(true);
    }
  };

  const closeDeployModal = () => {
    setShowDeployModal(false);
    setDeployingPackage(null);
    setDeployProgress([]);
    setDeployDone(false);
    setDeployError(null);
  };

  // Deploy progress helpers
  const deployTotal = deployProgress.length;
  const deployCompleted = deployProgress.filter(i => i.status === 'done' || i.status === 'error').length;
  const deployPercent = deployTotal > 0 ? Math.round((deployCompleted / deployTotal) * 100) : 0;

  const statusColor = (status) => {
    switch (status) {
      case 'done': return '#10b981';
      case 'error': return '#ef4444';
      case 'deploying': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Connectors & MCPs</div>
          <div style={styles.subtitle}>Generated skill MCPs and external MCP connections</div>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.importBtn}
            onClick={() => setShowImportModal(true)}
            title="Import MCP package from external project"
          >
            <UploadIcon />
            Import Package
          </button>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Imported Packages Banner */}
      {packages.length > 0 && (
        <div style={styles.packagesBanner}>
          <span style={styles.packageLabel}>Packages:</span>
          {packages.map(pkg => (
            <div key={pkg.name} style={styles.packageChip}>
              <span>📦 {pkg.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {pkg.mcps?.length || 0} connectors · {pkg.skills?.length || 0} skills
              </span>
              {pkg.mcpStorePath && (
                <span style={{ ...styles.fileTypeTag, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                  code bundled
                </span>
              )}
              <button
                style={{
                  ...styles.deployAllBtn,
                  ...(deployingPackage ? styles.deployAllBtnDisabled : {})
                }}
                onClick={() => handleDeployAll(pkg)}
                disabled={!!deployingPackage}
                title="Deploy all connectors and skills to ADAS Core"
              >
                <RocketIcon />
                Deploy All
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content - Side by Side */}
      <div style={styles.content}>
        {/* Left Panel - Generated Skill MCPs */}
        <div style={styles.leftPanel}>
          <SkillMCPsSection onSelectMCP={setSelectedMCP} />
        </div>

        {/* Right Panel - External Connectors */}
        <div style={styles.rightPanel}>
          <ConnectorPanel
            ref={connectorPanelRef}
            skillId={null}
            onToolsImported={() => {}}
            standalone={true}
          />
        </div>
      </div>

      {/* MCP Detail Modal */}
      {selectedMCP && (
        <MCPDetailModal
          mcp={selectedMCP}
          onClose={() => setSelectedMCP(null)}
        />
      )}

      {/* Deploy All Modal */}
      {showDeployModal && deployingPackage && (
        <div style={styles.deployOverlay} onClick={deployDone ? closeDeployModal : undefined}>
          <div style={styles.deployModal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>
                🚀 Deploying: {deployingPackage.name}
              </div>
              {deployDone && (
                <button style={styles.modalCloseBtn} onClick={closeDeployModal}>✕</button>
              )}
            </div>

            {/* Progress bar */}
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${deployPercent}%` }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              {deployDone
                ? (deployError
                    ? `Completed with errors — ${deployCompleted}/${deployTotal}`
                    : `All ${deployTotal} items deployed successfully`)
                : `Deploying ${deployCompleted}/${deployTotal}...`
              }
            </div>

            {deployError && (
              <div style={styles.error}>{deployError}</div>
            )}

            {/* Connectors section */}
            {deployProgress.filter(i => i.type === 'connector').length > 0 && (
              <>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: '8px' }}>
                  Connectors
                </div>
                {deployProgress.filter(i => i.type === 'connector').map(item => (
                  <div key={item.id} style={styles.deployItem}>
                    <div style={{ ...styles.statusDot, background: statusColor(item.status) }} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{item.name}</span>
                    <span style={{ fontSize: '11px', color: statusColor(item.status) }}>
                      {item.status === 'pending' && 'Waiting...'}
                      {item.status === 'deploying' && (item.message || 'Deploying...')}
                      {item.status === 'done' && '✓ Deployed'}
                      {item.status === 'error' && `✗ ${item.message || 'Failed'}`}
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Skills section */}
            {deployProgress.filter(i => i.type === 'skill').length > 0 && (
              <>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: '16px' }}>
                  Skills
                </div>
                {deployProgress.filter(i => i.type === 'skill').map(item => (
                  <div key={item.id} style={styles.deployItem}>
                    <div style={{ ...styles.statusDot, background: statusColor(item.status) }} />
                    <span style={{ flex: 1, color: 'var(--text-primary)' }}>{item.name}</span>
                    <span style={{ fontSize: '11px', color: statusColor(item.status) }}>
                      {item.status === 'pending' && 'Waiting...'}
                      {item.status === 'deploying' && (item.message || 'Deploying...')}
                      {item.status === 'done' && '✓ Deployed'}
                      {item.status === 'error' && `✗ ${item.message || 'Failed'}`}
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Done actions */}
            {deployDone && (
              <div style={{ ...styles.modalActions, justifyContent: 'center' }}>
                <button
                  style={{ ...styles.submitBtn, background: '#374151' }}
                  onClick={closeDeployModal}
                >
                  Close
                </button>
                {!deployError && (
                  <button
                    style={styles.submitBtn}
                    onClick={() => { closeDeployModal(); window.location.reload(); }}
                  >
                    Refresh Page
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Package Modal */}
      {showImportModal && (
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>Import Solution Pack</div>
              <button style={styles.modalCloseBtn} onClick={closeModal}>✕</button>
            </div>

            <div style={styles.modalDescription}>
              Import a solution pack from an external project. Supports:<br/>
              • <strong>.tar.gz</strong> — Full solution pack (skills + connectors + MCP source code)<br/>
              • <strong>.json</strong> — Manifest only (connectors registered, no source code bundled)
            </div>

            {importError && (
              <div style={styles.error}>{importError}</div>
            )}

            {importSuccess && (
              <div style={styles.success}>{importSuccess}</div>
            )}

            {/* File Upload Area */}
            <div
              style={{
                ...styles.uploadArea,
                ...(dragActive ? styles.uploadAreaActive : {}),
                ...(selectedFile ? { borderColor: '#10b981', background: 'rgba(16, 185, 129, 0.05)' } : {})
              }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {selectedFile ? (
                <>
                  <div style={styles.uploadIcon}>✅</div>
                  <div style={{ ...styles.uploadText, color: '#34d399' }}>
                    {selectedFile.name}
                  </div>
                  <div style={styles.uploadHint}>
                    {(selectedFile.size / 1024).toFixed(1)} KB — Solution Pack ready to import
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.uploadIcon}>📦</div>
                  <div style={styles.uploadText}>
                    Drop solution pack or manifest here, or click to browse
                  </div>
                  <div style={styles.uploadHint}>
                    .tar.gz (solution pack) or .json (manifest only)
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.tar.gz,.tgz,application/json,application/gzip"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <div style={styles.orDivider}>
              <div style={styles.orLine}></div>
              <span>or paste JSON</span>
              <div style={styles.orLine}></div>
            </div>

            {/* JSON Textarea */}
            <div>
              <label style={styles.label}>Manifest JSON</label>
              <textarea
                style={styles.textarea}
                value={importJson}
                onChange={e => setImportJson(e.target.value)}
                placeholder='{"name": "my-package", "version": "1.0.0", "mcps": [...]}'
              />
            </div>

            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={closeModal}>
                Cancel
              </button>
              <button
                style={{
                  ...styles.submitBtn,
                  ...(importing || (!importJson.trim() && !selectedFile) ? styles.submitBtnDisabled : {})
                }}
                onClick={handleImport}
                disabled={importing || (!importJson.trim() && !selectedFile)}
              >
                {importing ? 'Importing...' : selectedFile ? 'Import Solution Pack' : 'Import Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
