import { useRef, useEffect, useMemo } from 'react';
import SmartInput from './SmartInput';

/**
 * Get badge color based on ratio and thresholds
 */
function getBadgeColor(current, total, minRequired = 1) {
  if (total === 0 || current === 0) return { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
  const ratio = current / total;
  if (ratio >= 1) return { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
  if (current >= minRequired) return { bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
  return { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
}

/**
 * Get category badge info with counts
 */
function getCategoryBadge(key, skill) {
  switch (key) {
    case 'problem': {
      const has = skill.problem?.statement?.length >= 10 ? 1 : 0;
      return { label: 'Problem', text: has ? '✓' : '0', ...getBadgeColor(has, 1) };
    }
    case 'scenarios': {
      const count = skill.scenarios?.length || 0;
      return { label: 'Scenarios', text: `${count}`, ...getBadgeColor(count, 2, 1) };
    }
    case 'role': {
      const has = (skill.role?.name && skill.role?.persona) ? 1 : 0;
      return { label: 'Role', text: has ? '✓' : '0', ...getBadgeColor(has, 1) };
    }
    case 'intents': {
      const intents = skill.intents?.supported || [];
      const withExamples = intents.filter(i => i.examples?.length > 0).length;
      if (intents.length === 0) return { label: 'Intents', text: '0', bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
      return { label: 'Intents', text: `${withExamples}/${intents.length}`, ...getBadgeColor(withExamples, intents.length, 1) };
    }
    case 'tools': {
      const tools = skill.tools || [];
      if (tools.length === 0) return { label: 'Tools', text: '0', bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
      const defined = tools.filter(t => t.name && t.description && t.output?.description).length;
      return { label: 'Tools', text: `${defined}/${tools.length}`, ...getBadgeColor(defined, tools.length, 1) };
    }
    case 'policy': {
      const never = skill.policy?.guardrails?.never?.length || 0;
      const always = skill.policy?.guardrails?.always?.length || 0;
      const total = never + always;
      return { label: 'Policy', text: `${total}`, ...getBadgeColor(total, 2, 1) };
    }
    case 'mocks': {
      const tools = skill.tools || [];
      if (tools.length === 0) return { label: 'Mocks', text: '0', bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
      const tested = tools.filter(t => t.mock_status === 'tested' || t.mock_status === 'skipped').length;
      return { label: 'Mocks', text: `${tested}/${tools.length}`, ...getBadgeColor(tested, tools.length, 1) };
    }
    case 'engine': {
      return { label: 'Engine', text: '✓', bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
    }
    default:
      return { label: key, text: '?', bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
  }
}

// Map category keys to focus targets (tab + optional section)
const CATEGORY_FOCUS_MAP = {
  problem: { tab: 'overview', section: 'problem' },
  scenarios: { tab: 'overview', section: 'scenarios' },
  role: { tab: 'overview', section: 'role' },
  intents: { tab: 'intents' },
  tools: { tab: 'tools' },
  policy: { tab: 'policy' },
  mocks: { tab: 'tools', section: 'mocks' },
  engine: { tab: 'engine' }
};

// Mini dashboard component for status summaries
function MiniDashboard({ skill, onFocusChange }) {
  if (!skill) return null;

  const validation = skill.validation || {};
  const categoryKeys = ['problem', 'scenarios', 'role', 'intents', 'tools', 'policy', 'mocks', 'engine'];
  const badges = categoryKeys.map(key => ({ ...getCategoryBadge(key, skill), key }));

  // Calculate overall progress from badges
  const greenCount = badges.filter(b => b.color === '#22c55e').length;
  const yellowCount = badges.filter(b => b.color === '#eab308').length;
  const progress = Math.round(((greenCount + yellowCount * 0.5) / badges.length) * 100);

  const errorCount = validation.errors?.length || 0;
  const warningCount = validation.warnings?.length || 0;

  const progressColor = progress >= 75 ? 'var(--success)' : progress >= 40 ? 'var(--warning)' : 'var(--accent)';

  return (
    <div style={dashboardStyles.container}>
      {/* Progress */}
      <div style={dashboardStyles.progressSection}>
        <span style={{ ...dashboardStyles.progressText, color: progressColor }}>{progress}%</span>
        <div style={dashboardStyles.progressBar}>
          <div style={{
            ...dashboardStyles.progressFill,
            width: `${progress}%`,
            background: progressColor
          }} />
        </div>
      </div>

      <div style={dashboardStyles.divider} />

      {/* Errors & Warnings */}
      {errorCount > 0 && (
        <div style={dashboardStyles.stat}>
          <div style={{ ...dashboardStyles.statDot, background: 'var(--error)' }} />
          <span style={{ color: 'var(--error)' }}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
        </div>
      )}
      {warningCount > 0 && (
        <div style={dashboardStyles.stat}>
          <div style={{ ...dashboardStyles.statDot, background: 'var(--warning)' }} />
          <span style={{ color: 'var(--warning)' }}>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
        </div>
      )}
      {errorCount === 0 && warningCount === 0 && (
        <div style={dashboardStyles.stat}>
          <div style={{ ...dashboardStyles.statDot, background: 'var(--success)' }} />
          <span style={{ color: 'var(--success)' }}>No issues</span>
        </div>
      )}

      <div style={dashboardStyles.divider} />

      {/* Categories with counts */}
      <div style={dashboardStyles.categories}>
        {badges.map(badge => (
          <span
            key={badge.label}
            style={{
              ...dashboardStyles.category,
              ...dashboardStyles.categoryClickable,
              background: badge.bg,
              color: badge.color
            }}
            onClick={() => onFocusChange?.(CATEGORY_FOCUS_MAP[badge.key])}
            title={`Go to ${badge.label}`}
          >
            {badge.label} <span style={{ fontWeight: '600' }}>{badge.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Mini dashboard styles
const dashboardStyles = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '11px',
    alignItems: 'center'
  },
  progressSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  progressBar: {
    width: '60px',
    height: '6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease'
  },
  progressText: {
    fontWeight: '600',
    minWidth: '32px'
  },
  divider: {
    width: '1px',
    height: '16px',
    background: 'var(--border)'
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  statDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%'
  },
  categories: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px'
  },
  category: {
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: '500'
  },
  categoryClickable: {
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    userSelect: 'none'
  }
};

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid var(--border)',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-secondary)'
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  message: {
    maxWidth: '85%',
    padding: '12px 16px',
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: '1.6'
  },
  userMessage: {
    alignSelf: 'flex-end',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderBottomRightRadius: '4px',
    borderLeft: '2px solid var(--accent)'
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    borderBottomLeftRadius: '4px'
  },
  errorMessage: {
    background: '#ef444420',
    borderColor: 'var(--error)'
  },
  inputArea: {
    padding: '16px',
    borderTop: '1px solid var(--border)'
  },
  sendBtn: {
    padding: '12px 20px',
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '500',
    alignSelf: 'flex-end'
  },
  sendBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  typing: {
    alignSelf: 'flex-start',
    padding: '12px 16px',
    background: 'var(--bg-card)',
    borderRadius: '12px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  typingDots: {
    display: 'flex',
    gap: '4px'
  },
  typingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--accent)',
    animation: 'pulse 1.4s ease-in-out infinite'
  },
  welcome: {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'var(--text-muted)'
  },
  welcomeTitle: {
    fontSize: '24px',
    marginBottom: '8px',
    color: 'var(--text-primary)'
  },
  // Formatted message styles
  msgSection: {
    marginBottom: '12px'
  },
  msgQuestion: {
    marginBottom: '8px',
    lineHeight: '1.6'
  },
  msgHeading: {
    fontWeight: '600',
    fontSize: '14px',
    marginBottom: '6px',
    marginTop: '12px',
    color: 'var(--text-primary)'
  },
  msgSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '600',
    fontSize: '13px',
    marginBottom: '8px',
    marginTop: '16px',
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'var(--bg-secondary)'
  },
  msgSectionIcon: {
    fontSize: '14px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px'
  },
  msgSectionStatus: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa'
  },
  msgSectionMissing: {
    background: 'rgba(251, 191, 36, 0.15)',
    color: '#fbbf24'
  },
  msgSectionImprove: {
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e'
  },
  msgSectionPurpose: {
    background: 'rgba(139, 92, 246, 0.15)',
    color: '#a78bfa'
  },
  msgSectionSummary: {
    fontStyle: 'italic',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '-4px',
    marginBottom: '8px',
    paddingLeft: '4px'
  },
  msgList: {
    margin: '8px 0',
    paddingLeft: '20px'
  },
  msgListItem: {
    marginBottom: '4px',
    lineHeight: '1.5'
  },
  msgCode: {
    background: 'var(--bg-secondary)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '13px'
  },
  msgExample: {
    background: 'var(--bg-secondary)',
    padding: '10px 12px',
    borderRadius: '6px',
    margin: '8px 0',
    fontSize: '13px',
    borderLeft: '3px solid var(--accent)'
  },
  msgDone: {
    color: 'var(--success)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px'
  },
  msgParagraph: {
    marginBottom: '8px',
    lineHeight: '1.6'
  },
  msgLongParagraph: {
    marginBottom: '12px',
    lineHeight: '1.7'
  },
  msgToolList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    margin: '10px 0'
  },
  msgToolItem: {
    padding: '8px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    borderLeft: '3px solid var(--accent)'
  },
  msgToolName: {
    fontWeight: '600',
    color: 'var(--accent)'
  },
  msgSeparator: {
    borderTop: '1px solid var(--border)',
    margin: '16px 0',
    opacity: 0.5
  },
  msgCallToAction: {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    padding: '14px 16px',
    borderRadius: '8px',
    marginTop: '16px',
    fontWeight: '500',
    fontSize: '15px',
    border: '1px solid var(--accent)',
    borderLeft: '4px solid var(--accent)'
  }
};

function formatMessage(content) {
  // Filter out raw JSON fragments that might leak through
  const jsonPatterns = [
    /^\s*[\{\}\[\]]\s*$/,                    // Single { } [ ]
    /^\s*[\{\}\[\]],?\s*$/,                  // { } [ ] with optional comma
    /^\s*"[a-z_]+"\s*:\s*[\{\[]\s*$/i,       // "key": { or "key": [
    /^\s*"[a-z_]+"\s*:\s*(null|true|false|"[^"]*"|\d+)\s*,?\s*$/i,  // "key": value
    /^\s*"(message|state_update|suggested_focus|tools_push|inputs|outputs|name|purpose|id|status)"\s*:/i
  ];

  // Parse the message into structured sections
  const lines = content.split('\n');
  const elements = [];
  let currentList = [];
  let inExample = false;
  let exampleLines = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={styles.msgList}>
          {currentList.map((item, i) => (
            <li key={i} style={styles.msgListItem}>{formatInlineText(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const flushExample = () => {
    if (exampleLines.length > 0) {
      elements.push(
        <div key={`ex-${elements.length}`} style={styles.msgExample}>
          {exampleLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      );
      exampleLines = [];
      inExample = false;
    }
  };

  const formatInlineText = (text) => {
    // Handle inline formatting: **bold**, `code`, etc.
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Check for `code`
      const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
      if (codeMatch) {
        if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
        parts.push(<code key={key++} style={styles.msgCode}>{codeMatch[2]}</code>);
        remaining = codeMatch[3];
        continue;
      }

      // Check for **bold**
      const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/);
      if (boldMatch) {
        if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
        parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
        continue;
      }

      // No more formatting, add remaining text
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    return parts.length > 0 ? parts : text;
  };

  // Find the index of the LAST standalone question (for CTA styling)
  const isStandaloneQuestion = (line) =>
    line.endsWith('?') && line.length > 20 && !line.startsWith('-') && !line.startsWith('•');

  let lastQuestionIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (isStandaloneQuestion(line)) {
      lastQuestionIndex = i;
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines but flush lists
    if (!line) {
      flushList();
      flushExample();
      continue;
    }

    // Skip raw JSON fragments
    if (jsonPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    // Horizontal separator (---)
    if (/^-{3,}$/.test(line)) {
      flushList();
      flushExample();
      elements.push(<div key={`sep-${i}`} style={styles.msgSeparator} />);
      continue;
    }

    // Example blocks (indented or starting with Example/Input/Output for mock data)
    if (line.match(/^Example\s*\d*:/i) ||
        line.startsWith('- **Input') || line.startsWith('- **Output') || line.startsWith('- **Expected')) {
      flushList();
      if (!inExample) inExample = true;
      exampleLines.push(formatInlineText(line));
      continue;
    }

    if (inExample && (line.startsWith('-') || line.startsWith('{'))) {
      exampleLines.push(formatInlineText(line));
      continue;
    } else if (inExample) {
      flushExample();
    }

    // Section labels like "Inputs:", "Outputs:", "Parameters:" - treat as headings
    if (/^[A-Z][a-z]+s?:\s*$/.test(line)) {
      flushList();
      elements.push(
        <div key={`h-${i}`} style={styles.msgHeading}>
          {line.replace(':', '')}
        </div>
      );
      continue;
    }

    // Questions (standalone lines ending with ?, not starting with - or bullets)
    // Only the LAST question gets CTA styling, others are regular text with formatting
    if (isStandaloneQuestion(line)) {
      flushList();
      if (i === lastQuestionIndex) {
        // Last question - style as call-to-action
        elements.push(
          <div key={`q-${i}`} style={styles.msgCallToAction}>
            {formatInlineText(line)}
          </div>
        );
      } else {
        // Other questions - just regular paragraph with formatting
        elements.push(
          <p key={`p-${i}`} style={styles.msgParagraph}>
            {formatInlineText(line)}
          </p>
        );
      }
      continue;
    }

    // Headings (lines with ** at start and end, or numbered with **)
    if ((line.startsWith('**') && line.endsWith('**')) ||
        /^\d+\.\s+\*\*/.test(line) ||
        (line.startsWith('**') && line.includes(':**'))) {
      flushList();
      const headingText = line.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').replace(/:$/, '');

      // Check for special section headers with icons
      const lowerHeading = headingText.toLowerCase();
      let icon = null;
      let sectionStyle = null;

      if (lowerHeading.includes('current status') || lowerHeading.includes('status')) {
        icon = '📊';
        sectionStyle = styles.msgSectionStatus;
      } else if (lowerHeading.includes('missing') || lowerHeading.includes("what's missing")) {
        icon = '⚠️';
        sectionStyle = styles.msgSectionMissing;
      } else if (lowerHeading.includes('improve') || lowerHeading.includes('how to')) {
        icon = '💡';
        sectionStyle = styles.msgSectionImprove;
      } else if (lowerHeading.includes('purpose') || lowerHeading.includes('what is') || lowerHeading.includes('overview')) {
        icon = '📋';
        sectionStyle = styles.msgSectionPurpose;
      }

      if (icon && sectionStyle) {
        elements.push(
          <div key={`h-${i}`} style={styles.msgSectionHeader}>
            <span style={{ ...styles.msgSectionIcon, ...sectionStyle }}>{icon}</span>
            <span>{headingText}</span>
          </div>
        );
      } else {
        elements.push(
          <div key={`h-${i}`} style={styles.msgHeading}>
            {headingText}
          </div>
        );
      }
      continue;
    }

    // Italic summary lines (lines that start and end with single *)
    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      flushList();
      const summaryText = line.slice(1, -1).trim();
      elements.push(
        <div key={`summary-${i}`} style={styles.msgSectionSummary}>
          {summaryText}
        </div>
      );
      continue;
    }

    // List items (starting with - or • or number.)
    if (/^[-•]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const itemText = line.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, '');
      currentList.push(itemText);
      continue;
    }

    // Done/completed items (containing ✓ or "done" or "complete" or "added")
    if (line.includes('✓') || /\b(done|complete|added|saved|created)\b/i.test(line)) {
      flushList();
      elements.push(
        <div key={`done-${i}`} style={styles.msgDone}>
          <span>✓</span> {formatInlineText(line.replace('✓', '').trim())}
        </div>
      );
      continue;
    }

    // Check if line contains tool names pattern (e.g., "Email Scanner, Email Organizer, and Response Sender")
    const toolListMatch = line.match(/tools?[^:]*:\s*([A-Z][a-z]+\s*[A-Z]?[a-z]*(?:,\s*[A-Z][a-z]+\s*[A-Z]?[a-z]*)+(?:,?\s*and\s*[A-Z][a-z]+\s*[A-Z]?[a-z]*)?)/i);
    if (toolListMatch) {
      flushList();
      // Extract tool names from the match
      const toolsStr = toolListMatch[1];
      const toolNames = toolsStr.split(/,\s*|\s+and\s+/).filter(t => t.trim());

      // Show intro text
      const introText = line.substring(0, line.indexOf(toolListMatch[0]) + toolListMatch[0].indexOf(toolListMatch[1])).trim();
      if (introText) {
        elements.push(
          <div key={`p-${i}`} style={styles.msgParagraph}>
            {formatInlineText(introText)}
          </div>
        );
      }

      // Show tools as a styled list
      elements.push(
        <div key={`tools-${i}`} style={styles.msgToolList}>
          {toolNames.map((tool, j) => (
            <div key={j} style={styles.msgToolItem}>
              <span style={styles.msgToolName}>{tool.trim()}</span>
            </div>
          ))}
        </div>
      );

      // Show remaining text if any
      const afterTools = line.substring(line.indexOf(toolListMatch[1]) + toolListMatch[1].length).trim();
      if (afterTools && afterTools.length > 10) {
        elements.push(
          <div key={`p-after-${i}`} style={styles.msgParagraph}>
            {formatInlineText(afterTools.replace(/^[.,]\s*/, ''))}
          </div>
        );
      }
      continue;
    }

    // Check if line ends with a question that should be separated
    // Match pattern: "some text. Question here?"
    const inlineQuestionMatch = line.match(/^(.+[.!])\s+([A-Z][^.!?]*\?)$/);
    if (inlineQuestionMatch) {
      flushList();
      const beforeQuestion = inlineQuestionMatch[1].trim();
      const question = inlineQuestionMatch[2].trim();

      // Render the text before the question
      elements.push(
        <div key={`p-${i}-before`} style={styles.msgParagraph}>
          {formatInlineText(beforeQuestion)}
        </div>
      );

      // Render the question separately with question styling
      elements.push(
        <div key={`q-${i}`} style={styles.msgQuestion}>
          {formatInlineText(question)}
        </div>
      );
      continue;
    }

    // Long paragraphs - split into sentences for better readability
    if (line.length > 100) {
      flushList();
      // More aggressive sentence splitting - split on any . ! ? followed by space
      const sentences = line.split(/(?<=[.!?])\s+/).filter(s => s.trim());

      if (sentences.length > 1) {
        // Group sentences into logical chunks for better readability
        sentences.forEach((sentence, j) => {
          const trimmed = sentence.trim();
          if (!trimmed) return;

          // Check if this sentence is a question
          if (trimmed.endsWith('?')) {
            elements.push(
              <div key={`q-${i}-${j}`} style={styles.msgQuestion}>
                {formatInlineText(trimmed)}
              </div>
            );
          } else {
            elements.push(
              <div key={`p-${i}-${j}`} style={styles.msgParagraph}>
                {formatInlineText(trimmed)}
              </div>
            );
          }
        });
      } else {
        // Single long sentence - use long paragraph style
        elements.push(
          <div key={`p-${i}`} style={styles.msgLongParagraph}>
            {formatInlineText(line)}
          </div>
        );
      }
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <div key={`p-${i}`} style={styles.msgParagraph}>
        {formatInlineText(line)}
      </div>
    );
  }

  // Flush any remaining items
  flushList();
  flushExample();

  return elements.length > 0 ? elements : content;
}

export default function ChatPanel({
  messages = [],
  onSendMessage,
  onFileUpload,
  sending,
  skillName,
  inputHint,
  skill,
  onFocusChange
}) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        Chat {skillName && `— ${skillName}`}
      </div>
      
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.welcome}>
            <div style={styles.welcomeTitle}>Welcome!</div>
            <p>Start a conversation to build your skill.</p>
          </div>
        )}
        
        {messages.map((msg, i) => {
          // Check if this is the last assistant message
          const isLastAssistant = msg.role === 'assistant' && (
            i === messages.length - 1 ||
            (i === messages.length - 2 && messages[messages.length - 1]?.role === 'user')
          );

          // Show dashboard on last assistant message if it mentions status-related words
          const contentLower = msg.content?.toLowerCase() || '';
          const hasStatusContent =
            contentLower.includes('status') ||
            contentLower.includes('summary') ||
            contentLower.includes('progress') ||
            contentLower.includes("let's review") ||
            contentLower.includes("here's what we") ||
            contentLower.includes("here's where we") ||
            contentLower.includes('so far') ||
            contentLower.includes('currently') ||
            contentLower.includes('current state') ||
            contentLower.includes('what we have') ||
            contentLower.includes('problem statement:') ||
            contentLower.includes('scenarios defined:') ||
            contentLower.includes('intents defined:') ||
            contentLower.includes('tools defined:');

          const showDashboard = isLastAssistant && hasStatusContent && skill;

          return (
            <div
              key={i}
              style={{
                ...styles.message,
                ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
                ...(msg.isError ? styles.errorMessage : {})
              }}
            >
              {showDashboard && <MiniDashboard skill={skill} onFocusChange={onFocusChange} />}
              {formatMessage(msg.content)}
            </div>
          );
        })}
        
        {sending && (
          <div style={styles.typing}>
            <div style={styles.typingDots}>
              <span style={{ ...styles.typingDot, animationDelay: '0s' }} />
              <span style={{ ...styles.typingDot, animationDelay: '0.2s' }} />
              <span style={{ ...styles.typingDot, animationDelay: '0.4s' }} />
            </div>
            <span>Working on it...</span>
            <style>{`
              @keyframes pulse {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
                40% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div style={styles.inputArea}>
        <SmartInput
          inputHint={inputHint}
          onSend={onSendMessage}
          onFileUpload={onFileUpload}
          sending={sending}
        />
      </div>
    </div>
  );
}
