/**
 * ValidationItem - Single validation issue row
 *
 * Color-coded by severity with click-to-review action.
 */

import { useState } from 'react';

const severityConfig = {
  blocker: {
    bg: 'rgba(239, 68, 68, 0.12)',
    bgHover: 'rgba(239, 68, 68, 0.2)',
    border: '#ef4444',
    icon: '\u26D4'
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.12)',
    bgHover: 'rgba(245, 158, 11, 0.2)',
    border: '#f59e0b',
    icon: '\u26A0\uFE0F'
  },
  suggestion: {
    bg: 'rgba(234, 179, 8, 0.08)',
    bgHover: 'rgba(234, 179, 8, 0.15)',
    border: '#eab308',
    icon: '\uD83D\uDCA1'
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.08)',
    bgHover: 'rgba(59, 130, 246, 0.15)',
    border: '#3b82f6',
    icon: '\u2139\uFE0F'
  }
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    marginBottom: '6px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderLeft: '3px solid transparent'
  },
  containerResolved: {
    opacity: 0.5
  },
  containerReviewing: {
    opacity: 0.7
  },
  icon: {
    fontSize: '14px',
    marginTop: '2px',
    flexShrink: 0
  },
  content: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontSize: '13px',
    fontWeight: '500',
    lineHeight: 1.3,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  },
  titleResolved: {
    textDecoration: 'line-through',
    color: 'var(--text-muted)'
  },
  context: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '3px'
  },
  newBadge: {
    fontSize: '9px',
    background: 'var(--accent)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    fontWeight: '600',
    flexShrink: 0
  },
  reviewingBadge: {
    fontSize: '9px',
    background: 'rgba(59, 130, 246, 0.2)',
    color: '#3b82f6',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    fontWeight: '600',
    flexShrink: 0
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0
  },
  reviewBtn: {
    fontSize: '11px',
    color: 'var(--accent)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    transition: 'background 0.2s'
  },
  dismissBtn: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    opacity: 0.5,
    transition: 'opacity 0.2s'
  },
  dismissBtnHover: {
    opacity: 1
  }
};

export default function ValidationItem({
  issue,
  onReviewClick,
  onDismiss,
  resolved = false
}) {
  const [hovered, setHovered] = useState(false);
  const [dismissHovered, setDismissHovered] = useState(false);

  const config = severityConfig[issue.severity] || severityConfig.info;
  const isNew = issue.status === 'new';
  const isReviewing = issue.status === 'reviewing';
  const isResolved = resolved || issue.status === 'resolved' || issue.status === 'dismissed';

  const handleClick = () => {
    if (!isResolved && onReviewClick) {
      onReviewClick(issue);
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    if (onDismiss) {
      onDismiss(issue.id);
    }
  };

  return (
    <div
      style={{
        ...styles.container,
        background: hovered ? config.bgHover : config.bg,
        borderLeftColor: config.border,
        ...(isResolved ? styles.containerResolved : {}),
        ...(isReviewing ? styles.containerReviewing : {}),
        transform: hovered && !isResolved ? 'translateX(4px)' : 'translateX(0)'
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={styles.icon}>{config.icon}</span>

      <div style={styles.content}>
        <div style={{
          ...styles.title,
          ...(isResolved ? styles.titleResolved : {})
        }}>
          {issue.title}
          {isNew && <span style={styles.newBadge}>New</span>}
          {isReviewing && <span style={styles.reviewingBadge}>Reviewing</span>}
        </div>
        {issue.context && (
          <div style={styles.context}>{issue.context}</div>
        )}
      </div>

      {!isResolved && (
        <div style={styles.actions}>
          <button
            style={{
              ...styles.reviewBtn,
              background: hovered ? 'rgba(99, 102, 241, 0.1)' : 'transparent'
            }}
            onClick={handleClick}
          >
            Review \u2192
          </button>
          {onDismiss && (
            <button
              style={{
                ...styles.dismissBtn,
                ...(dismissHovered ? styles.dismissBtnHover : {})
              }}
              onClick={handleDismiss}
              onMouseEnter={() => setDismissHovered(true)}
              onMouseLeave={() => setDismissHovered(false)}
              title="Dismiss"
            >
              \u2715
            </button>
          )}
        </div>
      )}
    </div>
  );
}
