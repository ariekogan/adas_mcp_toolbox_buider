import { useState } from 'react';

const styles = {
  container: {
    width: '240px',
    height: '100%',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-secondary)'
  },
  newBtn: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px'
  },
  skill: {
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '4px',
    transition: 'background 0.2s'
  },
  skillActive: {
    background: 'var(--bg-tertiary)'
  },
  skillName: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px'
  },
  skillMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  status: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    marginLeft: '8px'
  },
  empty: {
    padding: '24px 16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px'
  },
  modal: {
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
  modalContent: {
    background: 'var(--bg-card)',
    padding: '24px',
    borderRadius: '12px',
    width: '400px',
    boxShadow: 'var(--shadow)'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    marginBottom: '16px'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px'
  },
  cancelBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer'
  },
  createBtn: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer'
  }
};

function getPhaseStyle(phase) {
  const colors = {
    PROBLEM_DISCOVERY: { bg: '#4f46e520', color: '#818cf8' },
    SCENARIO_EXPLORATION: { bg: '#f59e0b20', color: '#fbbf24' },
    INTENT_DEFINITION: { bg: '#ec489920', color: '#f472b6' },
    TOOLS_PROPOSAL: { bg: '#8b5cf620', color: '#a78bfa' },
    TOOL_DEFINITION: { bg: '#3b82f620', color: '#60a5fa' },
    POLICY_DEFINITION: { bg: '#14b8a620', color: '#2dd4bf' },
    MOCK_TESTING: { bg: '#06b6d420', color: '#22d3ee' },
    READY_TO_EXPORT: { bg: '#10b98120', color: '#34d399' },
    EXPORTED: { bg: '#10b98120', color: '#34d399' }
  };
  return colors[phase] || { bg: '#6b728020', color: '#9ca3af' };
}

function formatPhase(phase) {
  return (phase || 'draft').replace(/_/g, ' ').toLowerCase();
}

export default function SkillList({
  skills,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  loading
}) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName('');
    setShowNew(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Skills</span>
        <button style={styles.newBtn} onClick={() => setShowNew(true)}>
          + New
        </button>
      </div>

      <div style={styles.list}>
        {loading && <div style={styles.empty}>Loading...</div>}

        {!loading && skills.length === 0 && (
          <div style={styles.empty}>
            No skills yet.<br />Create one to get started!
          </div>
        )}

        {skills.map(skill => {
          const phaseStyle = getPhaseStyle(skill.phase);
          return (
            <div
              key={skill.id}
              style={{
                ...styles.skill,
                ...(skill.id === currentId ? styles.skillActive : {})
              }}
              onClick={() => onSelect(skill.id)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              onMouseLeave={e => {
                if (skill.id !== currentId) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div style={styles.skillName}>
                {skill.name}
              </div>
              <div style={styles.skillMeta}>
                {skill.tools_count || 0} tools · v{skill.version || 1}
                <span style={{
                  ...styles.status,
                  background: phaseStyle.bg,
                  color: phaseStyle.color
                }}>
                  {formatPhase(skill.phase)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <div style={styles.modal} onClick={() => setShowNew(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>New Skill</div>
            <input
              style={styles.input}
              placeholder="Skill name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button style={styles.createBtn} onClick={handleCreate}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
