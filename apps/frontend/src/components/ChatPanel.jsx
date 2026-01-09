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
    fontSize: '14px'
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
  }
};

function formatMessage(content) {
  // Simple formatting: preserve line breaks and basic markdown
  return content.split('\n').map((line, i) => (
    <span key={i}>
      {line}
      {i < content.split('\n').length - 1 && <br />}
    </span>
  ));
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
            Thinking...
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
