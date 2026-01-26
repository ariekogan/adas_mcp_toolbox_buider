import { useState } from 'react';
import { generateMCP, downloadMCPExport } from '../api/client';

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
    width: '500px',
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
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto'
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
  generateBtn: {
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
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
  },
  progressBox: {
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    padding: '16px',
    fontSize: '13px',
    maxHeight: '200px',
    overflowY: 'auto'
  },
  progressItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    color: 'var(--text-secondary)'
  },
  progressItemActive: {
    color: 'var(--accent)',
    fontWeight: '500'
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  checkmark: {
    color: 'var(--success)',
    fontWeight: 'bold'
  },
  divider: {
    borderTop: '1px solid var(--border)',
    margin: '8px 0'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    marginBottom: '8px'
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
  const [loading, setLoading] = useState(null); // 'export' | 'deploy' | 'generate' | null
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [generationProgress, setGenerationProgress] = useState([]);
  const [generatedVersion, setGeneratedVersion] = useState(null);

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

  const handleGenerateMCP = async () => {
    setLoading('generate');
    setError(null);
    setResult(null);
    setGenerationProgress([]);
    setGeneratedVersion(null);

    try {
      for await (const event of generateMCP(skillId)) {
        if (event.type === 'phase_change') {
          setGenerationProgress(prev => [...prev, { type: 'phase', message: event.message }]);
        } else if (event.type === 'iteration') {
          // Update iteration count silently
        } else if (event.type === 'tool_use') {
          setGenerationProgress(prev => [...prev, { type: 'tool', message: `Using ${event.tool}...` }]);
        } else if (event.type === 'file_written') {
          setGenerationProgress(prev => [...prev, { type: 'file', message: `Created ${event.filename}`, done: true }]);
        } else if (event.type === 'generation_complete' || event.type === 'complete') {
          if (event.files && event.files.length > 0) {
            setGenerationProgress(prev => [...prev, { type: 'done', message: `Generation complete!`, done: true }]);
          }
          if (event.version) {
            setGeneratedVersion(event.version);
          }
        } else if (event.sessionId && event.version) {
          // Start event
          setGeneratedVersion(event.version);
          setGenerationProgress([{ type: 'start', message: `Starting generation for ${event.toolsCount} tools...` }]);
        }
      }

      setResult({
        type: 'generate',
        message: 'MCP server generated successfully!'
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadGenerated = async () => {
    if (!generatedVersion) return;

    setLoading('download');
    try {
      const data = await downloadMCPExport(skillId, generatedVersion);
      data.files.forEach((file, index) => {
        setTimeout(() => downloadFile(file.name, file.content), index * 150);
      });
      setResult({ type: 'download', message: `Downloaded ${data.files.length} generated files` });
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
    setGenerationProgress([]);
    setGeneratedVersion(null);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <style>
        {`@keyframes spin { to { transform: rotate(360deg); } }`}
      </style>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Export Skill</span>
          <button style={styles.closeBtn} onClick={handleClose}>&times;</button>
        </div>

        <div style={styles.content}>
          <div style={styles.description}>
            Export "{skillName}" as files, deploy to ADAS Core, or generate a complete MCP server.
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

          {/* Generation Progress */}
          {generationProgress.length > 0 && (
            <div style={styles.progressBox}>
              {generationProgress.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.progressItem,
                    ...(idx === generationProgress.length - 1 && loading === 'generate' ? styles.progressItemActive : {})
                  }}
                >
                  {item.done ? (
                    <span style={styles.checkmark}>✓</span>
                  ) : (
                    loading === 'generate' && idx === generationProgress.length - 1 ? (
                      <div style={styles.spinner} />
                    ) : (
                      <span>•</span>
                    )
                  )}
                  {item.message}
                </div>
              ))}
            </div>
          )}

          {/* Download generated files button */}
          {generatedVersion && result?.type === 'generate' && (
            <button
              style={{
                ...styles.secondaryBtn,
                ...(loading ? styles.disabledBtn : {})
              }}
              onClick={handleDownloadGenerated}
              disabled={!!loading}
            >
              {loading === 'download' ? 'Downloading...' : `Download Generated Files (v${generatedVersion})`}
            </button>
          )}

          <div style={styles.buttonGroup}>
            {/* MCP Generation - Primary action */}
            <div style={styles.sectionTitle}>AI-Powered Generation</div>
            <button
              style={{
                ...styles.generateBtn,
                ...(loading ? styles.disabledBtn : {})
              }}
              onClick={handleGenerateMCP}
              disabled={!!loading}
            >
              {loading === 'generate' ? (
                <>
                  <div style={styles.spinner} />
                  Generating MCP Server...
                </>
              ) : (
                <>
                  <span>✨</span>
                  Generate MCP Server
                </>
              )}
            </button>

            <div style={styles.divider} />

            {/* Other export options */}
            <div style={styles.sectionTitle}>Other Options</div>

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
              {loading === 'export' ? 'Exporting...' : 'Download Basic Files'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
