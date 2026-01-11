/**
 * ValidationBanner - Display validation status and issues
 *
 * Shows errors, warnings, unresolved references, and export readiness.
 */

const styles = {
  banner: {
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  bannerError: {
    background: '#ef444415',
    border: '1px solid #ef444440'
  },
  bannerWarning: {
    background: '#f59e0b15',
    border: '1px solid #f59e0b40'
  },
  bannerSuccess: {
    background: '#10b98115',
    border: '1px solid #10b98140'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  title: {
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  titleError: {
    color: '#ef4444'
  },
  titleWarning: {
    color: '#f59e0b'
  },
  titleSuccess: {
    color: '#10b981'
  },
  readyBadge: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: '500'
  },
  issuesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  issueItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '12px',
    padding: '6px 0',
    borderBottom: '1px solid var(--border)'
  },
  issuePath: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: 'var(--text-muted)',
    background: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '3px'
  },
  issueMessage: {
    color: 'var(--text-secondary)',
    flex: 1
  },
  issueSuggestion: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    marginTop: '2px'
  },
  section: {
    marginTop: '12px'
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    marginBottom: '6px'
  },
  unresolvedList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px'
  },
  unresolvedItem: {
    fontSize: '11px',
    padding: '3px 8px',
    background: '#f59e0b20',
    color: '#fbbf24',
    borderRadius: '4px',
    fontFamily: 'monospace'
  },
  completeness: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px'
  },
  completenessItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    padding: '4px 8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px'
  },
  completenessComplete: {
    color: '#34d399'
  },
  completenessIncomplete: {
    color: '#9ca3af'
  },
  showMore: {
    fontSize: '11px',
    color: 'var(--accent)',
    cursor: 'pointer',
    marginTop: '8px',
    display: 'inline-block'
  }
};

const MAX_ISSUES = 3;

export default function ValidationBanner({ validation, showDetails = false }) {
  if (!validation) return null;

  const { valid, ready_to_export, errors = [], warnings = [], unresolved = {}, completeness = {} } = validation;

  // Calculate total unresolved
  const totalUnresolved =
    (unresolved.tools?.length || 0) +
    (unresolved.workflows?.length || 0) +
    (unresolved.intents?.length || 0);

  // If everything is fine, show success banner
  if (valid && warnings.length === 0 && totalUnresolved === 0 && ready_to_export) {
    return (
      <div style={{ ...styles.banner, ...styles.bannerSuccess }}>
        <div style={styles.header}>
          <div style={{ ...styles.title, ...styles.titleSuccess }}>
            <span>Y</span>
            Ready to Export
          </div>
          <span style={{
            ...styles.readyBadge,
            background: '#10b98120',
            color: '#34d399'
          }}>
            All checks passed
          </span>
        </div>
      </div>
    );
  }

  // Determine banner type
  const hasErrors = errors.length > 0;
  const bannerStyle = hasErrors ? styles.bannerError : styles.bannerWarning;
  const titleStyle = hasErrors ? styles.titleError : styles.titleWarning;

  return (
    <div style={{ ...styles.banner, ...bannerStyle }}>
      <div style={styles.header}>
        <div style={{ ...styles.title, ...titleStyle }}>
          <span>{hasErrors ? 'X' : '!'}</span>
          {hasErrors ? `${errors.length} Error${errors.length > 1 ? 's' : ''}` : `${warnings.length} Warning${warnings.length > 1 ? 's' : ''}`}
          {totalUnresolved > 0 && ` | ${totalUnresolved} Unresolved`}
        </div>
        <span style={{
          ...styles.readyBadge,
          background: ready_to_export ? '#10b98120' : '#ef444420',
          color: ready_to_export ? '#34d399' : '#ef4444'
        }}>
          {ready_to_export ? 'Ready' : 'Not Ready'}
        </span>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Errors</div>
          <ul style={styles.issuesList}>
            {errors.slice(0, showDetails ? errors.length : MAX_ISSUES).map((err, i) => (
              <li key={i} style={styles.issueItem}>
                <span style={styles.issuePath}>{err.path}</span>
                <div style={styles.issueMessage}>
                  {err.message}
                  {err.suggestion && (
                    <div style={styles.issueSuggestion}>{err.suggestion}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!showDetails && errors.length > MAX_ISSUES && (
            <span style={styles.showMore}>+{errors.length - MAX_ISSUES} more errors</span>
          )}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Warnings</div>
          <ul style={styles.issuesList}>
            {warnings.slice(0, showDetails ? warnings.length : MAX_ISSUES).map((warn, i) => (
              <li key={i} style={styles.issueItem}>
                <span style={styles.issuePath}>{warn.path}</span>
                <div style={styles.issueMessage}>
                  {warn.message}
                  {warn.suggestion && (
                    <div style={styles.issueSuggestion}>{warn.suggestion}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!showDetails && warnings.length > MAX_ISSUES && (
            <span style={styles.showMore}>+{warnings.length - MAX_ISSUES} more warnings</span>
          )}
        </div>
      )}

      {/* Unresolved References */}
      {totalUnresolved > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Unresolved References</div>
          <div style={styles.unresolvedList}>
            {unresolved.tools?.map((t, i) => (
              <span key={`t-${i}`} style={styles.unresolvedItem}>tool: {t}</span>
            ))}
            {unresolved.workflows?.map((w, i) => (
              <span key={`w-${i}`} style={styles.unresolvedItem}>workflow: {w}</span>
            ))}
            {unresolved.intents?.map((int, i) => (
              <span key={`i-${i}`} style={styles.unresolvedItem}>intent: {int}</span>
            ))}
          </div>
        </div>
      )}

      {/* Completeness */}
      {showDetails && completeness && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Completeness</div>
          <div style={styles.completeness}>
            {Object.entries(completeness).map(([key, done]) => (
              <div
                key={key}
                style={{
                  ...styles.completenessItem,
                  ...(done ? styles.completenessComplete : styles.completenessIncomplete)
                }}
              >
                <span>{done ? 'Y' : 'X'}</span>
                {key.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
