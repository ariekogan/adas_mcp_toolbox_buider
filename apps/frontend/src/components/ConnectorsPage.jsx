import { useState, useRef } from 'react';
import ConnectorPanel from './ConnectorPanel';
import SkillMCPsSection from './SkillMCPsSection';
import MCPDetailModal from './MCPDetailModal';
import { importPackage } from '../api/client';

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
  }
};

const UploadIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
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
  const fileInputRef = useRef(null);
  const connectorPanelRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setImportJson(text);
      setImportError(null);
    } catch (err) {
      setImportError('Failed to read file: ' + err.message);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setImportJson(text);
      setImportError(null);
    } catch (err) {
      setImportError('Failed to read file: ' + err.message);
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
    if (!importJson.trim()) {
      setImportError('Please provide manifest JSON');
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

        // Refresh the connector panel by closing and reopening the modal after a delay
        setTimeout(() => {
          setShowImportModal(false);
          setImportSuccess(null);
          // Force refresh - we'll trigger a reload in ConnectorPanel
          window.location.reload(); // Simple refresh for now
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
    setImportError(null);
    setImportSuccess(null);
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

      {/* Import Package Modal */}
      {showImportModal && (
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>Import MCP Package</div>
              <button style={styles.modalCloseBtn} onClick={closeModal}>✕</button>
            </div>

            <div style={styles.modalDescription}>
              Import connectors from an external MCP package (e.g., from the PB project).
              Upload the <code>manifest.json</code> file generated by <code>scripts/package.sh</code>.
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
                ...(dragActive ? styles.uploadAreaActive : {})
              }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div style={styles.uploadIcon}>📦</div>
              <div style={styles.uploadText}>
                Drop manifest.json here or click to browse
              </div>
              <div style={styles.uploadHint}>
                JSON file from package.sh output
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
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
                  ...(importing || !importJson.trim() ? styles.submitBtnDisabled : {})
                }}
                onClick={handleImport}
                disabled={importing || !importJson.trim()}
              >
                {importing ? 'Importing...' : 'Import Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
