import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';

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
    overflow: 'auto',
    padding: '24px'
  },
  section: {
    marginBottom: '32px'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '16px'
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '20px'
  },
  policyItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--border)'
  },
  policyLabel: {
    fontSize: '14px',
    color: 'var(--text-primary)'
  },
  policyDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    background: 'var(--bg-tertiary)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  toggleEnabled: {
    background: 'var(--accent)'
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    background: 'white',
    borderRadius: '50%',
    transition: 'transform 0.2s'
  },
  toggleKnobEnabled: {
    transform: 'translateX(20px)'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: 'var(--text-muted)'
  },
  error: {
    padding: '16px',
    background: '#ef444420',
    border: '1px solid var(--error)',
    borderRadius: '8px',
    color: 'var(--error)',
    marginBottom: '16px'
  }
};

export default function PoliciesPage({ onClose }) {
  const [tenantConfig, setTenantConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Retention state
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleanupStats, setCleanupStats] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupError, setCleanupError] = useState(null);

  useEffect(() => {
    loadTenantConfig();
  }, []);

  const loadTenantConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const config = await api.getTenantConfig();
      setTenantConfig(config);
      setRetentionDays(config?.policies?.retention_days ?? 30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoProvision = useCallback(async () => {
    if (!tenantConfig) return;
    const current = tenantConfig.policies?.allow_external_users || false;
    try {
      setSaving(true);
      await api.updateTenantPolicies({ allow_external_users: !current });
      setTenantConfig(prev => ({
        ...prev,
        policies: { ...prev.policies, allow_external_users: !current }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [tenantConfig]);

  const handleSaveRetentionDays = useCallback(async (days) => {
    const value = Math.max(1, Math.min(365, Number(days) || 30));
    try {
      setSaving(true);
      await api.updateTenantPolicies({ retention_days: value });
      setRetentionDays(value);
      setTenantConfig(prev => ({
        ...prev,
        policies: { ...prev.policies, retention_days: value }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  const handlePreviewCleanup = useCallback(async () => {
    try {
      setCleanupLoading(true);
      setCleanupError(null);
      const result = await api.previewRetentionCleanup();
      setCleanupStats(result.stats);
    } catch (err) {
      setCleanupError(err.message);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  const handleRunCleanup = useCallback(async () => {
    try {
      setCleanupLoading(true);
      setCleanupError(null);
      const result = await api.triggerRetentionCleanup(false);
      setCleanupStats(result.stats);
    } catch (err) {
      setCleanupError(err.message);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Policies & Retention</div>
            <div style={styles.subtitle}>Configure system policies and data retention</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Close">&#10005;</button>
        </div>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  const policies = tenantConfig?.policies || {};

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Policies & Retention</div>
          <div style={styles.subtitle}>Configure system policies and data retention</div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">&#10005;</button>
      </div>

      <div style={styles.content}>
        {error && (
          <div style={styles.error}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>&#10005;</button>
          </div>
        )}

        {/* Policies */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Policies</div>
          <div style={styles.card}>
            <div style={styles.policyItem}>
              <div>
                <div style={styles.policyLabel}>Auto-provision external users</div>
                <div style={styles.policyDesc}>Automatically create actors for unknown senders</div>
              </div>
              <div
                style={{ ...styles.toggle, ...(policies.allow_external_users ? styles.toggleEnabled : {}) }}
                onClick={handleToggleAutoProvision}
              >
                <div style={{ ...styles.toggleKnob, ...(policies.allow_external_users ? styles.toggleKnobEnabled : {}) }} />
              </div>
            </div>
          </div>
        </div>

        {/* Data Retention */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Data Retention</div>
          <div style={styles.card}>
            <div style={styles.policyItem}>
              <div>
                <div style={styles.policyLabel}>Keep history</div>
                <div style={styles.policyDesc}>
                  Jobs, conversations, logs, and cache older than this are cleaned up daily (relative to latest activity)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Last</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  onBlur={(e) => handleSaveRetentionDays(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRetentionDays(e.target.value); }}
                  style={{
                    width: '60px', padding: '6px 8px', borderRadius: '6px',
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: '13px', textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>days</span>
              </div>
            </div>

            <div style={{ ...styles.policyItem, borderBottom: 'none' }}>
              <div>
                <div style={styles.policyLabel}>Manual cleanup</div>
                <div style={styles.policyDesc}>Preview or run cleanup immediately</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handlePreviewCleanup}
                  disabled={cleanupLoading || saving}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text-secondary)',
                    cursor: cleanupLoading || saving ? 'not-allowed' : 'pointer',
                    fontSize: '13px', opacity: cleanupLoading || saving ? 0.6 : 1
                  }}
                >
                  {cleanupLoading ? 'Scanning...' : 'Preview'}
                </button>
                <button
                  onClick={handleRunCleanup}
                  disabled={cleanupLoading || saving}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: '1px solid #f59e0b',
                    background: 'transparent', color: '#f59e0b',
                    cursor: cleanupLoading || saving ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: '500', opacity: cleanupLoading || saving ? 0.6 : 1
                  }}
                >
                  Clean Now
                </button>
              </div>
            </div>

            {cleanupError && (
              <div style={{
                marginTop: '12px', padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px', color: '#f87171', fontSize: '13px'
              }}>
                {cleanupError}
              </div>
            )}

            {cleanupStats && (
              <div style={{
                marginTop: '12px', padding: '12px 16px',
                background: 'var(--bg-primary)', borderRadius: '6px',
                border: '1px solid var(--border)', fontSize: '13px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
                  {cleanupStats.dryRun ? 'Preview' : 'Cleanup Complete'}
                  {' \u2014 '}
                  {cleanupStats.dryRun ? 'Would free' : 'Freed'}
                  {' '}
                  {formatBytes(cleanupStats.totalFreedBytes)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', color: 'var(--text-secondary)' }}>
                  <span>Jobs: {cleanupStats.jobs?.deleted || 0} {cleanupStats.dryRun ? 'to delete' : 'deleted'}</span>
                  <span>Conversations: {cleanupStats.conversations?.deleted || 0}</span>
                  <span>Trace logs: {cleanupStats.logs?.deleted || 0}</span>
                  <span>Focus cache: {cleanupStats.focusCache?.deleted || 0}</span>
                  <span>Audit logs: {cleanupStats.auditLogs?.deleted || 0}</span>
                  <span>Skills scanned: {cleanupStats.skills_scanned}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
