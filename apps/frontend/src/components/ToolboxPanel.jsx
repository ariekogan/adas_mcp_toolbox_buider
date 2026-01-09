import { useState } from 'react';

const styles = {
  container: {
    flex: '1 1 40%',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-secondary)'
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
  version: {
    fontSize: '12px',
    background: 'var(--bg-tertiary)',
    padding: '4px 8px',
    borderRadius: '4px',
    color: 'var(--text-muted)'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px'
  },
  progress: {
    marginBottom: '20px'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    marginBottom: '6px',
    color: 'var(--text-muted)'
  },
  progressBar: {
    height: '6px',
    background: 'var(--bg-card)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    transition: 'width 0.3s ease'
  },
  section: {
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: '8px 0'
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
    padding: '12px',
    marginBottom: '8px',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'border-color 0.2s'
  },
  cardFocused: {
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
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  status: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: 'auto'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic'
  },
  problem: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    lineHeight: '1.5',
    marginBottom: '8px'
  },
  problemLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '4px'
  },
  problemField: {
    marginBottom: '12px'
  },
  problemFieldLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  problemFieldValue: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.5'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px'
  },
  tag: {
    fontSize: '11px',
    padding: '3px 8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)'
  },
  detailsList: {
    marginTop: '8px',
    paddingLeft: '16px'
  },
  detailItem: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    lineHeight: '1.4'
  },
  painPoint: {
    fontSize: '12px',
    color: '#f59e0b',
    marginBottom: '4px',
    paddingLeft: '16px'
  },
  toolDetails: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    fontSize: '12px'
  },
  toolInputs: {
    marginBottom: '8px'
  },
  inputItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    fontSize: '12px'
  },
  inputName: {
    fontFamily: 'monospace',
    color: 'var(--accent)',
    fontWeight: '500'
  },
  inputType: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '3px',
    color: 'var(--text-muted)'
  },
  inputRequired: {
    fontSize: '10px',
    color: '#ef4444'
  },
  mockExample: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-primary)',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '11px',
    overflow: 'auto'
  },
  mockLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  actions: {
    padding: '16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: '8px'
  },
  exportBtn: {
    flex: 1,
    padding: '10px 16px',
    background: 'var(--success)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  exportBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

function getStatusColor(status) {
  const colors = {
    DRAFT: { bg: '#6b728020', color: '#9ca3af' },
    NAME_SET: { bg: '#4f46e520', color: '#818cf8' },
    PURPOSE_SET: { bg: '#8b5cf620', color: '#a78bfa' },
    INPUTS_DEFINED: { bg: '#3b82f620', color: '#60a5fa' },
    OUTPUT_DEFINED: { bg: '#06b6d420', color: '#22d3ee' },
    MOCK_DEFINED: { bg: '#f59e0b20', color: '#fbbf24' },
    MOCK_TESTED: { bg: '#10b98140', color: '#34d399' },
    COMPLETE: { bg: '#10b98120', color: '#34d399' },
    CONFIRMED: { bg: '#10b98120', color: '#34d399' }
  };
  return colors[status] || colors.DRAFT;
}

function calculateProgress(toolbox) {
  if (!toolbox) return 0;
  const phases = {
    PROBLEM_DISCOVERY: 10,
    SCENARIO_EXPLORATION: 30,
    TOOLS_PROPOSAL: 45,
    TOOL_DEFINITION: 70,
    MOCK_TESTING: 90,
    READY_TO_EXPORT: 100,
    EXPORTED: 100
  };
  return phases[toolbox.status] || 0;
}

export default function ToolboxPanel({
  toolbox,
  focus,
  onFocusChange,
  onExport
}) {
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState({
    problem: true,
    scenarios: true,
    tools: true
  });
  const [expandedItems, setExpandedItems] = useState({});

  const toggleSection = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleItem = (type, id) => {
    const key = `${type}_${id}`;
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isItemExpanded = (type, id) => expandedItems[`${type}_${id}`];

  if (!toolbox) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>📦 Toolbox</span>
        </div>
        <div style={styles.content}>
          <div style={styles.empty}>
            Select or create a project to get started.
          </div>
        </div>
      </div>
    );
  }

  const progress = calculateProgress(toolbox);
  const canExport = toolbox.tools?.length > 0 && 
    toolbox.tools.every(t => t.status === 'COMPLETE');

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport?.();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>📦 Toolbox</span>
        <span style={styles.version}>v{toolbox.version || 1}</span>
      </div>
      
      <div style={styles.content}>
        {/* Progress */}
        <div style={styles.progress}>
          <div style={styles.progressLabel}>
            <span>{toolbox.status?.replace(/_/g, ' ')}</span>
            <span>{progress}%</span>
          </div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
        </div>
        
        {/* Problem */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('problem')}>
            <div style={styles.sectionTitle}>
              <span style={{ ...styles.expandIcon, transform: expanded.problem ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              Problem
              {toolbox.problem?.confirmed && <span style={{ color: 'var(--success)' }}>✓</span>}
            </div>
          </div>
          {expanded.problem && (
            toolbox.problem?.statement ? (
              <div style={styles.problem}>
                <div style={styles.problemField}>
                  <div style={styles.problemFieldLabel}>Statement</div>
                  <div style={styles.problemFieldValue}>{toolbox.problem.statement}</div>
                </div>
                {toolbox.problem.target_user && (
                  <div style={styles.problemField}>
                    <div style={styles.problemFieldLabel}>Target User</div>
                    <div style={styles.problemFieldValue}>{toolbox.problem.target_user}</div>
                  </div>
                )}
                {toolbox.problem.systems_involved?.length > 0 && (
                  <div style={styles.problemField}>
                    <div style={styles.problemFieldLabel}>Systems Involved</div>
                    <div style={styles.tagList}>
                      {toolbox.problem.systems_involved.map((sys, i) => (
                        <span key={i} style={styles.tag}>{sys}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.empty}>Not yet defined</div>
            )
          )}
        </div>
        
        {/* Scenarios */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('scenarios')}>
            <div style={styles.sectionTitle}>
              <span style={{ ...styles.expandIcon, transform: expanded.scenarios ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              Scenarios ({toolbox.scenarios?.length || 0}/2 min)
            </div>
          </div>
          {expanded.scenarios && (
            toolbox.scenarios?.length > 0 ? (
              toolbox.scenarios.map((scenario, i) => {
                const statusColor = getStatusColor(scenario.status);
                const isFocused = focus?.type === 'SCENARIO' && focus?.id === scenario.id;
                const isExpanded = isItemExpanded('scenario', scenario.id || i);
                return (
                  <div
                    key={scenario.id || i}
                    style={{
                      ...styles.card,
                      ...(isFocused ? styles.cardFocused : {})
                    }}
                  >
                    <div
                      style={styles.cardTitle}
                      onClick={() => toggleItem('scenario', scenario.id || i)}
                    >
                      <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      {scenario.status === 'CONFIRMED' ? '✓' : '○'} {scenario.title || `Scenario ${i + 1}`}
                      <span style={{
                        ...styles.status,
                        background: statusColor.bg,
                        color: statusColor.color
                      }}>
                        {scenario.status || 'DRAFT'}
                      </span>
                    </div>
                    <div style={styles.cardMeta}>
                      {scenario.steps?.length || 0} steps · {scenario.pain_points?.length || 0} pain points
                    </div>
                    {isExpanded && (
                      <div style={styles.toolDetails}>
                        {scenario.steps?.length > 0 && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={styles.mockLabel}>Steps</div>
                            <div style={styles.detailsList}>
                              {scenario.steps.map((step, j) => (
                                <div key={j} style={styles.detailItem}>
                                  {j + 1}. {typeof step === 'string' ? step : step.description || step.action}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {scenario.pain_points?.length > 0 && (
                          <div>
                            <div style={styles.mockLabel}>Pain Points</div>
                            {scenario.pain_points.map((pp, j) => (
                              <div key={j} style={styles.painPoint}>⚠ {typeof pp === 'string' ? pp : pp.description}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={styles.empty}>No scenarios yet</div>
            )
          )}
        </div>
        
        {/* Tools */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('tools')}>
            <div style={styles.sectionTitle}>
              <span style={{ ...styles.expandIcon, transform: expanded.tools ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              Tools ({toolbox.tools?.length || 0})
            </div>
          </div>
          {expanded.tools && (
            toolbox.tools?.length > 0 ? (
              toolbox.tools.map((tool, i) => {
                const statusColor = getStatusColor(tool.status);
                const isFocused = focus?.type === 'TOOL' && focus?.id === tool.id;
                const isExpanded = isItemExpanded('tool', tool.id || i);
                return (
                  <div
                    key={tool.id || i}
                    style={{
                      ...styles.card,
                      ...(isFocused ? styles.cardFocused : {})
                    }}
                  >
                    <div
                      style={styles.cardTitle}
                      onClick={() => toggleItem('tool', tool.id || i)}
                    >
                      <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      🔧 {tool.name || `Tool ${i + 1}`}
                      <span style={{
                        ...styles.status,
                        background: statusColor.bg,
                        color: statusColor.color
                      }}>
                        {tool.status || 'DRAFT'}
                      </span>
                    </div>
                    <div style={styles.cardMeta}>
                      {tool.purpose || 'Purpose not set'}
                    </div>
                    {isExpanded && (
                      <div style={styles.toolDetails}>
                        {/* Inputs */}
                        {tool.inputs?.length > 0 && (
                          <div style={styles.toolInputs}>
                            <div style={styles.mockLabel}>Inputs</div>
                            {tool.inputs.map((input, j) => (
                              <div key={j} style={styles.inputItem}>
                                <span style={styles.inputName}>{input.name}</span>
                                <span style={styles.inputType}>{input.type || 'string'}</span>
                                {input.required && <span style={styles.inputRequired}>required</span>}
                                {input.description && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                    - {input.description}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Output */}
                        {tool.output && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={styles.mockLabel}>Output</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {typeof tool.output === 'string' ? tool.output : (
                                tool.output.description || JSON.stringify(tool.output.schema || tool.output, null, 2)
                              )}
                            </div>
                          </div>
                        )}
                        {/* Mock Examples */}
                        {tool.mock?.examples?.length > 0 && (
                          <div>
                            <div style={styles.mockLabel}>Mock Examples ({tool.mock.examples.length})</div>
                            {tool.mock.examples.slice(0, 2).map((example, j) => (
                              <div key={j} style={styles.mockExample}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                                  Input: {JSON.stringify(example.input)}
                                </div>
                                <div style={{ color: 'var(--success)' }}>
                                  Output: {JSON.stringify(example.output).substring(0, 100)}
                                  {JSON.stringify(example.output).length > 100 && '...'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : toolbox.proposed_tools?.length > 0 ? (
              <div style={{ marginTop: '8px' }}>
                <div style={styles.mockLabel}>Proposed Tools (awaiting confirmation)</div>
                {toolbox.proposed_tools.map((pt, i) => (
                  <div key={i} style={{ ...styles.card, opacity: 0.7 }}>
                    <div style={styles.cardTitle}>
                      {pt.accepted ? '✓' : '○'} {pt.name}
                    </div>
                    <div style={styles.cardMeta}>{pt.purpose}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.empty}>No tools yet</div>
            )
          )}
        </div>
      </div>
      
      <div style={styles.actions}>
        <button
          style={{
            ...styles.exportBtn,
            ...(!canExport || exporting ? styles.exportBtnDisabled : {})
          }}
          onClick={handleExport}
          disabled={!canExport || exporting}
        >
          {exporting ? 'Exporting...' : '📦 Export MCP Server'}
        </button>
      </div>
    </div>
  );
}
