/**
 * IdentityConfigPanel — Configure solution-level identity (actor types, roles, admin)
 *
 * Displayed as a tab in SolutionPanel. Allows CRUD on:
 *   - Actor types (key, label, description)
 *   - Admin roles (multi-select from actor type keys)
 *   - Default actor type (dropdown)
 *   - Default roles (multi-select)
 */

import React, { useState, useCallback } from 'react';

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
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
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
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
    background: 'var(--bg-card)',
    border: '1px dashed var(--border)',
    borderRadius: '8px',
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

  // New actor type form
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Editing state
  const [editingIdx, setEditingIdx] = useState(null);
  const [editKey, setEditKey] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const emitUpdate = useCallback((updates) => {
    if (onUpdate) onUpdate(updates);
  }, [onUpdate]);

  // ---- Actor Types ----

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

  // ---- Admin Roles ----

  const toggleAdminRole = (key) => {
    const updated = adminRoles.includes(key)
      ? adminRoles.filter(r => r !== key)
      : [...adminRoles, key];
    emitUpdate({ 'identity.admin_roles': updated });
  };

  // ---- Default Roles ----

  const toggleDefaultRole = (key) => {
    const updated = defaultRoles.includes(key)
      ? defaultRoles.filter(r => r !== key)
      : [...defaultRoles, key];
    emitUpdate({ 'identity.default_roles': updated });
  };

  // ---- Render ----

  return (
    <div style={styles.container}>

      {/* Actor Types */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Actor Types</div>
        {actorTypes.length === 0 ? (
          <div style={styles.empty}>No actor types defined yet. Add the user types for your solution below.</div>
        ) : (
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
                      <td style={{ ...styles.td, color: 'var(--text-muted)', fontSize: '12px' }}>{a.description || '—'}</td>
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
        )}

        {/* Add new actor type */}
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

      {/* Admin Roles */}
      {actorTypes.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Admin Roles</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Select which actor types have admin privileges (can manage other users, see all data)
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

      {/* Default Actor Type */}
      {actorTypes.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Defaults</div>

          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Default actor type</span>
            <select
              style={styles.select}
              value={defaultActorType}
              onChange={e => emitUpdate({ 'identity.default_actor_type': e.target.value })}
            >
              <option value="">— select —</option>
              {actorTypes.map(a => (
                <option key={a.key} value={a.key}>{a.label} ({a.key})</option>
              ))}
            </select>
          </div>

          <div style={{ ...styles.fieldRow, alignItems: 'flex-start' }}>
            <span style={styles.fieldLabel}>Default roles</span>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Roles assigned to new/unknown actors
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
