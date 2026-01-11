/**
 * SmartInput - Intelligent input component that adapts to context
 *
 * Modes:
 * - text: Standard text input
 * - selection: Clickable options with optional custom input
 */

import { useState, useRef, useEffect } from 'react';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  selectionContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '4px'
  },
  optionButton: {
    padding: '8px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.15s ease'
  },
  optionButtonHover: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'white'
  },
  otherButton: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px dashed var(--border)',
    borderRadius: '20px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '14px'
  },
  inputRow: {
    display: 'flex',
    gap: '8px'
  },
  input: {
    flex: 1,
    padding: '16px 18px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '16px',
    resize: 'none',
    minHeight: '60px',
    maxHeight: '160px',
    fontFamily: 'inherit',
    lineHeight: '1.5'
  },
  sendButton: {
    padding: '12px 20px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    whiteSpace: 'nowrap'
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

export default function SmartInput({
  inputHint,
  onSend,
  sending,
  placeholder = "Type your message..."
}) {
  const [input, setInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [hoveredOption, setHoveredOption] = useState(null);
  const inputRef = useRef(null);

  const mode = inputHint?.mode || 'text';
  const options = inputHint?.options || [];
  const customPlaceholder = inputHint?.placeholder || placeholder;

  // Reset showTextInput when inputHint changes
  useEffect(() => {
    setShowTextInput(false);
    setInput('');
  }, [inputHint]);

  // Focus text input when shown
  useEffect(() => {
    if (showTextInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showTextInput]);

  const handleSend = () => {
    if (input.trim() && !sending) {
      onSend(input.trim());
      setInput('');
      setShowTextInput(false);
    }
  };

  const handleOptionClick = (option) => {
    if (!sending) {
      onSend(option);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Selection mode with options
  if (mode === 'selection' && options.length > 0 && !showTextInput) {
    return (
      <div style={styles.container}>
        <div style={styles.selectionContainer}>
          {options.map((option, i) => (
            <button
              key={i}
              style={{
                ...styles.optionButton,
                ...(hoveredOption === i ? styles.optionButtonHover : {})
              }}
              onClick={() => handleOptionClick(option)}
              onMouseEnter={() => setHoveredOption(i)}
              onMouseLeave={() => setHoveredOption(null)}
              disabled={sending}
            >
              {option}
            </button>
          ))}
          <button
            style={styles.otherButton}
            onClick={() => setShowTextInput(true)}
            disabled={sending}
          >
            Other...
          </button>
        </div>
      </div>
    );
  }

  // Text mode (default) or "Other" selected
  return (
    <div style={styles.container}>
      {mode === 'selection' && showTextInput && (
        <div style={styles.selectionContainer}>
          {options.map((option, i) => (
            <button
              key={i}
              style={{
                ...styles.optionButton,
                ...(hoveredOption === i ? styles.optionButtonHover : {})
              }}
              onClick={() => handleOptionClick(option)}
              onMouseEnter={() => setHoveredOption(i)}
              onMouseLeave={() => setHoveredOption(null)}
              disabled={sending}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <div style={styles.inputRow}>
        <textarea
          ref={inputRef}
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={customPlaceholder}
          rows={1}
          disabled={sending}
        />
        <button
          style={{
            ...styles.sendButton,
            ...(sending || !input.trim() ? styles.sendButtonDisabled : {})
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
