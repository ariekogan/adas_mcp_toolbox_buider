import { useState } from 'react';
import { runMock } from '../api/client';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: 'var(--bg-secondary)',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: '4px 8px'
  },
  content: {
    padding: '20px',
    overflow: 'auto',
    flex: 1
  },
  section: {
    marginBottom: '20px'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    marginBottom: '10px'
  },
  inputGroup: {
    marginBottom: '12px'
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
    fontSize: '13px'
  },
  inputName: {
    fontFamily: 'monospace',
    fontWeight: '500',
    color: 'var(--accent)'
  },
  inputType: {
    fontSize: '10px',
    padding: '2px 6px',
    background: 'var(--bg-tertiary)',
    borderRadius: '3px',
    color: 'var(--text-muted)'
  },
  required: {
    fontSize: '10px',
    color: '#ef4444'
  },
  description: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: 'inherit'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'monospace',
    minHeight: '80px',
    resize: 'vertical'
  },
  modeToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  modeBtn: {
    padding: '8px 16px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '13px'
  },
  modeBtnActive: {
    background: 'var(--accent)',
    color: 'white',
    borderColor: 'var(--accent)'
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px'
  },
  btn: {
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px'
  },
  cancelBtn: {
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)'
  },
  runBtn: {
    background: 'var(--accent)',
    color: 'white'
  },
  runBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  result: {
    marginTop: '16px',
    padding: '16px',
    background: 'var(--bg-card)',
    borderRadius: '8px',
    border: '1px solid var(--border)'
  },
  resultLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    textTransform: 'uppercase'
  },
  resultContent: {
    fontFamily: 'monospace',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: '1.5'
  },
  resultSuccess: {
    color: 'var(--success)'
  },
  resultError: {
    color: '#ef4444'
  },
  matchInfo: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-secondary)',
    borderRadius: '4px'
  }
};

export default function TestToolModal({ tool, projectId, onClose }) {
  const [inputs, setInputs] = useState(() => {
    // Initialize with empty values based on tool inputs
    const initial = {};
    tool.inputs?.forEach(input => {
      initial[input.name] = '';
    });
    return initial;
  });
  const [mode, setMode] = useState('example'); // 'example' or 'llm'
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleInputChange = (name, value) => {
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      // Build input object, parsing JSON for object/array types
      const inputObj = {};
      tool.inputs?.forEach(input => {
        let value = inputs[input.name];
        if (value === '') {
          if (!input.required) return; // Skip optional empty inputs
          value = undefined;
        } else if (input.type === 'number') {
          value = Number(value);
        } else if (input.type === 'boolean') {
          value = value.toLowerCase() === 'true';
        } else if (input.type === 'object' || input.type === 'array') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON
          }
        }
        inputObj[input.name] = value;
      });

      const data = await runMock(projectId, tool.id || tool.name, inputObj, mode);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.title}>
            <span>▶</span> Test: {tool.name}
          </div>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.content}>
          {/* Mode Toggle */}
          <div style={styles.modeToggle}>
            <button
              style={{ ...styles.modeBtn, ...(mode === 'example' ? styles.modeBtnActive : {}) }}
              onClick={() => setMode('example')}
            >
              Mock Examples
            </button>
            <button
              style={{ ...styles.modeBtn, ...(mode === 'llm' ? styles.modeBtnActive : {}) }}
              onClick={() => setMode('llm')}
            >
              LLM Simulation
            </button>
          </div>

          {/* Inputs */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Inputs</div>
            {tool.inputs?.map((input, i) => (
              <div key={i} style={styles.inputGroup}>
                <div style={styles.label}>
                  <span style={styles.inputName}>{input.name}</span>
                  <span style={styles.inputType}>{input.type || 'string'}</span>
                  {input.required && <span style={styles.required}>required</span>}
                </div>
                {input.description && (
                  <div style={styles.description}>{input.description}</div>
                )}
                {input.type === 'object' || input.type === 'array' ? (
                  <textarea
                    style={styles.textarea}
                    value={inputs[input.name]}
                    onChange={(e) => handleInputChange(input.name, e.target.value)}
                    placeholder={`Enter ${input.type} as JSON...`}
                  />
                ) : (
                  <input
                    style={styles.input}
                    type={input.type === 'number' ? 'number' : 'text'}
                    value={inputs[input.name]}
                    onChange={(e) => handleInputChange(input.name, e.target.value)}
                    placeholder={`Enter ${input.name}...`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Result */}
          {(result || error) && (
            <div style={styles.result}>
              <div style={styles.resultLabel}>
                {error ? 'Error' : 'Result'}
              </div>
              {error ? (
                <div style={{ ...styles.resultContent, ...styles.resultError }}>
                  {error}
                </div>
              ) : (
                <>
                  <div style={{ ...styles.resultContent, ...styles.resultSuccess }}>
                    {JSON.stringify(result.output, null, 2)}
                  </div>
                  {result.matched !== undefined && (
                    <div style={styles.matchInfo}>
                      {result.matched === true && '✓ Exact match found in mock examples'}
                      {result.matched === 'partial' && '≈ Partial match found in mock examples'}
                      {result.matched === false && '⚠ No exact match - using fallback/first example'}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            style={{ ...styles.btn, ...styles.cancelBtn }}
            onClick={onClose}
          >
            Close
          </button>
          <button
            style={{
              ...styles.btn,
              ...styles.runBtn,
              ...(running ? styles.runBtnDisabled : {})
            }}
            onClick={handleRun}
            disabled={running}
          >
            {running ? 'Running...' : 'Run Test'}
          </button>
        </div>
      </div>
    </div>
  );
}
