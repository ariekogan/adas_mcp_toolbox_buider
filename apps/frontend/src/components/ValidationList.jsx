/**
 * ValidationList - Collapsible list of validation issues
 *
 * Displays blockers, warnings, and suggestions detected by
 * the cascading validation system.
 */

import { useState } from 'react';
import ValidationItem from './ValidationItem';

const styles = {
  container: {
    background: 'var(--bg-primary)',
    borderRadius: '8px',
    marginBottom: '16px',
    overflow: 'hidden',
    border: '1px solid var(--border)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  headerHover: {
    background: 'var(--bg-tertiary)'
  },
  icon: {
    fontSize: '16px'
  },
  summary: {
    flex: 1,
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-secondary)'
  },
  countBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    fontWeight: '600'
  },
  blockerBadge: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444'
  },
  warningBadge: {
    background: 'rgba(245, 158, 11, 0.2)',
    color: '#f59e0b'
  },
  expandIcon: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    transition: 'transform 0.2s'
  },
  items: {
    padding: '0 10px 10px 10px'
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px'
  },
  clearBtn: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px'
  }
};

export default function ValidationList({
  issues,
  onReviewClick,
  onDismiss,
  onClearResolved
}) {
  const [expanded, setExpanded] = useState(true);
  const [headerHovered, setHeaderHovered] = useState(false);

  // Filter active issues (not resolved/dismissed)
  const activeIssues = issues.filter(i => i.status === 'new' || i.status === 'reviewing');
  const resolvedCount = issues.filter(i => i.status === 'resolved' || i.status === 'dismissed').length;

  // Don't render if no issues
  if (issues.length === 0) {
    return null;
  }

  // Count by severity
  const blockers = activeIssues.filter(i => i.severity === 'blocker');
  const warnings = activeIssues.filter(i => i.severity === 'warning');
  const suggestions = activeIssues.filter(i => i.severity === 'suggestion');
  const infos = activeIssues.filter(i => i.severity === 'info');

  // Determine header icon and badge style
  const hasBlockers = blockers.length > 0;
  const headerIcon = hasBlockers ? '\u26D4' : '\u26A0\uFE0F';
  const badgeStyle = hasBlockers ? styles.blockerBadge : styles.warningBadge;

  // Generate summary text
  const getSummaryText = () => {
    if (activeIssues.length === 0) {
      return 'All issues resolved';
    }
    if (activeIssues.length === 1) {
      return '1 item needs attention';
    }
    return `${activeIssues.length} items need attention`;
  };

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.header,
          ...(headerHovered ? styles.headerHover : {})
        }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <span style={styles.icon}>{headerIcon}</span>
        <span style={styles.summary}>{getSummaryText()}</span>

        {activeIssues.length > 0 && (
          <span style={{ ...styles.countBadge, ...badgeStyle }}>
            {activeIssues.length}
          </span>
        )}

        {resolvedCount > 0 && onClearResolved && (
          <button
            style={styles.clearBtn}
            onClick={(e) => {
              e.stopPropagation();
              onClearResolved();
            }}
            title="Clear resolved items"
          >
            Clear ({resolvedCount})
          </button>
        )}

        <span style={{
          ...styles.expandIcon,
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)'
        }}>
          \u25BE
        </span>
      </div>

      {expanded && (
        <div style={styles.items}>
          {/* Blockers first */}
          {blockers.map(issue => (
            <ValidationItem
              key={issue.id}
              issue={issue}
              onReviewClick={onReviewClick}
              onDismiss={onDismiss}
            />
          ))}

          {/* Then warnings */}
          {warnings.map(issue => (
            <ValidationItem
              key={issue.id}
              issue={issue}
              onReviewClick={onReviewClick}
              onDismiss={onDismiss}
            />
          ))}

          {/* Then suggestions */}
          {suggestions.map(issue => (
            <ValidationItem
              key={issue.id}
              issue={issue}
              onReviewClick={onReviewClick}
              onDismiss={onDismiss}
            />
          ))}

          {/* Then info */}
          {infos.map(issue => (
            <ValidationItem
              key={issue.id}
              issue={issue}
              onReviewClick={onReviewClick}
              onDismiss={onDismiss}
            />
          ))}

          {/* Show resolved with strikethrough */}
          {issues.filter(i => i.status === 'resolved').map(issue => (
            <ValidationItem
              key={issue.id}
              issue={issue}
              onReviewClick={onReviewClick}
              onDismiss={onDismiss}
              resolved
            />
          ))}

          {activeIssues.length === 0 && resolvedCount > 0 && (
            <div style={styles.empty}>
              \u2713 All items addressed
            </div>
          )}
        </div>
      )}
    </div>
  );
}
