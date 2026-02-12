import { useState, useEffect, useCallback } from 'react';
import { getAgentApiStatus, startAgentApiTunnel, stopAgentApiTunnel, getTenant } from '../api/client';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100
  },
  modal: {
    background: 'var(--bg-card)',
    borderRadius: '12px',
    width: '540px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: 'var(--shadow)'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  body: {
    padding: '24px'
  },
  description: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '20px',
    lineHeight: '1.5'
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500'
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block'
  },
  actionBtn: {
    padding: '8px 18px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '13px',
    transition: 'opacity 0.2s'
  },
  startBtn: {
    background: 'var(--accent)',
    color: 'white'
  },
  stopBtn: {
    background: '#ef4444',
    color: 'white'
  },
  urlBox: {
    marginBottom: '20px',
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px'
  },
  urlText: {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: 'var(--accent)',
    wordBreak: 'break-all',
    flex: 1
  },
  copyBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '6px 12px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  section: {
    marginBottom: '16px'
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '8px',
    color: 'var(--text-secondary)'
  },
  note: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
    marginBottom: '12px'
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '14px 16px',
    whiteSpace: 'pre',
    color: 'var(--text-primary)',
    lineHeight: '1.6',
    position: 'relative',
    overflow: 'auto'
  },
  copyCodeBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '4px 8px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px'
  },
  errorText: {
    color: '#ef4444',
    fontSize: '13px',
    marginTop: '8px'
  },
  noToken: {
    padding: '16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  noTokenTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: '6px'
  },
  noTokenText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.5'
  }
};

export default function AgentApiModal({ onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null); // 'url' | 'snippet' | null

  const tenant = getTenant();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getAgentApiStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStart = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await startAgentApiTunnel();
      setStatus(prev => ({ ...prev, active: true, url: result.url }));
    } catch (err) {
      setError(err.message || 'Failed to start tunnel');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await stopAgentApiTunnel();
      setStatus(prev => ({ ...prev, active: false, url: null }));
    } catch (err) {
      setError(err.message || 'Failed to stop tunnel');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const tunnelUrl = status?.url || `https://${status?.domain || 'agent-api.ateam-ai.com'}`;

  const instructionSnippet = [
    'Use this API to build and deploy ADAS solutions:',
    `Base URL: ${tunnelUrl}`,
    `Header: X-ADAS-TENANT: ${tenant}`,
    'Start: GET /spec',
  ].join('\n');

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>
            <span>🤖</span> Agent API
          </span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.body}>
          <div style={styles.description}>
            Share this URL with an AI agent (Claude, GPT, Cursor, etc.) to let it build and deploy ADAS solutions on your behalf.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
              Loading status...
            </div>
          ) : (
            <>
              {/* No Auth Token Warning */}
              {!status?.hasAuthToken && (
                <div style={styles.noToken}>
                  <div style={styles.noTokenTitle}>NGROK_AUTHTOKEN not set</div>
                  <div style={styles.noTokenText}>
                    Set the <code>NGROK_AUTHTOKEN</code> environment variable on the backend server to enable the Agent API tunnel.
                  </div>
                </div>
              )}

              {/* Status & Toggle */}
              <div style={styles.statusRow}>
                <div style={styles.statusIndicator}>
                  <span style={{
                    ...styles.dot,
                    background: status?.active ? '#10b981' : '#6b7280',
                    boxShadow: status?.active ? '0 0 6px rgba(16, 185, 129, 0.5)' : 'none'
                  }} />
                  <span style={{ color: status?.active ? '#10b981' : 'var(--text-muted)' }}>
                    {status?.active ? 'Tunnel Active' : 'Tunnel Inactive'}
                  </span>
                </div>
                {status?.hasAuthToken && (
                  <button
                    style={{
                      ...styles.actionBtn,
                      ...(status?.active ? styles.stopBtn : styles.startBtn),
                      opacity: actionLoading ? 0.6 : 1,
                      cursor: actionLoading ? 'wait' : 'pointer'
                    }}
                    onClick={status?.active ? handleStop : handleStart}
                    disabled={actionLoading}
                  >
                    {actionLoading
                      ? (status?.active ? 'Stopping...' : 'Starting...')
                      : (status?.active ? 'Stop Tunnel' : 'Start Tunnel')
                    }
                  </button>
                )}
              </div>

              {/* URL Display */}
              {status?.active && status?.url && (
                <div style={styles.urlBox}>
                  <span style={styles.urlText}>{status.url}</span>
                  <button
                    style={styles.copyBtn}
                    onClick={() => copyToClipboard(status.url, 'url')}
                  >
                    {copied === 'url' ? '✓ Copied!' : '📋 Copy'}
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={styles.errorText}>{error}</div>
              )}

              {/* Tenant Note */}
              {status?.active && (
                <>
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Tenant Header</div>
                    <div style={styles.note}>
                      The agent must include this header in all requests:
                    </div>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)'
                    }}>
                      X-ADAS-TENANT: {tenant}
                    </div>
                  </div>

                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Quick Start</div>
                    <div style={styles.note}>
                      Tell the agent to call <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '3px' }}>GET {tunnelUrl}/spec</code> to learn the full API.
                    </div>
                  </div>

                  {/* Copyable Instruction Snippet */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Copy to Agent</div>
                    <div style={styles.note}>
                      Paste this into any AI agent to get started:
                    </div>
                    <div style={styles.codeBlock}>
                      <button
                        style={styles.copyCodeBtn}
                        onClick={() => copyToClipboard(instructionSnippet, 'snippet')}
                      >
                        {copied === 'snippet' ? '✓ Copied!' : 'Copy'}
                      </button>
                      {instructionSnippet}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
