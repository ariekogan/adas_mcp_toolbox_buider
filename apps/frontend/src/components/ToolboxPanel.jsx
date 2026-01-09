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
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
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
          <div style={styles.sectionTitle}>Problem</div>
          {toolbox.problem?.statement ? (
            <div style={styles.problem}>
              <div style={styles.problemLabel}>Statement</div>
              {toolbox.problem.statement}
              {toolbox.problem.confirmed && (
                <span style={{ marginLeft: '8px', color: 'var(--success)' }}>✓</span>
              )}
            </div>
          ) : (
            <div style={styles.empty}>Not yet defined</div>
          )}
        </div>
        
        {/* Scenarios */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Scenarios ({toolbox.scenarios?.length || 0}/2 min)
          </div>
          {toolbox.scenarios?.length > 0 ? (
            toolbox.scenarios.map((scenario, i) => {
              const statusColor = getStatusColor(scenario.status);
              const isFocused = focus?.type === 'SCENARIO' && focus?.id === scenario.id;
              return (
                <div
                  key={scenario.id || i}
                  style={{
                    ...styles.card,
                    ...(isFocused ? styles.cardFocused : {})
                  }}
                  onClick={() => onFocusChange?.({ type: 'SCENARIO', id: scenario.id })}
                >
                  <div style={styles.cardTitle}>
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
                </div>
              );
            })
          ) : (
            <div style={styles.empty}>No scenarios yet</div>
          )}
        </div>
        
        {/* Tools */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Tools ({toolbox.tools?.length || 0})
          </div>
          {toolbox.tools?.length > 0 ? (
            toolbox.tools.map((tool, i) => {
              const statusColor = getStatusColor(tool.status);
              const isFocused = focus?.type === 'TOOL' && focus?.id === tool.id;
              return (
                <div
                  key={tool.id || i}
                  style={{
                    ...styles.card,
                    ...(isFocused ? styles.cardFocused : {})
                  }}
                  onClick={() => onFocusChange?.({ type: 'TOOL', id: tool.id })}
                >
                  <div style={styles.cardTitle}>
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
                </div>
              );
            })
          ) : toolbox.proposed_tools?.length > 0 ? (
            <div style={styles.empty}>
              {toolbox.proposed_tools.length} tools proposed, awaiting confirmation
            </div>
          ) : (
            <div style={styles.empty}>No tools yet</div>
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
