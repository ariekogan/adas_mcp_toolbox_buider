import ConnectorPanel from './ConnectorPanel';
import SkillMCPsSection from './SkillMCPsSection';

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
  divider: {
    borderTop: '1px solid var(--border)',
    margin: '24px 0',
    position: 'relative'
  },
  dividerLabel: {
    position: 'absolute',
    top: '-10px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--bg-primary)',
    padding: '0 12px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }
};

export default function ConnectorsPage({ onClose }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Connectors & MCPs</div>
          <div style={styles.subtitle}>Manage generated skill MCPs and external MCP connections</div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div style={styles.content}>
        {/* ADAS Skills MCPs Section */}
        <SkillMCPsSection />

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLabel}>External Connectors</span>
        </div>

        {/* External Connectors Section */}
        <ConnectorPanel
          skillId={null}
          onToolsImported={() => {}}
          standalone={true}
        />
      </div>
    </div>
  );
}
