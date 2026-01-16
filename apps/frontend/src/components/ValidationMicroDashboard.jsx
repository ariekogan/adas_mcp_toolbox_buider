/**
 * ValidationMicroDashboard - Compact validation status in toolbar
 *
 * Shows error/warning/unresolved counts with indicators.
 * Clicking opens the full validation details.
 */

import { useState } from 'react';

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    borderRadius: '6px',
    background: 'var(--bg-tertiary)',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  containerHover: {
    background: 'var(--bg-card)'
  },
  indicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: '600'
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  count: {
    minWidth: '16px',
    textAlign: 'center'
  },
  ready: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#22c55e',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  notReady: {
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--text-muted)'
  },
  viewBtn: {
    fontSize: '10px',
    color: 'var(--accent)',
    marginLeft: '4px'
  }
};

export default function ValidationMicroDashboard({ validation, onClick }) {
  const [hovered, setHovered] = useState(false);

  if (!validation) {
    return null;
  }

  const errorCount = validation.errors?.length || 0;
  const warningCount = validation.warnings?.length || 0;
  const unresolvedCount =
    (validation.unresolved?.tools?.length || 0) +
    (validation.unresolved?.workflows?.length || 0);

  const isReady = validation.ready_to_export === true;
  const hasIssues = errorCount > 0 || warningCount > 0 || unresolvedCount > 0;

  return (
    <div
      style={{
        ...styles.container,
        ...(hovered ? styles.containerHover : {})
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      title="Click to view validation details"
    >
      {isReady && !hasIssues ? (
        <span style={styles.ready}>
          <span style={{ ...styles.dot, background: '#22c55e' }} />
          Ready
        </span>
      ) : (
        <>
          {/* Errors */}
          {errorCount > 0 && (
            <div style={styles.indicator}>
              <span style={{ ...styles.dot, background: '#ef4444' }} />
              <span style={{ ...styles.count, color: '#ef4444' }}>{errorCount}</span>
            </div>
          )}

          {/* Warnings */}
          {warningCount > 0 && (
            <div style={styles.indicator}>
              <span style={{ ...styles.dot, background: '#f59e0b' }} />
              <span style={{ ...styles.count, color: '#f59e0b' }}>{warningCount}</span>
            </div>
          )}

          {/* Unresolved */}
          {unresolvedCount > 0 && (
            <div style={styles.indicator}>
              <span style={{ ...styles.dot, background: '#6b7280' }} />
              <span style={{ ...styles.count, color: '#6b7280' }}>{unresolvedCount}</span>
            </div>
          )}

          {/* No issues but not ready */}
          {!hasIssues && (
            <span style={styles.notReady}>Not Ready</span>
          )}
        </>
      )}

      {/* View hint on hover */}
      {hovered && (
        <span style={styles.viewBtn}>view →</span>
      )}
    </div>
  );
}
