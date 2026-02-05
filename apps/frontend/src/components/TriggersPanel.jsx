/**
 * TriggersPanel - Manage skill triggers (periodic timers)
 *
 * A trigger is a periodic timer that wakes the skill up to do work on its own,
 * without being triggered from the outside world. When the timer fires,
 * a job is created with the prompt as the goal, and the skill runs autonomously.
 *
 * Everything else (inter-skill communication, user requests, webhooks) is
 * handled through the normal chat/job system — not triggers.
 *
 * Integrates with CORE to show real-time trigger status and allow pause/resume.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  SCHEDULE_PRESETS,
  createEmptyScheduleTrigger,
  formatDuration
} from '../types/DraftSkill';
import { getTriggersStatus, toggleTriggerInCore } from '../api/client';

const styles = {
  container: {
    padding: '0'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  title: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  triggerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  triggerCard: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    overflow: 'hidden'
  },
  triggerCardExpanded: {
    border: '1px solid var(--accent)'
  },
  triggerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    cursor: 'pointer'
  },
  triggerHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1
  },
  triggerName: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)'
  },
  triggerMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  typeBadge: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '500',
    textTransform: 'uppercase',
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa'
  },
  triggerHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  toggleButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  toggleEnabled: {
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e'
  },
  toggleDisabled: {
    background: 'rgba(107, 114, 128, 0.15)',
    color: '#9ca3af'
  },
  expandIcon: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    transition: 'transform 0.2s'
  },
  triggerBody: {
    padding: '0 12px 12px 12px',
    borderTop: '1px solid var(--border)'
  },
  formGroup: {
    marginTop: '12px'
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase'
  },
  hint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '6px',
    lineHeight: '1.4'
  },
  fieldHint: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },
  row: {
    display: 'flex',
    gap: '12px'
  },
  col: {
    flex: 1
  },
  colSmall: {
    width: '120px',
    flexShrink: 0
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border)'
  },
  deleteButton: {
    padding: '6px 12px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  empty: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px'
  },
  emptyIcon: {
    fontSize: '32px',
    marginBottom: '12px',
    opacity: 0.5
  },
  emptyText: {
    marginBottom: '16px'
  },
  // CORE status section
  coreSection: {
    marginTop: '12px',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  coreLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase'
  },
  coreStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  coreStatusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  coreStatusActive: {
    background: '#22c55e'
  },
  coreStatusInactive: {
    background: '#6b7280'
  },
  coreStatusText: {
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  coreToggleBtn: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    marginLeft: '12px'
  }
};

// ── Flow diagram ───────────────────────────────────────────────────

function HowItWorksBox() {
  return (
    <div style={{
      marginTop: '12px',
      padding: '12px',
      background: 'rgba(59, 130, 246, 0.06)',
      border: '1px solid rgba(59, 130, 246, 0.15)',
      borderRadius: '8px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#60a5fa', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        How It Works
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap' }}>
        <FlowStep icon="&#8986;" label="Timer fires" color="#60a5fa" />
        <FlowArrow />
        <FlowStep icon="&#9881;" label="Job created" color="#60a5fa" />
        <FlowArrow />
        <FlowStep icon="&#9998;" label="Prompt = goal" color="#60a5fa" />
        <FlowArrow />
        <FlowStep icon="&#9889;" label="Skill runs" color="#60a5fa" />
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.5' }}>
        Every <strong style={{ color: 'var(--text-secondary)' }}>interval</strong>, the scheduler
        creates a new <strong style={{ color: 'var(--text-secondary)' }}>job</strong> with
        the <strong style={{ color: 'var(--text-secondary)' }}>prompt</strong> as the goal.
        The skill then runs autonomously — just like any other job.
      </div>
    </div>
  );
}

function FlowStep({ icon, label, color }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '6px 10px',
      minWidth: '80px',
    }}>
      <span style={{ fontSize: '16px', marginBottom: '2px' }}>{icon}</span>
      <span style={{ fontSize: '10px', color, fontWeight: '500', textAlign: 'center', lineHeight: '1.3' }}>{label}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <span style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 2px', paddingBottom: '14px' }}>&#8594;</span>
  );
}


// ── Main component ─────────────────────────────────────────────────

export default function TriggersPanel({
  triggers = [],
  skillId,
  onTriggersChange,
  skillDeployed = false
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [coreStatus, setCoreStatus] = useState({});
  const [coreLoading, setCoreLoading] = useState(false);
  const [togglingTrigger, setTogglingTrigger] = useState(null);

  // Fetch CORE status on mount and when skillDeployed changes
  const fetchCoreStatus = useCallback(async () => {
    if (!skillId || !skillDeployed) return;

    setCoreLoading(true);
    try {
      const result = await getTriggersStatus(skillId);
      const statusMap = {};
      (result.triggers || []).forEach(t => {
        statusMap[t.id] = {
          active: t.coreActive,
          lastRun: t.coreLastRun,
          nextRun: t.coreNextRun
        };
      });
      setCoreStatus(statusMap);
    } catch (err) {
      console.error('Failed to fetch trigger status from CORE:', err);
    } finally {
      setCoreLoading(false);
    }
  }, [skillId, skillDeployed]);

  useEffect(() => {
    fetchCoreStatus();
    if (skillDeployed) {
      const interval = setInterval(fetchCoreStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchCoreStatus, skillDeployed]);

  const handleCoreToggle = async (triggerId, active) => {
    if (!skillId) return;

    setTogglingTrigger(triggerId);
    try {
      await toggleTriggerInCore(skillId, triggerId, active);
      setCoreStatus(prev => ({
        ...prev,
        [triggerId]: { ...prev[triggerId], active }
      }));
    } catch (err) {
      console.error('Failed to toggle trigger in CORE:', err);
    } finally {
      setTogglingTrigger(null);
    }
  };

  const handleAddTrigger = () => {
    const newTrigger = createEmptyScheduleTrigger();
    const updated = [...triggers, newTrigger];
    onTriggersChange(updated);
    setExpandedId(newTrigger.id);
  };

  const handleUpdateTrigger = (triggerId, field, value) => {
    const updated = triggers.map(t => {
      if (t.id !== triggerId) return t;
      return { ...t, [field]: value };
    });
    onTriggersChange(updated);
  };

  const handleDeleteTrigger = (triggerId) => {
    const updated = triggers.filter(t => t.id !== triggerId);
    onTriggersChange(updated);
    setExpandedId(null);
  };

  const handleToggleEnabled = (triggerId, e) => {
    e.stopPropagation();
    const trigger = triggers.find(t => t.id === triggerId);
    if (trigger) {
      handleUpdateTrigger(triggerId, 'enabled', !trigger.enabled);
    }
  };

  const renderTriggerForm = (trigger) => {
    return (
      <div style={styles.triggerBody}>
        {/* How It Works */}
        <HowItWorksBox />

        {/* Trigger Name / ID */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Trigger Name / ID</label>
          <input
            type="text"
            style={styles.input}
            value={trigger.id}
            onChange={(e) => handleUpdateTrigger(trigger.id, 'id', e.target.value)}
            placeholder="e.g., health_check, daily_reconciliation"
          />
          <div style={styles.fieldHint}>
            Unique identifier for this trigger. Used in logs and state tracking.
          </div>
        </div>

        {/* Interval */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Run Every</label>
          <div style={styles.hint}>
            How often should the skill wake up?
          </div>
          <select
            style={styles.select}
            value={trigger.every || 'PT5M'}
            onChange={(e) => handleUpdateTrigger(trigger.id, 'every', e.target.value)}
          >
            {SCHEDULE_PRESETS.map(preset => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {/* Goal / Prompt */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Goal (Prompt)</label>
          <div style={styles.hint}>
            What should the skill do when it wakes up? This becomes the job's goal.
            The skill runs autonomously to fulfill it — just like any other job.
          </div>
          <textarea
            style={styles.textarea}
            value={trigger.prompt || ''}
            onChange={(e) => handleUpdateTrigger(trigger.id, 'prompt', e.target.value)}
            placeholder="e.g., Check all open orders and update their fulfillment status. If any orders have been stuck for more than 24 hours, escalate to the fulfillment team."
          />
        </div>

        {/* Concurrency + Input */}
        <div style={styles.formGroup}>
          <div style={styles.row}>
            <div style={styles.colSmall}>
              <label style={styles.label}>Concurrency</label>
              <input
                type="number"
                style={styles.input}
                value={trigger.concurrency || 1}
                min="1"
                max="10"
                onChange={(e) => handleUpdateTrigger(trigger.id, 'concurrency', parseInt(e.target.value) || 1)}
              />
              <div style={styles.fieldHint}>
                Max parallel jobs
              </div>
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Static Input (JSON)</label>
              <input
                type="text"
                style={styles.input}
                value={trigger.input ? JSON.stringify(trigger.input) : ''}
                onChange={(e) => {
                  try {
                    const input = e.target.value ? JSON.parse(e.target.value) : {};
                    handleUpdateTrigger(trigger.id, 'input', input);
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                placeholder='e.g., {"region": "us-east"}'
              />
              <div style={styles.fieldHint}>
                Extra context passed to every job from this trigger
              </div>
            </div>
          </div>
        </div>

        {/* CORE Status (if deployed) */}
        {skillDeployed && (
          <div style={styles.coreSection}>
            <div>
              <div style={styles.coreLabel}>Status in CORE</div>
              <div style={styles.coreStatus}>
                {coreLoading ? (
                  <span style={styles.coreStatusText}>Loading...</span>
                ) : (
                  <>
                    <div style={{
                      ...styles.coreStatusDot,
                      ...(coreStatus[trigger.id]?.active ? styles.coreStatusActive : styles.coreStatusInactive)
                    }} />
                    <span style={styles.coreStatusText}>
                      {coreStatus[trigger.id]?.active === null
                        ? 'Unknown'
                        : coreStatus[trigger.id]?.active
                          ? 'Active'
                          : 'Paused'
                      }
                    </span>
                    <button
                      style={{
                        ...styles.coreToggleBtn,
                        ...(coreStatus[trigger.id]?.active ? styles.toggleEnabled : styles.toggleDisabled),
                        opacity: togglingTrigger === trigger.id ? 0.6 : 1
                      }}
                      onClick={() => handleCoreToggle(trigger.id, !coreStatus[trigger.id]?.active)}
                      disabled={togglingTrigger === trigger.id}
                    >
                      {togglingTrigger === trigger.id
                        ? '...'
                        : coreStatus[trigger.id]?.active
                          ? 'Pause'
                          : 'Resume'
                      }
                    </button>
                  </>
                )}
              </div>
              {coreStatus[trigger.id]?.lastRun && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Last run: {new Date(coreStatus[trigger.id].lastRun).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={styles.deleteButton}
            onClick={() => handleDeleteTrigger(trigger.id)}
          >
            Delete Trigger
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>
          Triggers ({triggers.length})
        </span>
        <button
          style={styles.addButton}
          onClick={handleAddTrigger}
        >
          + Add Trigger
        </button>
      </div>

      {/* Trigger List */}
      {triggers.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>&#8986;</div>
          <div style={styles.emptyText}>
            No triggers configured.
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto', lineHeight: '1.6' }}>
            A trigger is a <strong style={{ color: 'var(--text-secondary)' }}>periodic timer</strong> that
            wakes the skill up to do work on its own — without anyone asking.<br /><br />
            When the timer fires, a job is created with the prompt as the goal.
            The skill then runs autonomously — just like any other job.
          </div>
        </div>
      ) : (
        <div style={styles.triggerList}>
          {triggers.map(trigger => {
            const isExpanded = expandedId === trigger.id;

            return (
              <div
                key={trigger.id}
                style={{
                  ...styles.triggerCard,
                  ...(isExpanded ? styles.triggerCardExpanded : {})
                }}
              >
                {/* Trigger Header */}
                <div
                  style={styles.triggerHeader}
                  onClick={() => setExpandedId(isExpanded ? null : trigger.id)}
                >
                  <div style={styles.triggerHeaderLeft}>
                    <span style={styles.typeBadge}>
                      Timer
                    </span>
                    <span style={styles.triggerName}>
                      {trigger.id || 'Untitled Trigger'}
                    </span>
                    <span style={styles.triggerMeta}>
                      {formatDuration(trigger.every)}
                    </span>
                  </div>
                  <div style={styles.triggerHeaderRight}>
                    <button
                      style={{
                        ...styles.toggleButton,
                        ...(trigger.enabled ? styles.toggleEnabled : styles.toggleDisabled)
                      }}
                      onClick={(e) => handleToggleEnabled(trigger.id, e)}
                    >
                      {trigger.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <span style={{
                      ...styles.expandIcon,
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}>
                      &#9662;
                    </span>
                  </div>
                </div>

                {/* Trigger Body (expanded) */}
                {isExpanded && renderTriggerForm(trigger)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
