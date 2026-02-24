import { useState, useEffect, useCallback } from 'react';
import {
  getAgentApiStatus,
  startAgentApiTunnel,
  stopAgentApiTunnel,
  rotateAgentApiKey,
  getTenant
} from '../api/client';

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
    width: '480px',
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
    marginBottom: '24px',
    lineHeight: '1.5'
  },
  keyBox: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '12px'
  },
  keyDisplay: {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: 'var(--text-primary)',
    letterSpacing: '0.3px',
    lineHeight: '1.6',
    wordBreak: 'break-all',
    marginBottom: '12px',
    userSelect: 'all'
  },
  keyActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  copyKeyBtn: {
    padding: '7px 20px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--accent)',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '13px',
    transition: 'opacity 0.2s'
  },
  smallBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '5px',
    padding: '6px 10px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s'
  },
  hint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
    marginBottom: '20px'
  },
  divider: {
    borderTop: '1px solid var(--border)',
    margin: '20px 0'
  },
  advancedToggle: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '4px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  advancedContent: {
    marginTop: '16px'
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    padding: '10px 14px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '500'
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block'
  },
  actionBtn: {
    padding: '6px 14px',
    borderRadius: '5px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '12px',
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
    marginBottom: '12px',
    padding: '10px 14px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px'
  },
  urlText: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--accent)',
    wordBreak: 'break-all',
    flex: 1
  },
  copyBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '5px',
    padding: '4px 10px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '8px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  note: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
    marginBottom: '8px'
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '11px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px 14px',
    whiteSpace: 'pre',
    color: 'var(--text-primary)',
    lineHeight: '1.6',
    position: 'relative',
    overflow: 'auto'
  },
  copyCodeBtn: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '3px 7px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px'
  },
  errorText: {
    color: '#ef4444',
    fontSize: '13px',
    marginTop: '8px'
  },
  providerBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }
};

/**
 * Mask an API key for display: show prefix + first 4 hex chars + dots
 */
function maskKey(key) {
  if (!key) return '\u2014';
  if (key.length <= 12) return key;
  return key.substring(0, 12) + '\u2022'.repeat(20);
}

export default function AgentApiModal({ onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const tenant = getTenant();
  const isCloudflare = status?.provider === 'cloudflare';

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

  const handleRotateKey = async () => {
    setRotating(true);
    setError(null);
    try {
      const result = await rotateAgentApiKey();
      setStatus(prev => ({ ...prev, apiKey: result.apiKey }));
      setShowKey(true);
      setConfirmRotate(false);
      setCopied(null);
    } catch (err) {
      setError(err.message || 'Failed to generate new key');
    } finally {
      setRotating(false);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const tunnelUrl = status?.url || `https://${status?.domain || 'api.ateam-ai.com'}`;
  const apiKey = status?.apiKey;

  const instructionSnippet = [
    'Use this API to build and deploy A-Team solutions:',
    `Base URL: ${tunnelUrl}`,
    `Header: X-ADAS-TENANT: ${tenant}`,
    ...(apiKey ? [`Header: X-API-KEY: ${apiKey}`] : []),
    'Start: GET /spec',
  ].join('\n');

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>API Key</span>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.body}>
          <div style={styles.description}>
            Copy this key and paste it into any AI agent (Claude, ChatGPT, Cursor, etc.) to let it build and deploy A-Team solutions on your behalf.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
              Loading...
            </div>
          ) : (
            <>
              {/* API Key — primary content */}
              {apiKey ? (
                <>
                  <div style={styles.keyBox}>
                    <div style={styles.keyDisplay}>
                      {showKey ? apiKey : maskKey(apiKey)}
                    </div>
                    <div style={styles.keyActions}>
                      <button
                        style={{
                          ...styles.copyKeyBtn,
                          background: copied === 'key' ? '#10b981' : 'var(--accent)'
                        }}
                        onClick={() => copyToClipboard(apiKey, 'key')}
                      >
                        {copied === 'key' ? 'Copied!' : 'Copy Key'}
                      </button>
                      <button
                        style={styles.smallBtn}
                        onClick={() => setShowKey(prev => !prev)}
                      >
                        {showKey ? 'Hide' : 'Reveal'}
                      </button>
                      <button
                        style={styles.smallBtn}
                        onClick={() => setConfirmRotate(true)}
                      >
                        Generate New
                      </button>
                    </div>

                    {/* Confirm rotation */}
                    {confirmRotate && (
                      <div style={{
                        marginTop: '10px',
                        padding: '10px 12px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontSize: '13px'
                      }}>
                        <div style={{ color: '#ef4444', fontWeight: 500, marginBottom: '6px' }}>
                          This will invalidate the current key.
                        </div>
                        <div style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '12px' }}>
                          Any agents using the old key will stop working.
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            style={{
                              ...styles.actionBtn,
                              background: '#ef4444',
                              color: 'white',
                              opacity: rotating ? 0.6 : 1
                            }}
                            onClick={handleRotateKey}
                            disabled={rotating}
                          >
                            {rotating ? 'Generating...' : 'Confirm'}
                          </button>
                          <button
                            style={{ ...styles.actionBtn, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                            onClick={() => setConfirmRotate(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={styles.hint}>
                    When an AI agent asks you to authenticate, paste this key. It identifies your account and tenant.
                  </div>
                </>
              ) : (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  marginBottom: '16px'
                }}>
                  No API key available
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={styles.errorText}>{error}</div>
              )}

              {/* Advanced — tunnel & technical details */}
              <div style={styles.divider} />
              <button
                style={styles.advancedToggle}
                onClick={() => setShowAdvanced(prev => !prev)}
              >
                <span style={{
                  display: 'inline-block',
                  transition: 'transform 0.2s',
                  transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
                  fontSize: '10px'
                }}>&#9654;</span>
                Advanced
              </button>

              {showAdvanced && (
                <div style={styles.advancedContent}>
                  {/* Tunnel Status */}
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
                      {status?.provider && (
                        <span style={{
                          ...styles.providerBadge,
                          background: isCloudflare ? 'rgba(249, 115, 22, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                          color: isCloudflare ? '#f97316' : '#6366f1'
                        }}>
                          {isCloudflare ? 'Cloudflare' : 'ngrok'}
                        </span>
                      )}
                    </div>
                    {!isCloudflare && status?.hasAuthToken && (
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
                          : (status?.active ? 'Stop' : 'Start')
                        }
                      </button>
                    )}
                  </div>

                  {/* URL Display */}
                  {status?.active && (
                    <div style={styles.urlBox}>
                      <span style={styles.urlText}>{tunnelUrl}</span>
                      <button
                        style={styles.copyBtn}
                        onClick={() => copyToClipboard(tunnelUrl, 'url')}
                      >
                        {copied === 'url' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}

                  {/* Tenant */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={styles.sectionTitle}>Tenant</div>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)'
                    }}>
                      {tenant}
                    </div>
                  </div>

                  {/* Copyable Instruction Snippet */}
                  {status?.active && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={styles.sectionTitle}>Agent Snippet</div>
                      <div style={styles.note}>
                        Paste this into any AI agent to get started:
                      </div>
                      <div style={styles.codeBlock}>
                        <button
                          style={styles.copyCodeBtn}
                          onClick={() => copyToClipboard(instructionSnippet, 'snippet')}
                        >
                          {copied === 'snippet' ? 'Copied!' : 'Copy'}
                        </button>
                        {instructionSnippet}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
