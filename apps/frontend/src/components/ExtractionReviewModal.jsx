/**
 * ExtractionReviewModal - Review and confirm extracted intents/scenarios before applying
 */

import { useState } from 'react';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: 'var(--bg-primary)',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '650px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    padding: '4px 8px'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px'
  },
  summary: {
    padding: '16px',
    background: 'var(--accent)10',
    borderRadius: '8px',
    border: '1px solid var(--accent)30',
    marginBottom: '20px'
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
    fontSize: '14px',
    color: 'var(--text-secondary)'
  },
  summaryValue: {
    fontWeight: '500',
    color: 'var(--text-primary)'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  item: {
    padding: '14px 16px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    marginBottom: '8px',
    border: '1px solid var(--border)',
    transition: 'opacity 0.2s'
  },
  itemExcluded: {
    opacity: 0.4
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px'
  },
  itemTitle: {
    fontWeight: '500',
    fontSize: '14px',
    color: 'var(--text-primary)',
    flex: 1
  },
  toggleBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap'
  },
  toggleBtnIncluded: {
    background: 'var(--accent)15',
    borderColor: 'var(--accent)',
    color: 'var(--accent)'
  },
  examples: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '10px'
  },
  example: {
    padding: '4px 10px',
    background: 'var(--bg-primary)',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)'
  },
  description: {
    marginTop: '8px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.5'
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '14px'
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  footerInfo: {
    fontSize: '13px',
    color: 'var(--text-secondary)'
  },
  footerActions: {
    display: 'flex',
    gap: '12px'
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: 'var(--text-primary)'
  },
  applyBtn: {
    padding: '10px 24px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  applyBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

export default function ExtractionReviewModal({
  extraction,
  fileInfo,
  onApply,
  onCancel,
  applying
}) {
  const [selectedIntents, setSelectedIntents] = useState(
    () => new Set(extraction.intents?.map((_, i) => i) || [])
  );
  const [selectedScenarios, setSelectedScenarios] = useState(
    () => new Set(extraction.scenarios?.map((_, i) => i) || [])
  );

  const toggleIntent = (index) => {
    setSelectedIntents(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleScenario = (index) => {
    setSelectedScenarios(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApply = () => {
    // Filter to only include selected items
    const filteredExtraction = {
      ...extraction,
      intents: extraction.intents?.filter((_, i) => selectedIntents.has(i)) || [],
      scenarios: extraction.scenarios?.filter((_, i) => selectedScenarios.has(i)) || []
    };
    onApply(filteredExtraction);
  };

  const totalSelected = selectedIntents.size + selectedScenarios.size;
  const hasItems = (extraction.intents?.length || 0) + (extraction.scenarios?.length || 0) > 0;

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Review Extracted Data</div>
          <button style={styles.closeBtn} onClick={onCancel}>x</button>
        </div>

        <div style={styles.content}>
          {/* Summary */}
          <div style={styles.summary}>
            <div style={styles.summaryRow}>
              <span>File</span>
              <span style={styles.summaryValue}>{fileInfo?.name || 'Unknown'}</span>
            </div>
            <div style={styles.summaryRow}>
              <span>Intents found</span>
              <span style={styles.summaryValue}>{extraction.intents?.length || 0}</span>
            </div>
            <div style={styles.summaryRow}>
              <span>Scenarios found</span>
              <span style={styles.summaryValue}>{extraction.scenarios?.length || 0}</span>
            </div>
          </div>

          {!hasItems && (
            <div style={styles.empty}>
              No intents or scenarios could be extracted from this file.
              Try uploading a file with more example conversations or requests.
            </div>
          )}

          {/* Intents */}
          {extraction.intents?.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                Intents ({selectedIntents.size} of {extraction.intents.length} selected)
              </div>
              {extraction.intents.map((intent, i) => {
                const isSelected = selectedIntents.has(i);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.item,
                      ...(isSelected ? {} : styles.itemExcluded)
                    }}
                  >
                    <div style={styles.itemHeader}>
                      <span style={styles.itemTitle}>{intent.description}</span>
                      <button
                        style={{
                          ...styles.toggleBtn,
                          ...(isSelected ? styles.toggleBtnIncluded : {})
                        }}
                        onClick={() => toggleIntent(i)}
                      >
                        {isSelected ? 'Included' : 'Excluded'}
                      </button>
                    </div>
                    {intent.examples?.length > 0 && (
                      <div style={styles.examples}>
                        {intent.examples.map((ex, j) => (
                          <span key={j} style={styles.example}>"{ex}"</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Scenarios */}
          {extraction.scenarios?.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                Scenarios ({selectedScenarios.size} of {extraction.scenarios.length} selected)
              </div>
              {extraction.scenarios.map((scenario, i) => {
                const isSelected = selectedScenarios.has(i);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.item,
                      ...(isSelected ? {} : styles.itemExcluded)
                    }}
                  >
                    <div style={styles.itemHeader}>
                      <span style={styles.itemTitle}>{scenario.title}</span>
                      <button
                        style={{
                          ...styles.toggleBtn,
                          ...(isSelected ? styles.toggleBtnIncluded : {})
                        }}
                        onClick={() => toggleScenario(i)}
                      >
                        {isSelected ? 'Included' : 'Excluded'}
                      </button>
                    </div>
                    {scenario.description && (
                      <div style={styles.description}>{scenario.description}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <span style={styles.footerInfo}>
            {totalSelected} item{totalSelected !== 1 ? 's' : ''} will be imported
          </span>
          <div style={styles.footerActions}>
            <button style={styles.cancelBtn} onClick={onCancel}>
              Cancel
            </button>
            <button
              style={{
                ...styles.applyBtn,
                ...(applying || totalSelected === 0 ? styles.applyBtnDisabled : {})
              }}
              onClick={handleApply}
              disabled={applying || totalSelected === 0}
            >
              {applying ? 'Importing...' : 'Import Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
