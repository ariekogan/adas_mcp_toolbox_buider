import { useState } from 'react';
import ConnectorPanel from './ConnectorPanel';
import SkillMCPsSection from './SkillMCPsSection';
import MCPDetailModal from './MCPDetailModal';

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
    display: 'flex',
    overflow: 'hidden'
  },
  // Side-by-side panels
  leftPanel: {
    width: '320px',
    minWidth: '280px',
    borderRight: '1px solid var(--border)',
    padding: '20px',
    overflow: 'auto',
    background: 'var(--bg-secondary)'
  },
  rightPanel: {
    flex: 1,
    padding: '20px 24px',
    overflow: 'auto'
  },
  panelHeader: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }
};

// Icons
const PlugIcon = () => (
  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

export default function ConnectorsPage({ onClose }) {
  const [selectedMCP, setSelectedMCP] = useState(null);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Connectors & MCPs</div>
          <div style={styles.subtitle}>Generated skill MCPs and external MCP connections</div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {/* Content - Side by Side */}
      <div style={styles.content}>
        {/* Left Panel - Generated Skill MCPs */}
        <div style={styles.leftPanel}>
          <SkillMCPsSection onSelectMCP={setSelectedMCP} />
        </div>

        {/* Right Panel - External Connectors */}
        <div style={styles.rightPanel}>
          <div style={styles.panelHeader}>
            <PlugIcon />
            External Connectors
          </div>
          <ConnectorPanel
            skillId={null}
            onToolsImported={() => {}}
            standalone={true}
          />
        </div>
      </div>

      {/* MCP Detail Modal */}
      {selectedMCP && (
        <MCPDetailModal
          mcp={selectedMCP}
          onClose={() => setSelectedMCP(null)}
        />
      )}
    </div>
  );
}
