import { useState, useEffect } from 'react';
import { listTemplates } from '../api/client';

// ═══════════════════════════════════════════════════════════════
// SOLUTION STYLES (added for unified sidebar)
// ═══════════════════════════════════════════════════════════════
const solutionStyles = {
  solutionItem: {
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '2px',
    transition: 'background 0.2s',
  },
  solutionItemActive: {
    background: 'var(--bg-tertiary)',
  },
  solutionName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  solutionMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '2px',
    paddingLeft: '22px',
  },
  childSkill: {
    paddingLeft: '28px',
  },
  separator: {
    height: '1px',
    background: 'var(--border)',
    margin: '8px 0',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '8px 12px 4px',
  },
};

const styles = {
  container: {
    height: '100%',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
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
    transition: 'background 0.2s',
    position: 'relative'
  },
  skillActive: {
    background: 'var(--bg-tertiary)'
  },
  skillHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  skillName: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px'
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    opacity: 0.4,
    transition: 'opacity 0.2s, color 0.2s'
  },
  deleteBtnVisible: {
    opacity: 0.7
  },
  deleteBtnHover: {
    color: 'var(--error)',
    background: 'var(--error)15'
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
    width: '480px',
    maxHeight: '80vh',
    overflow: 'auto',
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
    marginBottom: '16px',
    boxSizing: 'border-box'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  },
  templateSection: {
    marginBottom: '20px'
  },
  templateGrid: {
    display: 'grid',
    gap: '8px',
    maxHeight: '240px',
    overflow: 'auto'
  },
  templateCard: {
    padding: '12px',
    background: 'var(--bg-secondary)',
    border: '2px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s'
  },
  templateCardSelected: {
    borderColor: 'var(--accent)',
    background: 'var(--accent)10'
  },
  templateCardHover: {
    borderColor: 'var(--text-muted)'
  },
  templateName: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px'
  },
  templateDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: '1.4',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  },
  templateMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '8px'
  },
  blankOption: {
    padding: '12px',
    background: 'var(--bg-tertiary)',
    border: '2px dashed var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    transition: 'border-color 0.2s'
  },
  blankOptionSelected: {
    borderColor: 'var(--accent)',
    background: 'var(--accent)10'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '8px'
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
  },
  createBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  loadingTemplates: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px'
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
  loading,
  // Solution props
  solutions = [],
  currentSolutionId = null,
  onSelectSolution,
  onCreateSolution,
  onDeleteSolution,
  selectedType = 'skill', // 'skill' | 'solution'
  // Collapse props
  collapsed = false,
  onToggleCollapse,
}) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null); // null = blank
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [hoveredSkill, setHoveredSkill] = useState(null);
  const [hoveredDelete, setHoveredDelete] = useState(false);
  const [hoveredTemplate, setHoveredTemplate] = useState(null);

  // Load templates when modal opens
  useEffect(() => {
    if (showNew) {
      setTemplatesLoading(true);
      listTemplates()
        .then(setTemplates)
        .catch(err => {
          console.error('Failed to load templates:', err);
          setTemplates([]);
        })
        .finally(() => setTemplatesLoading(false));
    }
  }, [showNew]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreate(newName.trim(), selectedTemplate);
    setNewName('');
    setSelectedTemplate(null);
    setShowNew(false);
  };

  const handleClose = () => {
    setNewName('');
    setSelectedTemplate(null);
    setShowNew(false);
  };

  // Skills have solution_id set by backend via linked_skills - use it directly
  // Skills NOT in any solution = those without solution_id
  const standaloneSkills = skills.filter(s => !s.solution_id);

  // Debug: log skills and their solution_ids
  console.log('[SkillList] skills:', skills.length, 'with solution_ids:', skills.map(s => ({ id: s.id, name: s.name, solution_id: s.solution_id })));

  const renderSkillItem = (skill, indent = false) => {
    const phaseStyle = getPhaseStyle(skill.phase);
    const isHovered = hoveredSkill === skill.id;
    const isActive = selectedType === 'skill' && skill.id === currentId;

    if (collapsed) {
      const initial = (skill.name || '?')[0].toUpperCase();
      return (
        <div
          key={skill.id}
          title={skill.name}
          style={{
            ...styles.skill,
            textAlign: 'center',
            padding: '8px 4px',
            ...(isActive || isHovered ? styles.skillActive : {})
          }}
          onClick={() => onSelect(skill.id)}
          onMouseEnter={() => setHoveredSkill(skill.id)}
          onMouseLeave={() => { setHoveredSkill(null); setHoveredDelete(false); }}
        >
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: phaseStyle.bg, color: phaseStyle.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: '600', margin: '0 auto',
          }}>
            {initial}
          </div>
        </div>
      );
    }

    return (
      <div
        key={skill.id}
        title={skill.name}
        style={{
          ...styles.skill,
          ...(indent ? solutionStyles.childSkill : {}),
          ...(isActive || isHovered ? styles.skillActive : {})
        }}
        onClick={() => onSelect(skill.id)}
        onMouseEnter={() => setHoveredSkill(skill.id)}
        onMouseLeave={() => {
          setHoveredSkill(null);
          setHoveredDelete(false);
        }}
      >
        <div style={styles.skillHeader}>
          <div style={styles.skillName}>
            {indent ? '├─ ' : ''}{skill.name}
          </div>
          <button
            style={{
              ...styles.deleteBtn,
              ...(isHovered ? styles.deleteBtnVisible : {}),
              ...(hoveredDelete && isHovered ? styles.deleteBtnHover : {})
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${skill.name}"?`)) {
                onDelete(skill.id);
              }
            }}
            onMouseEnter={() => setHoveredDelete(true)}
            onMouseLeave={() => setHoveredDelete(false)}
          >
            ✕
          </button>
        </div>
        <div style={{ ...styles.skillMeta, ...(indent ? { paddingLeft: '24px' } : {}) }}>
          {skill.tools_count || 0} tools
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
  };

  const collapseTextStyle = {
    opacity: collapsed ? 0 : 1,
    transition: 'opacity 0.15s ease',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  };

  return (
    <div style={{
      ...styles.container,
      width: collapsed ? '48px' : '240px',
      transition: 'width 0.2s ease',
      minWidth: collapsed ? '48px' : '240px',
    }}>
      <div style={styles.header}>
        {!collapsed && <span style={styles.title}>Builder</span>}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: '4px',
            fontSize: '14px',
            lineHeight: 1,
            transition: 'color 0.2s',
          }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <div style={styles.list}>
        {loading && <div style={styles.empty}>Loading...</div>}

        {/* New Solution button — always at the top */}
        {onCreateSolution && (
          <div
            title="New Solution"
            style={{
              ...solutionStyles.solutionItem,
              color: 'var(--text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: collapsed ? 'center' : 'left',
            }}
            onClick={() => {
              const name = prompt('Solution name:');
              if (name?.trim()) onCreateSolution(name.trim());
            }}
          >
            {collapsed ? '★' : '★ + New Solution'}
          </div>
        )}

        {/* Solutions Section */}
        {solutions.length > 0 && (
          <>
            {solutions.map(sol => {
              const isActive = selectedType === 'solution' && sol.id === currentSolutionId;
              const isHovered = hoveredSkill === `sol_${sol.id}`;
              // Use solution_id directly - skills are linked via solution.linked_skills
              const matchedSkills = skills.filter(s => s.solution_id === sol.id);

              return (
                <div key={sol.id}>
                  <div
                    style={{
                      ...solutionStyles.solutionItem,
                      ...(isActive || isHovered ? solutionStyles.solutionItemActive : {}),
                    }}
                    onClick={() => onSelectSolution && onSelectSolution(sol.id)}
                    onMouseEnter={() => setHoveredSkill(`sol_${sol.id}`)}
                    onMouseLeave={() => setHoveredSkill(null)}
                  >
                    {collapsed ? (
                      <div style={{ textAlign: 'center', fontSize: '16px', color: 'var(--accent)' }}>★</div>
                    ) : (
                      <>
                        <div style={solutionStyles.solutionName}>
                          ★ {sol.name}
                        </div>
                        <div style={solutionStyles.solutionMeta}>
                          {sol.skills_count || matchedSkills.length} skills · {sol.grants_count || 0} grants
                        </div>
                      </>
                    )}
                  </div>
                  {/* Child skills */}
                  {!collapsed && matchedSkills.map(skill => renderSkillItem(skill, true))}
                </div>
              );
            })}
          </>
        )}

        {/* Separator between solutions and standalone skills */}
        {(solutions.length > 0 || onCreateSolution) && standaloneSkills.length > 0 && (
          <div style={solutionStyles.separator} />
        )}

        {/* Standalone Skills */}
        {!loading && standaloneSkills.length === 0 && solutions.length === 0 && (
          <div style={styles.empty}>
            No skills yet.<br />Create one to get started!
          </div>
        )}

        {standaloneSkills.map(skill => renderSkillItem(skill, false))}

        {/* New Skill ghost card at the bottom */}
        <div
          title="New Skill"
          style={{
            padding: collapsed ? '8px 4px' : '12px',
            borderRadius: '8px',
            border: '2px dashed var(--border)',
            cursor: 'pointer',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            marginTop: '8px',
            transition: 'border-color 0.2s',
          }}
          onClick={() => setShowNew(true)}
        >
          {collapsed ? '+' : '+ New Skill'}
        </div>
      </div>

      {showNew && (
        <div style={styles.modal} onClick={handleClose}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>New Skill</div>

            {/* Skill Name */}
            <div>
              <label style={styles.label}>Skill Name</label>
              <input
                style={styles.input}
                placeholder="e.g., Customer Support Agent"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newName.trim() && handleCreate()}
                autoFocus
              />
            </div>

            {/* Template Selection */}
            <div style={styles.templateSection}>
              <label style={styles.label}>Start From</label>

              {templatesLoading ? (
                <div style={styles.loadingTemplates}>Loading templates...</div>
              ) : (
                <div style={styles.templateGrid}>
                  {/* Blank option */}
                  <div
                    style={{
                      ...styles.blankOption,
                      ...(selectedTemplate === null ? styles.blankOptionSelected : {})
                    }}
                    onClick={() => setSelectedTemplate(null)}
                  >
                    Start from scratch
                  </div>

                  {/* Template options */}
                  {templates.map(template => (
                    <div
                      key={template.id}
                      style={{
                        ...styles.templateCard,
                        ...(selectedTemplate === template.id ? styles.templateCardSelected : {}),
                        ...(hoveredTemplate === template.id && selectedTemplate !== template.id
                          ? styles.templateCardHover
                          : {})
                      }}
                      onClick={() => setSelectedTemplate(template.id)}
                      onMouseEnter={() => setHoveredTemplate(template.id)}
                      onMouseLeave={() => setHoveredTemplate(null)}
                    >
                      <div style={styles.templateName}>{template.name}</div>
                      <div style={styles.templateDesc}>
                        {template.description || 'No description'}
                      </div>
                      <div style={styles.templateMeta}>
                        {template.tools_count} tools · {template.scenarios_count} scenarios · {template.intents_count || 0} intents
                      </div>
                    </div>
                  ))}

                  {templates.length === 0 && (
                    <div style={{ ...styles.loadingTemplates, gridColumn: '1 / -1' }}>
                      No templates available yet
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={styles.modalActions}>
              <button style={styles.cancelBtn} onClick={handleClose}>
                Cancel
              </button>
              <button
                style={{
                  ...styles.createBtn,
                  ...(!newName.trim() ? styles.createBtnDisabled : {})
                }}
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
