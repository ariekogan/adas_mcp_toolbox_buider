import { useState } from 'react';

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
    width: '450px',
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
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  description: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    lineHeight: '1.5',
    marginBottom: '8px'
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  primaryBtn: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'opacity 0.2s'
  },
  secondaryBtn: {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    padding: '14px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'opacity 0.2s'
  },
  disabledBtn: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  successMessage: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--success)',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  errorMessage: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: 'var(--error)',
    fontSize: '14px'
  },
  resultInfo: {
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--text-secondary)'
  }
};

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

export default function ExportModal({
  isOpen,
  onClose,
  skillId,
  skillName,
  onExportFiles,
  onDeployToAdas
}) {
  const [loading, setLoading] = useState(null); // 'export' | 'deploy' | null
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleExportFiles = async () => {
    setLoading('export');
    setError(null);
    setResult(null);
    try {
      const files = await onExportFiles();
      // Download each file
      files.forEach((file, index) => {
        setTimeout(() => downloadFile(file.name, file.content), index * 150);
      });
      setResult({ type: 'export', message: `Downloaded ${files.length} files` });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDeployToAdas = async () => {
    setLoading('deploy');
    setError(null);
    setResult(null);
    try {
      const res = await onDeployToAdas();
      setResult({
        type: 'deploy',
        message: `Deployed "${res.skillSlug}" with ${res.toolsCount} tools`,
        details: res
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    setLoading(null);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Export Skill</span>
          <button style={styles.closeBtn} onClick={handleClose}>&times;</button>
        </div>

        <div style={styles.content}>
          <div style={styles.description}>
            Export "{skillName}" as files or deploy directly to ADAS Core.
          </div>

          {error && (
            <div style={styles.errorMessage}>
              {error}
            </div>
          )}

          {result && (
            <div style={styles.successMessage}>
              <span style={{ fontSize: '16px' }}>&#10003;</span>
              {result.message}
            </div>
          )}

          {result?.type === 'deploy' && result.details && (
            <div style={styles.resultInfo}>
              <strong>Skill:</strong> {result.details.skillSlug}<br/>
              <strong>Tools:</strong> {result.details.toolsCount}
            </div>
          )}

          <div style={styles.buttonGroup}>
            <button
              style={{
                ...styles.primaryBtn,
                ...(loading ? styles.disabledBtn : {})
              }}
              onClick={handleDeployToAdas}
              disabled={!!loading}
            >
              {loading === 'deploy' ? 'Deploying...' : 'Deploy to ADAS'}
            </button>

            <button
              style={{
                ...styles.secondaryBtn,
                ...(loading ? styles.disabledBtn : {})
              }}
              onClick={handleExportFiles}
              disabled={!!loading}
            >
              {loading === 'export' ? 'Exporting...' : 'Download Files'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
