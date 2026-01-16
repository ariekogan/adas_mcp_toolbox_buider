/**
 * ValidationMicroDashboard - Compact validation status in toolbar
 *
 * Shows error/warning/unresolved counts with indicators.
 * Clicking opens the full validation details.
 * Includes "Validate All" button to run all consistency checks.
 */

import { useState } from 'react';

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
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
  },
  validateAllBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    borderRadius: '6px',
    color: '#a78bfa',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: '500',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  validateAllBtnHover: {
    background: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#a78bfa'
  },
  validateAllBtnLoading: {
    opacity: 0.6,
    cursor: 'not-allowed'
  }
};

export default function ValidationMicroDashboard({ validation, onClick, onValidateAll, validatingAll }) {
  const [hovered, setHovered] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

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
    <div style={styles.wrapper}>
      {/* Validate All button */}
      {onValidateAll && (
        <button
          style={{
            ...styles.validateAllBtn,
            ...(btnHovered && !validatingAll ? styles.validateAllBtnHover : {}),
            ...(validatingAll ? styles.validateAllBtnLoading : {})
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!validatingAll) onValidateAll();
          }}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
          disabled={validatingAll}
          title="Run all consistency checks"
        >
          {validatingAll ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
              Validating...
            </>
          ) : (
            <>✓ Validate All</>
          )}
        </button>
      )}

      {/* Status indicators */}
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
    </div>
  );
}
