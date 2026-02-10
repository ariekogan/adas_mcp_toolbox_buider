/**
 * IdentityConfigPanel — Configure solution-level users & roles
 *
 * Displayed as "Users & Roles" tab in SolutionPanel. Allows CRUD on:
 *   - User types (key, label, description)
 *   - Admin privileges (multi-select from user type keys)
 *   - Default user type (dropdown)
 *   - Default roles (multi-select)
 *
 * Features a friendly empty state with presets and plain-English explanations.
 */

import React, { useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════
// Presets — common user type patterns
// ═══════════════════════════════════════════════════════════════
const PRESETS = [
  {
    label: 'E-Commerce',
    description: 'Customer, Support Agent, Admin',
    actor_types: [
      { key: 'customer', label: 'Customer', description: 'End user who shops and contacts support' },
      { key: 'support_agent', label: 'Support Agent', description: 'Staff handling customer requests' },
      { key: 'admin', label: 'Admin', description: 'Back-office operations and full system access' },
    ],
    admin_roles: ['admin'],
    default_actor_type: 'customer',
    default_roles: ['customer'],
  },
  {
    label: 'SaaS Platform',
    description: 'User, Developer, Admin',
    actor_types: [
      { key: 'user', label: 'User', description: 'End user of the platform' },
      { key: 'developer', label: 'Developer', description: 'API integrator or builder' },
      { key: 'admin', label: 'Admin', description: 'Platform administrator with full access' },
    ],
    admin_roles: ['admin'],
    default_actor_type: 'user',
    default_roles: ['user'],
  },
  {
    label: 'Healthcare',
    description: 'Patient, Doctor, Nurse, Admin',
    actor_types: [
      { key: 'patient', label: 'Patient', description: 'Person receiving care' },
      { key: 'doctor', label: 'Doctor', description: 'Medical professional' },
      { key: 'nurse', label: 'Nurse', description: 'Nursing staff' },
      { key: 'admin', label: 'Admin', description: 'Healthcare facility administrator' },
    ],
    admin_roles: ['admin', 'doctor'],
    default_actor_type: 'patient',
    default_roles: ['patient'],
  },
  {
    label: 'Internal Ops',
    description: 'Employee, Manager, Admin',
    actor_types: [
      { key: 'employee', label: 'Employee', description: 'Regular staff member' },
      { key: 'manager', label: 'Manager', description: 'Team or department manager' },
      { key: 'admin', label: 'Admin', description: 'System administrator' },
    ],
    admin_roles: ['admin'],
    default_actor_type: 'employee',
    default_roles: ['employee'],
  },
];

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
const styles = {
  container: {
    padding: '0',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sectionDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginBottom: '12px',
    lineHeight: '1.5',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    fontSize: '13px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    fontSize: '13px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    outline: 'none',
    minWidth: '160px',
  },
  btnRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  btn: {
    padding: '6px 14px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  btnPrimary: {
    padding: '6px 14px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
  },
  btnDanger: {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    background: '#ef444420',
    color: '#ef4444',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    background: 'var(--accent-bg, #3b82f620)',
    color: 'var(--accent, #60a5fa)',
    marginRight: '6px',
    marginBottom: '4px',
  },
  badgeAdmin: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    background: '#f59e0b20',
    color: '#f59e0b',
    marginRight: '6px',
    marginBottom: '4px',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    fontSize: '13px',
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  fieldLabel: {
    fontSize: '13px',
    fontWeight: '500',
    minWidth: '140px',
    color: 'var(--text-secondary)',
  },
  // ── Empty state / onboarding ──
  emptyContainer: {
    padding: '20px 0',
  },
  emptyTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  emptyDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  presetsTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  presetsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    marginBottom: '16px',
  },
  presetCard: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg-card, var(--bg-secondary))',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  presetCardHover: {
    borderColor: 'var(--accent, #60a5fa)',
    background: 'var(--accent-bg, #3b82f610)',
  },
  presetLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '3px',
  },
  presetDesc: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '16px 0',
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border)',
  },
};

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function IdentityConfigPanel({ identity = {}, onUpdate }) {
  const actorTypes = identity.actor_types || [];
  const adminRoles = identity.admin_roles || [];
  const defaultActorType = identity.default_actor_type || '';
  const defaultRoles = identity.default_roles || [];

  // New user type form
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Editing state
  const [editingIdx, setEditingIdx] = useState(null);
  const [editKey, setEditKey] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Preset hover state
  const [hoveredPreset, setHoveredPreset] = useState(null);

  const emitUpdate = useCallback((updates) => {
    if (onUpdate) onUpdate(updates);
  }, [onUpdate]);

  // ── Presets ──

  const applyPreset = (preset) => {
    emitUpdate({
      'identity.actor_types': preset.actor_types,
      'identity.admin_roles': preset.admin_roles,
      'identity.default_actor_type': preset.default_actor_type,
      'identity.default_roles': preset.default_roles,
    });
  };

  // ── User Types ──

  const addActorType = () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key) return;
    if (actorTypes.some(a => a.key === key)) return;

    const updated = [...actorTypes, { key, label: newLabel.trim() || key, description: newDesc.trim() }];
    emitUpdate({ 'identity.actor_types': updated });
    setNewKey('');
    setNewLabel('');
    setNewDesc('');
  };

  const removeActorType = (key) => {
    const updated = actorTypes.filter(a => a.key !== key);
    const updates = { 'identity.actor_types': updated };

    // Clean up references
    if (defaultActorType === key) {
      updates['identity.default_actor_type'] = updated.length > 0 ? updated[0].key : '';
    }
    if (adminRoles.includes(key)) {
      updates['identity.admin_roles'] = adminRoles.filter(r => r !== key);
    }
    if (defaultRoles.includes(key)) {
      updates['identity.default_roles'] = defaultRoles.filter(r => r !== key);
    }
    emitUpdate(updates);
  };

  const startEdit = (idx) => {
    const a = actorTypes[idx];
    setEditingIdx(idx);
    setEditKey(a.key);
    setEditLabel(a.label || '');
    setEditDesc(a.description || '');
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const updated = [...actorTypes];
    const oldKey = updated[editingIdx].key;
    const newEditKey = editKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!newEditKey) return;

    updated[editingIdx] = { key: newEditKey, label: editLabel.trim() || newEditKey, description: editDesc.trim() };

    const updates = { 'identity.actor_types': updated };

    // Update references if key changed
    if (oldKey !== newEditKey) {
      if (defaultActorType === oldKey) updates['identity.default_actor_type'] = newEditKey;
      if (adminRoles.includes(oldKey)) {
        updates['identity.admin_roles'] = adminRoles.map(r => r === oldKey ? newEditKey : r);
      }
      if (defaultRoles.includes(oldKey)) {
        updates['identity.default_roles'] = defaultRoles.map(r => r === oldKey ? newEditKey : r);
      }
    }

    emitUpdate(updates);
    setEditingIdx(null);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
  };

  // ── Admin Roles ──

  const toggleAdminRole = (key) => {
    const updated = adminRoles.includes(key)
      ? adminRoles.filter(r => r !== key)
      : [...adminRoles, key];
    emitUpdate({ 'identity.admin_roles': updated });
  };

  // ── Default Roles ──

  const toggleDefaultRole = (key) => {
    const updated = defaultRoles.includes(key)
      ? defaultRoles.filter(r => r !== key)
      : [...defaultRoles, key];
    emitUpdate({ 'identity.default_roles': updated });
  };

  // ═══════════════════════════════════════════════════════════════
  // Empty State — friendly onboarding
  // ═══════════════════════════════════════════════════════════════

  if (actorTypes.length === 0) {
    return (
      <div style={styles.emptyContainer}>
        <div style={styles.emptyTitle}>Who uses your solution?</div>
        <div style={styles.emptyDesc}>
          Define the types of people who will interact with your solution.
          For example, an e-commerce solution might have <strong>Customers</strong> who
          contact support, <strong>Support Agents</strong> who help them,
          and <strong>Admins</strong> who manage the system — each with different access levels.
        </div>

        <div style={styles.presetsTitle}>Start with a template</div>
        <div style={styles.presetsGrid}>
          {PRESETS.map((preset) => (
            <div
              key={preset.label}
              style={{
                ...styles.presetCard,
                ...(hoveredPreset === preset.label ? styles.presetCardHover : {}),
              }}
              onMouseEnter={() => setHoveredPreset(preset.label)}
              onMouseLeave={() => setHoveredPreset(null)}
              onClick={() => applyPreset(preset)}
            >
              <div style={styles.presetLabel}>{preset.label}</div>
              <div style={styles.presetDesc}>{preset.description}</div>
            </div>
          ))}
        </div>

        <div style={styles.orDivider}>
          <div style={styles.dividerLine} />
          <span>or add manually</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Manual add form */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <input
            style={{ ...styles.input, maxWidth: '120px' }}
            placeholder="key"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActorType()}
          />
          <input
            style={{ ...styles.input, maxWidth: '140px' }}
            placeholder="Label"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActorType()}
          />
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="Description"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActorType()}
          />
          <button style={styles.btnPrimary} onClick={addActorType} disabled={!newKey.trim()}>
            Add
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Normal State — user types configured
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={styles.container}>

      {/* User Types */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>User Types</div>
        <div style={styles.sectionDesc}>The different types of people who interact with your solution</div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Key</th>
              <th style={styles.th}>Label</th>
              <th style={styles.th}>Description</th>
              <th style={{ ...styles.th, width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {actorTypes.map((a, idx) => (
              <tr key={a.key}>
                {editingIdx === idx ? (
                  <>
                    <td style={styles.td}>
                      <input style={styles.input} value={editKey} onChange={e => setEditKey(e.target.value)} />
                    </td>
                    <td style={styles.td}>
                      <input style={styles.input} value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                    </td>
                    <td style={styles.td}>
                      <input style={styles.input} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button style={styles.btnPrimary} onClick={saveEdit}>Save</button>
                        <button style={styles.btn} onClick={cancelEdit}>Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={styles.td}>
                      <code style={{ fontSize: '12px' }}>{a.key}</code>
                      {adminRoles.includes(a.key) && <span style={styles.badgeAdmin}>admin</span>}
                      {defaultActorType === a.key && <span style={styles.badge}>default</span>}
                    </td>
                    <td style={styles.td}>{a.label}</td>
                    <td style={{ ...styles.td, color: 'var(--text-muted)', fontSize: '12px' }}>{a.description || '\u2014'}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button style={styles.btn} onClick={() => startEdit(idx)}>Edit</button>
                        <button style={styles.btnDanger} onClick={() => removeActorType(a.key)}>Remove</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add new user type */}
        <div style={{ ...styles.btnRow, marginTop: '12px', gap: '6px', alignItems: 'flex-end' }}>
          <input
            style={{ ...styles.input, maxWidth: '120px' }}
            placeholder="key"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActorType()}
          />
          <input
            style={{ ...styles.input, maxWidth: '140px' }}
            placeholder="Label"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActorType()}
          />
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="Description"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActorType()}
          />
          <button style={styles.btnPrimary} onClick={addActorType} disabled={!newKey.trim()}>
            Add
          </button>
        </div>
      </div>

      {/* Admin Privileges */}
      {actorTypes.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Admin Privileges</div>
          <div style={styles.sectionDesc}>
            Which user types can manage settings, view all data, and administer the system
          </div>
          {actorTypes.map(a => (
            <label key={a.key} style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={adminRoles.includes(a.key)}
                onChange={() => toggleAdminRole(a.key)}
              />
              <span>{a.label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({a.key})</span>
            </label>
          ))}
        </div>
      )}

      {/* Defaults */}
      {actorTypes.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Defaults</div>

          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Default user type</span>
            <select
              style={styles.select}
              value={defaultActorType}
              onChange={e => emitUpdate({ 'identity.default_actor_type': e.target.value })}
            >
              <option value="">{'\u2014'} select {'\u2014'}</option>
              {actorTypes.map(a => (
                <option key={a.key} value={a.key}>{a.label} ({a.key})</option>
              ))}
            </select>
          </div>

          <div style={{ ...styles.fieldRow, alignItems: 'flex-start' }}>
            <span style={styles.fieldLabel}>Roles for new users</span>
            <div>
              <div style={styles.sectionDesc}>
                What permissions do new or unidentified users start with
              </div>
              {actorTypes.map(a => (
                <label key={a.key} style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={defaultRoles.includes(a.key)}
                    onChange={() => toggleDefaultRole(a.key)}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
