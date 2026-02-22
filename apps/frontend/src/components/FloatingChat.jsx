/**
 * FloatingChat — Centered floating chat overlay
 * Collapsed: just SmartInput at bottom center
 * Expanded: grows upward with message history
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import SmartInput from './SmartInput';
import SolutionSummaryCard from './SolutionSummaryCard';
import SolutionVerificationPanel from './SolutionVerificationPanel';

// Inline formatMessage (imported from ChatPanel pattern)
function formatMessage(content) {
  const jsonPatterns = [
    /^\s*[\{\}\[\]]\s*$/,
    /^\s*[\{\}\[\]],?\s*$/,
    /^\s*"[a-z_]+"\s*:\s*[\{\[]\s*$/i,
    /^\s*"[a-z_]+"\s*:\s*(null|true|false|"[^"]*"|\d+)\s*,?\s*$/i,
    /^\s*"(message|state_update|suggested_focus|tools_push|inputs|outputs|name|purpose|id|status)"\s*:/i
  ];

  const lines = content.split('\n');
  const elements = [];
  let currentList = [];
  let inExample = false;
  let exampleLines = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={msgStyles.list}>
          {currentList.map((item, i) => (
            <li key={i} style={msgStyles.listItem}>{formatInlineText(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const flushExample = () => {
    if (exampleLines.length > 0) {
      elements.push(
        <div key={`ex-${elements.length}`} style={msgStyles.example}>
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
    const parts = [];
    let remaining = text;
    let key = 0;
    while (remaining.length > 0) {
      const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
      if (codeMatch) {
        if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
        parts.push(<code key={key++} style={msgStyles.code}>{codeMatch[2]}</code>);
        remaining = codeMatch[3];
        continue;
      }
      const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/);
      if (boldMatch) {
        if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
        parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
        continue;
      }
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    return parts.length > 0 ? parts : text;
  };

  const isStandaloneQuestion = (line) =>
    line.endsWith('?') && line.length > 20 && !line.startsWith('-') && !line.startsWith('•');

  let lastQuestionIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isStandaloneQuestion(lines[i].trim())) { lastQuestionIndex = i; break; }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { flushList(); flushExample(); continue; }
    if (jsonPatterns.some(p => p.test(line))) continue;
    if (/^-{3,}$/.test(line)) { flushList(); flushExample(); elements.push(<div key={`sep-${i}`} style={msgStyles.separator} />); continue; }
    if (line.match(/^Example\s*\d*:/i) || line.startsWith('- **Input') || line.startsWith('- **Output') || line.startsWith('- **Expected')) {
      flushList(); if (!inExample) inExample = true; exampleLines.push(formatInlineText(line)); continue;
    }
    if (inExample && (line.startsWith('-') || line.startsWith('{'))) { exampleLines.push(formatInlineText(line)); continue; }
    else if (inExample) { flushExample(); }
    if (/^[A-Z][a-z]+s?:\s*$/.test(line)) { flushList(); elements.push(<div key={`h-${i}`} style={msgStyles.heading}>{line.replace(':', '')}</div>); continue; }
    if (isStandaloneQuestion(line)) {
      flushList();
      if (i === lastQuestionIndex) {
        elements.push(<div key={`q-${i}`} style={msgStyles.callToAction}>{formatInlineText(line)}</div>);
      } else {
        elements.push(<p key={`p-${i}`} style={msgStyles.paragraph}>{formatInlineText(line)}</p>);
      }
      continue;
    }
    if ((line.startsWith('**') && line.endsWith('**')) || /^\d+\.\s+\*\*/.test(line) || (line.startsWith('**') && line.includes(':**'))) {
      flushList();
      const headingText = line.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').replace(/:$/, '');
      elements.push(<div key={`h-${i}`} style={msgStyles.heading}>{headingText}</div>);
      continue;
    }
    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      flushList();
      elements.push(<div key={`summary-${i}`} style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{line.slice(1, -1).trim()}</div>);
      continue;
    }
    if (/^[-•]\s/.test(line) || /^\d+\.\s/.test(line)) {
      currentList.push(line.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, ''));
      continue;
    }
    if (line.includes('✓') || /\b(done|complete|added|saved|created)\b/i.test(line)) {
      flushList();
      elements.push(<div key={`done-${i}`} style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><span>✓</span> {formatInlineText(line.replace('✓', '').trim())}</div>);
      continue;
    }
    if (line.length > 100) {
      flushList();
      const sentences = line.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      if (sentences.length > 1) {
        sentences.forEach((sentence, j) => {
          const trimmed = sentence.trim();
          if (!trimmed) return;
          elements.push(<div key={`p-${i}-${j}`} style={msgStyles.paragraph}>{formatInlineText(trimmed)}</div>);
        });
      } else {
        elements.push(<div key={`p-${i}`} style={{ ...msgStyles.paragraph, lineHeight: '1.7' }}>{formatInlineText(line)}</div>);
      }
      continue;
    }
    flushList();
    elements.push(<div key={`p-${i}`} style={msgStyles.paragraph}>{formatInlineText(line)}</div>);
  }
  flushList();
  flushExample();
  return elements.length > 0 ? elements : content;
}

const msgStyles = {
  list: { margin: '8px 0', paddingLeft: '20px' },
  listItem: { marginBottom: '4px', lineHeight: '1.5' },
  example: { background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '6px', margin: '8px 0', fontSize: '13px', borderLeft: '3px solid var(--accent)' },
  code: { background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' },
  heading: { fontWeight: '600', fontSize: '14px', marginBottom: '6px', marginTop: '12px', color: 'var(--text-primary)' },
  paragraph: { marginBottom: '8px', lineHeight: '1.6' },
  separator: { borderTop: '1px solid var(--border)', margin: '16px 0', opacity: 0.5 },
  callToAction: {
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '14px 16px',
    borderRadius: '8px', marginTop: '16px', fontWeight: '500', fontSize: '15px',
    border: '1px solid var(--accent)', borderLeft: '4px solid var(--accent)'
  },
};

export default function FloatingChat({
  messages = [],
  onSendMessage,
  onFileUpload,
  sending,
  skillName,
  solutionName,
  inputHint,
  skill,
  onFocusChange,
  // Solution mode props
  solution,
  solutionSkills = [],
  onNavigate,
  onSelectSkill,
  currentSkillId,
  // Context indicator props
  contextLabel,
  onContextClick,
  onContextClear,
  // Simplify
  onSimplifyMessage,
}) {
  const messagesEndRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const prevMessageCount = useRef(messages.length);

  // Auto-expand when new assistant message arrives
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant') {
        setExpanded(true);
        setHasNewMessage(false);
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  // Scroll to bottom when expanded
  useEffect(() => {
    if (expanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  // Escape to collapse
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && expanded) {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);

  // Skill dropdown for solution mode
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);

  const handleSend = useCallback((text) => {
    if (onSendMessage) {
      onSendMessage(text);
      setExpanded(true);
    }
  }, [onSendMessage]);

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: expanded ? 'min(700px, calc(100% - 120px))' : 'min(560px, calc(100% - 80px))',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.3s ease',
    }}>
      {/* Expanded message area */}
      {expanded && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          borderRadius: '16px 16px 0 0',
          maxHeight: '55vh',
          overflow: 'auto',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Header bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-card)',
            zIndex: 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Skill dropdown in solution mode */}
              {solutionSkills.length > 0 ? (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setSkillDropdownOpen(prev => !prev)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {(() => {
                      const sel = currentSkillId && solutionSkills.find(s => s.id === currentSkillId);
                      return sel ? (sel.name || sel.id) : `${solutionSkills.length} skills`;
                    })()} ▾
                  </button>
                  {skillDropdownOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        onClick={() => setSkillDropdownOpen(false)}
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: '4px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        minWidth: '220px',
                        zIndex: 100,
                        overflow: 'hidden',
                        maxHeight: '240px',
                        overflowY: 'auto',
                      }}>
                        {solutionSkills.map(s => (
                          <button
                            key={s.id || s.name}
                            onClick={() => { onSelectSkill(s.id); setSkillDropdownOpen(false); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 10px',
                              fontSize: '12px',
                              width: '100%',
                              border: 'none',
                              background: currentSkillId === s.id ? 'var(--bg-tertiary)' : 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                            onMouseEnter={e => { if (currentSkillId !== s.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={e => { if (currentSkillId !== s.id) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <span style={{ flex: 1, color: currentSkillId === s.id ? 'var(--accent)' : 'var(--text-primary)', fontWeight: currentSkillId === s.id ? '600' : '400' }}>{s.name || s.id}</span>
                            {currentSkillId === s.id && <span style={{ color: 'var(--accent)', fontSize: '11px' }}>✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>{skillName || ''}</span>
              )}
            </div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '16px',
                padding: '2px 6px',
                borderRadius: '4px',
                lineHeight: 1,
              }}
              title="Minimize (Esc)"
            >
              ▾
            </button>
          </div>

          {/* Messages */}
          <div style={{
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Start a conversation to build your solution.
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  maxWidth: '90%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  ...(msg.role === 'user'
                    ? {
                        alignSelf: 'flex-end',
                        background: 'var(--bg-tertiary)',
                        borderBottomRightRadius: '4px',
                        borderLeft: '2px solid var(--accent)',
                      }
                    : {
                        alignSelf: 'flex-start',
                        background: 'var(--bg-secondary)',
                        borderBottomLeftRadius: '4px',
                      }),
                  ...(msg.isError ? { background: '#ef444420' } : {}),
                }}
              >
                {formatMessage(msg.content)}
              </div>
            ))}
            {sending && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '10px 14px',
                background: 'var(--bg-secondary)',
                borderRadius: '10px',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}>
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Input area — always visible */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: expanded ? '0 0 16px 16px' : '16px',
        boxShadow: expanded ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* New message indicator when collapsed */}
        {!expanded && hasNewMessage && (
          <div
            onClick={() => { setExpanded(true); setHasNewMessage(false); }}
            style={{
              position: 'absolute',
              top: '-8px',
              right: '16px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--accent)',
              cursor: 'pointer',
              zIndex: 2,
            }}
          />
        )}
        {/* Expand handle when collapsed and there are messages */}
        {!expanded && messages.length > 0 && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              width: '100%',
              padding: '4px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '10px',
            }}
          >
            ▴ {messages.length} message{messages.length !== 1 ? 's' : ''}
          </button>
        )}
        <SmartInput
          inputHint={inputHint}
          onSend={handleSend}
          onFileUpload={onFileUpload}
          sending={sending}
          contextLabel={contextLabel}
          onContextClick={onContextClick}
          onContextClear={onContextClear}
        />
      </div>
    </div>
  );
}
