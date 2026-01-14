import { useState, useEffect } from 'react';

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
    zIndex: 1000
  },
  modal: {
    background: 'var(--bg-primary)',
    borderRadius: '12px',
    width: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border)'
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '18px',
    fontWeight: '600'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '20px',
    padding: '4px 8px'
  },
  content: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '20px'
  },
  fileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  fileName: {
    fontWeight: '500',
    fontSize: '14px'
  },
  fileSize: {
    color: 'var(--text-muted)',
    fontSize: '12px'
  },
  downloadBtn: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  downloadAllBtn: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    width: '100%'
  },
  previewSection: {
    marginTop: '20px'
  },
  previewTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '8px',
    color: 'var(--text-secondary)'
  },
  previewCode: {
    background: 'var(--bg-tertiary)',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    maxHeight: '200px',
    overflowY: 'auto',
    border: '1px solid var(--border)'
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
    flexWrap: 'wrap'
  },
  tab: {
    padding: '6px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  tabActive: {
    background: 'var(--accent)',
    color: 'white',
    borderColor: 'var(--accent)'
  },
  successMessage: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
    color: 'var(--success)',
    fontSize: '14px'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--text-muted)'
  }
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function downloadAllAsZip(files, domainName) {
  // Simple approach: download each file
  // For a real zip, you'd use a library like JSZip
  files.forEach((file, index) => {
    setTimeout(() => downloadFile(file.name, file.content), index * 200);
  });
}

export default function ExportModal({ isOpen, onClose, exportResult, files, domainName }) {
  const [activePreview, setActivePreview] = useState(null);

  useEffect(() => {
    if (files?.length > 0 && !activePreview) {
      // Default to domain.yaml preview
      const domainYaml = files.find(f => f.name === 'domain.yaml');
      setActivePreview(domainYaml?.name || files[0]?.name);
    }
  }, [files, activePreview]);

  if (!isOpen) return null;

  const activeFile = files?.find(f => f.name === activePreview);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Export Complete</span>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.content}>
          {exportResult && (
            <div style={styles.successMessage}>
              Successfully exported version {exportResult.version}
            </div>
          )}

          {!files ? (
            <div style={styles.loading}>Loading export files...</div>
          ) : (
            <>
              <div style={styles.fileList}>
                {files.map(file => (
                  <div key={file.name} style={styles.fileItem}>
                    <div>
                      <div style={styles.fileName}>{file.name}</div>
                      <div style={styles.fileSize}>{formatFileSize(file.content?.length || file.size || 0)}</div>
                    </div>
                    <button
                      style={styles.downloadBtn}
                      onClick={() => downloadFile(file.name, file.content)}
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>

              <button
                style={styles.downloadAllBtn}
                onClick={() => downloadAllAsZip(files, domainName)}
              >
                Download All Files
              </button>

              <div style={styles.previewSection}>
                <div style={styles.previewTitle}>Preview:</div>
                <div style={styles.tabs}>
                  {files.map(file => (
                    <div
                      key={file.name}
                      style={{
                        ...styles.tab,
                        ...(activePreview === file.name ? styles.tabActive : {})
                      }}
                      onClick={() => setActivePreview(file.name)}
                    >
                      {file.name}
                    </div>
                  ))}
                </div>
                <pre style={styles.previewCode}>
                  {activeFile?.content || 'Select a file to preview'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
