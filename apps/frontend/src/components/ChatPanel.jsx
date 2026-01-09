import { useState, useRef, useEffect } from 'react';

const styles = {
  container: {
    flex: '1 1 60%',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    borderRight: '1px solid var(--border)'
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
    background: 'var(--accent)',
    color: 'white',
    borderBottomRightRadius: '4px'
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
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: '8px'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    resize: 'none',
    minHeight: '48px',
    maxHeight: '120px'
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
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    borderRadius: '8px',
    marginTop: '12px',
    fontWeight: '500',
    fontSize: '14px',
    borderLeft: '3px solid var(--accent)'
  },
  msgHeading: {
    fontWeight: '600',
    fontSize: '14px',
    marginBottom: '6px',
    marginTop: '12px',
    color: 'var(--text-primary)'
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
    lineHeight: '1.7',
    padding: '8px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px'
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
  }
};

function formatMessage(content) {
  // Filter out raw JSON fragments that might leak through
  const jsonPatterns = [
    /^\s*\{\s*$/,
    /^\s*\}\s*$/,
    /^\s*"[a-z_]+"\s*:\s*(null|true|false|"[^"]*"|\d+)\s*,?\s*$/i,
    /^\s*"(message|state_update|suggested_focus)"\s*:/i
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

    // Questions (lines ending with ?)
    if (line.endsWith('?') && line.length > 20) {
      flushList();
      elements.push(
        <div key={`q-${i}`} style={styles.msgQuestion}>
          {formatInlineText(line)}
        </div>
      );
      continue;
    }

    // Headings (lines with ** at start and end, or numbered with **)
    if ((line.startsWith('**') && line.endsWith('**')) ||
        /^\d+\.\s+\*\*/.test(line)) {
      flushList();
      const headingText = line.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '');
      elements.push(
        <div key={`h-${i}`} style={styles.msgHeading}>
          {headingText}
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

    // Long paragraphs get special styling
    const isLongParagraph = line.length > 150;

    // Regular paragraph
    flushList();
    elements.push(
      <div key={`p-${i}`} style={isLongParagraph ? styles.msgLongParagraph : styles.msgParagraph}>
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
  sending,
  projectName 
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        💬 Chat {projectName && `— ${projectName}`}
      </div>
      
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.welcome}>
            <div style={styles.welcomeTitle}>Welcome!</div>
            <p>Start a conversation to build your toolbox.</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
              ...(msg.isError ? styles.errorMessage : {})
            }}
          >
            {formatMessage(msg.content)}
          </div>
        ))}
        
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
        <textarea
          ref={inputRef}
          style={styles.input}
          placeholder="Type your message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          style={{
            ...styles.sendBtn,
            ...(sending || !input.trim() ? styles.sendBtnDisabled : {})
          }}
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
