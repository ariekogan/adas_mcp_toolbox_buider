import { useState, useEffect } from 'react';
import { listSkillMCPs, downloadMCPExport } from '../api/client';

const styles = {
  section: {
    marginBottom: '24px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: '8px 0',
    marginBottom: '12px'
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
    padding: '12px 14px',
    marginBottom: '8px',
    border: '1px solid transparent',
    transition: 'border-color 0.2s',
    cursor: 'pointer'
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
    gap: '8px'
  },
  cardMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic',
    padding: '12px 0'
  },
  tag: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)'
  },
  mcpBadge: {
    fontSize: '10px',
    padding: '2px 8px',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))',
    color: '#a78bfa',
    borderRadius: '4px',
    fontWeight: '500'
  },
  versionBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
    borderRadius: '4px'
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
  successButton: {
    background: '#10b981',
    color: 'white'
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
  detailsPane: {
    background: 'var(--bg-primary)',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid var(--border)',
    marginTop: '16px'
  },
  detailsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--border)'
  },
  detailsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  filesList: {
    marginTop: '12px'
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    background: 'var(--bg-card)',
    borderRadius: '6px',
    marginBottom: '6px',
    fontSize: '12px'
  },
  fileName: {
    fontFamily: 'monospace',
    color: 'var(--accent)'
  },
  fileSize: {
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  actionsRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px'
  },
  info: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '8px',
    padding: '8px 10px',
    background: 'var(--bg-card)',
    borderRadius: '6px'
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  }
};

// Icons
const MCPIcon = () => (
  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

const RefreshIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const DownloadIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const CloseIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Add spinner keyframes
if (typeof document !== 'undefined' && !document.getElementById('skill-mcp-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'skill-mcp-spinner-style';
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
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
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function SkillMCPsSection() {
  const [mcps, setMcps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [selectedMcp, setSelectedMcp] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadMcps();
  }, []);

  async function loadMcps() {
    setLoading(true);
    try {
      const data = await listSkillMCPs();
      setMcps(data);
    } catch (err) {
      console.error('Failed to load skill MCPs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(mcp) {
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
  }

  function handleSelectMcp(mcp) {
    if (selectedMcp?.id === mcp.id) {
      setSelectedMcp(null);
    } else {
      setSelectedMcp(mcp);
    }
  }

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={() => setExpanded(!expanded)}>
        <div style={styles.sectionTitle}>
          <span style={{ ...styles.expandIcon, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
          <MCPIcon />
          ADAS Skills MCPs ({mcps.length})
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); loadMcps(); }}
          style={styles.iconButton}
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>

      {expanded && (
        <>
          {loading ? (
            <div style={{ ...styles.empty, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.spinner}></span>
              Loading skill MCPs...
            </div>
          ) : mcps.length === 0 ? (
            <div style={styles.empty}>
              No generated MCP servers yet. Use the Export dialog on a skill to generate one.
            </div>
          ) : (
            <>
              {mcps.map(mcp => (
                <div
                  key={mcp.id}
                  style={{
                    ...styles.card,
                    ...(selectedMcp?.id === mcp.id ? styles.cardSelected : {})
                  }}
                  onClick={() => handleSelectMcp(mcp)}
                >
                  <div style={styles.cardTitle}>
                    <span>{mcp.name}</span>
                    <span style={styles.mcpBadge}>MCP</span>
                    <span style={styles.versionBadge}>v{mcp.version}</span>
                    <span style={styles.tag}>{mcp.toolsCount} tools</span>
                  </div>
                  <div style={styles.cardMeta}>
                    <span>Generated {formatDate(mcp.exportedAt)}</span>
                    <span>{mcp.files.length} files</span>
                    {mcp.hasServerPy && <span style={{ color: '#34d399' }}>server.py</span>}
                  </div>
                </div>
              ))}

              {/* Details Pane */}
              {selectedMcp && (
                <div style={styles.detailsPane}>
                  <div style={styles.detailsHeader}>
                    <div style={styles.detailsTitle}>
                      <MCPIcon />
                      {selectedMcp.name}
                      <span style={styles.versionBadge}>v{selectedMcp.version}</span>
                    </div>
                    <button
                      onClick={() => setSelectedMcp(null)}
                      style={styles.iconButton}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <div style={styles.info}>
                    <strong>Export Type:</strong> {selectedMcp.exportType}<br />
                    <strong>Generated:</strong> {formatDate(selectedMcp.exportedAt)}<br />
                    <strong>Tools:</strong> {selectedMcp.toolsCount}
                  </div>

                  <div style={styles.filesList}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Files
                    </div>
                    {selectedMcp.files.map(file => (
                      <div key={file.name} style={styles.fileItem}>
                        <span style={styles.fileName}>{file.name}</span>
                        <span style={styles.fileSize}>{formatBytes(file.size)}</span>
                      </div>
                    ))}
                  </div>

                  <div style={styles.actionsRow}>
                    <button
                      onClick={() => handleDownload(selectedMcp)}
                      disabled={downloading}
                      style={{
                        ...styles.button,
                        ...styles.successButton,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: downloading ? 0.6 : 1
                      }}
                    >
                      <DownloadIcon />
                      {downloading ? 'Downloading...' : 'Download Files'}
                    </button>
                  </div>

                  <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg-card)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <strong>Run locally:</strong><br />
                    <code style={{ display: 'block', marginTop: '4px', fontFamily: 'monospace', color: 'var(--accent)' }}>
                      cd downloaded_files && pip install -r requirements.txt && python server.py
                    </code>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
