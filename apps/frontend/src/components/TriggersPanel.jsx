/**
 * TriggersPanel - Manage skill triggers (schedule & event based)
 *
 * Allows creating, editing, and deleting triggers that execute
 * the skill automatically on a schedule or in response to events.
 * Integrates with CORE to show real-time trigger status and allow pause/resume.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TRIGGER_TYPES,
  TRIGGER_TYPE_LABELS,
  SCHEDULE_PRESETS,
  createEmptyTrigger,
  formatDuration
} from '../types/DraftDomain';
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
    textTransform: 'uppercase'
  },
  scheduleBadge: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa'
  },
  eventBadge: {
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#a855f7'
  },
  enabledBadge: {
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e'
  },
  disabledBadge: {
    background: 'rgba(107, 114, 128, 0.15)',
    color: '#6b7280'
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
  input: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none'
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
    fontFamily: 'inherit'
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
    cursor: 'pointer'
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
  // Type selector for new trigger
  typeSelector: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px'
  },
  typeOption: {
    flex: 1,
    padding: '16px',
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center'
  },
  typeOptionSelected: {
    borderColor: 'var(--accent)',
    background: 'rgba(59, 130, 246, 0.05)'
  },
  typeOptionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '4px'
  },
  typeOptionDesc: {
    fontSize: '11px',
    color: 'var(--text-muted)'
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

// Event type options for event triggers
const EVENT_TYPES = [
  { value: 'email.received', label: 'Email Received' },
  { value: 'slack.message', label: 'Slack Message' },
  { value: 'slack.mention', label: 'Slack Mention' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'custom', label: 'Custom Event' }
];

export default function TriggersPanel({
  triggers = [],
  skillId,
  onTriggersChange,
  skillDeployed = false
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTriggerType, setNewTriggerType] = useState('schedule');
  const [coreStatus, setCoreStatus] = useState({}); // { triggerId: { active, lastRun, nextRun } }
  const [coreLoading, setCoreLoading] = useState(false);
  const [togglingTrigger, setTogglingTrigger] = useState(null);

  // Fetch CORE status on mount and when skillDeployed changes
  const fetchCoreStatus = useCallback(async () => {
    if (!skillId || !skillDeployed) return;

    setCoreLoading(true);
    try {
      const result = await getTriggersStatus(skillId);
      // Convert array to map by trigger ID
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
    // Refresh every 30 seconds if deployed
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
      // Update local status
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
    const newTrigger = createEmptyTrigger(newTriggerType);
    const updated = [...triggers, newTrigger];
    onTriggersChange(updated);
    setExpandedId(newTrigger.id);
    setIsAdding(false);
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
    const isSchedule = trigger.type === 'schedule';

    return (
      <div style={styles.triggerBody}>
        {/* Trigger ID / Name */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Trigger Name / ID</label>
          <input
            type="text"
            style={styles.input}
            value={trigger.id}
            onChange={(e) => handleUpdateTrigger(trigger.id, 'id', e.target.value)}
            placeholder="e.g., Daily Report, Order Check"
          />
        </div>

        {/* Schedule-specific: Duration */}
        {isSchedule && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Run Every</label>
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
        )}

        {/* Event-specific: Event Type */}
        {!isSchedule && (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>Event Type</label>
              <select
                style={styles.select}
                value={trigger.event || ''}
                onChange={(e) => handleUpdateTrigger(trigger.id, 'event', e.target.value)}
              >
                <option value="">Select event type...</option>
                {EVENT_TYPES.map(et => (
                  <option key={et.value} value={et.value}>
                    {et.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Filter (JSON)</label>
              <input
                type="text"
                style={styles.input}
                value={trigger.filter ? JSON.stringify(trigger.filter) : ''}
                onChange={(e) => {
                  try {
                    const filter = e.target.value ? JSON.parse(e.target.value) : {};
                    handleUpdateTrigger(trigger.id, 'filter', filter);
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                placeholder='e.g., {"from": "support@"}'
              />
            </div>
          </>
        )}

        {/* Prompt */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Prompt (Goal)</label>
          <textarea
            style={styles.textarea}
            value={trigger.prompt || ''}
            onChange={(e) => handleUpdateTrigger(trigger.id, 'prompt', e.target.value)}
            placeholder="What should the skill do when this trigger fires?"
          />
        </div>

        {/* Concurrency */}
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
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Input (JSON)</label>
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
                placeholder='e.g., {"customer_id": "123"}'
              />
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
        {!isAdding && (
          <button
            style={styles.addButton}
            onClick={() => setIsAdding(true)}
          >
            + Add Trigger
          </button>
        )}
      </div>

      {/* New Trigger Type Selector */}
      {isAdding && (
        <div style={{ marginBottom: '16px' }}>
          <div style={styles.typeSelector}>
            {TRIGGER_TYPES.map(type => (
              <div
                key={type}
                style={{
                  ...styles.typeOption,
                  ...(newTriggerType === type ? styles.typeOptionSelected : {})
                }}
                onClick={() => setNewTriggerType(type)}
              >
                <div style={styles.typeOptionTitle}>
                  {TRIGGER_TYPE_LABELS[type]}
                </div>
                <div style={styles.typeOptionDesc}>
                  {type === 'schedule'
                    ? 'Run at regular intervals'
                    : 'Run when event occurs'
                  }
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              style={{ ...styles.deleteButton, background: 'transparent' }}
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </button>
            <button
              style={styles.addButton}
              onClick={handleAddTrigger}
            >
              Create {TRIGGER_TYPE_LABELS[newTriggerType]}
            </button>
          </div>
        </div>
      )}

      {/* Trigger List */}
      {triggers.length === 0 && !isAdding ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>&#9201;</div>
          <div style={styles.emptyText}>
            No triggers configured.<br />
            Add a trigger to automate skill execution.
          </div>
        </div>
      ) : (
        <div style={styles.triggerList}>
          {triggers.map(trigger => {
            const isExpanded = expandedId === trigger.id;
            const isSchedule = trigger.type === 'schedule';

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
                    <span
                      style={{
                        ...styles.typeBadge,
                        ...(isSchedule ? styles.scheduleBadge : styles.eventBadge)
                      }}
                    >
                      {isSchedule ? 'Schedule' : 'Event'}
                    </span>
                    <span style={styles.triggerName}>
                      {trigger.id || 'Untitled Trigger'}
                    </span>
                    <span style={styles.triggerMeta}>
                      {isSchedule
                        ? formatDuration(trigger.every)
                        : trigger.event || 'No event set'
                      }
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
