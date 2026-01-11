/**
 * SmartInput - Intelligent input component that adapts to context
 *
 * Modes:
 * - text: Standard text input
 * - selection: Clickable options with optional custom input
 *   - Short options (< 30 chars avg): pill buttons
 *   - Long options: list/table format
 */

import { useState, useRef, useEffect } from 'react';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  // Pill buttons for short options
  selectionContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '4px'
  },
  optionButton: {
    padding: '10px 18px',
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
  // List format for long options
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    marginBottom: '6px'
  },
  listOption: {
    padding: '6px 10px',
    background: 'transparent',
    border: 'none',
    borderLeft: '2px solid var(--border)',
    borderRadius: '0',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    textAlign: 'left',
    transition: 'all 0.15s ease',
    lineHeight: '1.3'
  },
  listOptionHover: {
    background: 'transparent',
    borderLeftColor: 'var(--accent)',
    color: 'var(--text-primary)'
  },
  otherButton: {
    padding: '8px 14px',
    background: 'transparent',
    border: '1px dashed var(--border)',
    borderRadius: '16px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px'
  },
  otherButtonList: {
    padding: '6px 10px',
    background: 'transparent',
    border: 'none',
    borderLeft: '2px dashed var(--border)',
    borderRadius: '0',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    textAlign: 'left'
  },
  inputRow: {
    display: 'flex',
    gap: '8px'
  },
  input: {
    flex: 1,
    padding: '20px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '16px',
    resize: 'none',
    minHeight: '120px',
    maxHeight: '250px',
    fontFamily: 'inherit',
    lineHeight: '1.5',
    boxSizing: 'border-box'
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
  },
  // Upload styles - compact icon button
  uploadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  uploadButton: {
    padding: '8px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    minWidth: '36px',
    height: '36px'
  },
  uploadButtonHover: {
    background: 'var(--bg-secondary)',
    borderColor: 'var(--accent)',
    color: 'var(--accent)'
  },
  fileSelected: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 14px',
    background: 'var(--accent)15',
    border: '1px solid var(--accent)',
    borderRadius: '8px',
    fontSize: '13px'
  },
  fileName: {
    color: 'var(--text-primary)',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  removeFile: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '14px'
  },
  analyzeButton: {
    padding: '8px 14px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500'
  },
  uploadHint: {
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  // Input row with upload button inline
  inputRowWithUpload: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end'
  },
  buttonGroup: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center'
  }
};

// Determine if options are "short" (use pills) or "long" (use list)
function shouldUseListFormat(options) {
  if (!options || options.length === 0) return false;
  const avgLength = options.reduce((sum, opt) => sum + opt.length, 0) / options.length;
  const maxLength = Math.max(...options.map(opt => opt.length));
  // Use list if avg > 25 chars OR any option > 40 chars
  return avgLength > 25 || maxLength > 40;
}

export default function SmartInput({
  inputHint,
  onSend,
  onFileUpload,
  sending,
  placeholder = "Type your message..."
}) {
  const [input, setInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [hoveredOption, setHoveredOption] = useState(null);
  const [hoveredUpload, setHoveredUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const mode = inputHint?.mode || 'text';
  const options = inputHint?.options || [];
  const customPlaceholder = inputHint?.placeholder || placeholder;
  const useList = shouldUseListFormat(options);

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

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileUpload = () => {
    if (selectedFile && onFileUpload) {
      onFileUpload(selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload button component - compact icon
  const renderUploadButton = () => {
    if (!onFileUpload) return null;

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv,.json,.md,.eml,.log"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {selectedFile ? (
          <div style={styles.uploadRow}>
            <div style={styles.fileSelected}>
              <span style={styles.fileName}>{selectedFile.name}</span>
              <button style={styles.removeFile} onClick={handleRemoveFile}>×</button>
            </div>
            <button
              style={styles.analyzeButton}
              onClick={handleFileUpload}
              disabled={sending}
            >
              {sending ? '...' : 'Analyze'}
            </button>
          </div>
        ) : (
          <button
            style={{
              ...styles.uploadButton,
              ...(hoveredUpload ? styles.uploadButtonHover : {})
            }}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={() => setHoveredUpload(true)}
            onMouseLeave={() => setHoveredUpload(false)}
            disabled={sending}
            title="Upload example file (.txt, .csv, .json, .eml)"
          >
            📎
          </button>
        )}
      </>
    );
  };

  // Selection mode with options (not showing text input)
  if (mode === 'selection' && options.length > 0 && !showTextInput) {
    // List format for long options
    if (useList) {
      return (
        <div style={styles.container}>
          <div style={styles.listContainer}>
            {options.map((option, i) => (
              <button
                key={i}
                style={{
                  ...styles.listOption,
                  ...(hoveredOption === i ? styles.listOptionHover : {})
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
              style={styles.otherButtonList}
              onClick={() => setShowTextInput(true)}
              disabled={sending}
            >
              Something else...
            </button>
          </div>
          {renderUploadButton()}
        </div>
      );
    }

    // Pill buttons for short options
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
        {renderUploadButton()}
      </div>
    );
  }

  // Text mode (default) or "Other" selected
  return (
    <div style={styles.container}>
      {mode === 'selection' && showTextInput && options.length > 0 && (
        <div style={useList ? styles.listContainer : styles.selectionContainer}>
          {options.map((option, i) => (
            <button
              key={i}
              style={{
                ...(useList ? styles.listOption : styles.optionButton),
                ...(hoveredOption === i ? (useList ? styles.listOptionHover : styles.optionButtonHover) : {})
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
      <div style={styles.inputRowWithUpload}>
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
        <div style={styles.buttonGroup}>
          {renderUploadButton()}
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
    </div>
  );
}
