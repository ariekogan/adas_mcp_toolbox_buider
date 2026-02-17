import { useState } from 'react';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100
  },
  modal: {
    background: 'var(--bg-card)',
    borderRadius: '12px',
    width: '480px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: 'var(--shadow)'
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
    fontWeight: '600'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  body: {
    padding: '24px'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: 'var(--text-secondary)'
  },
  field: {
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    marginBottom: '6px',
    color: 'var(--text-muted)'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '14px'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    cursor: 'pointer'
  },
  radioGroup: {
    display: 'flex',
    gap: '16px'
  },
  radio: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  radioInput: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  hint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  serverBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#10b981',
    marginBottom: '8px'
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px'
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '10px 20px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '500'
  }
};

export default function SettingsModal({ settings, onSave, onClose, backendStatus }) {
  const [local, setLocal] = useState({ ...settings });
  const [showKeys, setShowKeys] = useState({
    anthropic: false,
    openai: false
  });

  const update = (key, value) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  const serverHasKey = backendStatus?.hasApiKey;
  const serverProvider = backendStatus?.llmProvider;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Settings</span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.body}>
          {/* Server Status Banner */}
          {serverHasKey && (
            <div style={{ ...styles.serverBadge, marginBottom: '16px', width: 'fit-content' }}>
              <span>&#x2713;</span>
              <span>Server configured with {serverProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key</span>
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionTitle}>LLM Provider</div>

            <div style={styles.field}>
              <div style={styles.radioGroup}>
                <label style={styles.radio}>
                  <input
                    type="radio"
                    style={styles.radioInput}
                    checked={local.llm_provider === 'anthropic'}
                    onChange={() => update('llm_provider', 'anthropic')}
                  />
                  Anthropic (Claude)
                  {serverProvider === 'anthropic' && serverHasKey && (
                    <span style={{ fontSize: '11px', color: '#10b981', marginLeft: '4px' }}>(server)</span>
                  )}
                </label>
                <label style={styles.radio}>
                  <input
                    type="radio"
                    style={styles.radioInput}
                    checked={local.llm_provider === 'openai'}
                    onChange={() => update('llm_provider', 'openai')}
                  />
                  OpenAI (GPT-4)
                  {serverProvider === 'openai' && serverHasKey && (
                    <span style={{ fontSize: '11px', color: '#10b981', marginLeft: '4px' }}>(server)</span>
                  )}
                </label>
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>API Keys</div>
            <div style={styles.hint}>
              {serverHasKey
                ? 'Server has API key configured. Enter your own key below to override.'
                : 'Enter your API key to enable chat functionality.'
              }
            </div>

            <div style={{ ...styles.field, marginTop: '12px' }}>
              <label style={styles.label}>
                Anthropic API Key
                {serverProvider === 'anthropic' && serverHasKey && !local.anthropic_api_key && (
                  <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '11px' }}>
                    &#x2713; Using server key
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showKeys.anthropic ? 'text' : 'password'}
                  style={{ ...styles.input, flex: 1 }}
                  value={local.anthropic_api_key || ''}
                  onChange={e => update('anthropic_api_key', e.target.value)}
                  placeholder={serverProvider === 'anthropic' && serverHasKey ? '(using server key)' : 'sk-ant-...'}
                />
                <button
                  style={styles.cancelBtn}
                  onClick={() => setShowKeys(p => ({ ...p, anthropic: !p.anthropic }))}
                >
                  {showKeys.anthropic ? '🙈' : '👁'}
                </button>
              </div>
              <div style={styles.hint}>
                Get your key at console.anthropic.com
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                OpenAI API Key
                {serverProvider === 'openai' && serverHasKey && !local.openai_api_key && (
                  <span style={{ color: '#10b981', marginLeft: '8px', fontSize: '11px' }}>
                    &#x2713; Using server key
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showKeys.openai ? 'text' : 'password'}
                  style={{ ...styles.input, flex: 1 }}
                  value={local.openai_api_key || ''}
                  onChange={e => update('openai_api_key', e.target.value)}
                  placeholder={serverProvider === 'openai' && serverHasKey ? '(using server key)' : 'sk-...'}
                />
                <button
                  style={styles.cancelBtn}
                  onClick={() => setShowKeys(p => ({ ...p, openai: !p.openai }))}
                >
                  {showKeys.openai ? '🙈' : '👁'}
                </button>
              </div>
              <div style={styles.hint}>
                Get your key at platform.openai.com
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Model Selection</div>

            {local.llm_provider === 'anthropic' && (
              <div style={styles.field}>
                <label style={styles.label}>Claude Model</label>
                <select
                  style={styles.select}
                  value={local.anthropic_model || 'claude-sonnet-4-20250514'}
                  onChange={e => update('anthropic_model', e.target.value)}
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Recommended)</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5</option>
                </select>
              </div>
            )}

            {local.llm_provider === 'openai' && (
              <div style={styles.field}>
                <label style={styles.label}>GPT Model</label>
                <select
                  style={styles.select}
                  value={local.openai_model || 'gpt-5.2'}
                  onChange={e => update('openai_model', e.target.value)}
                >
                  <option value="gpt-5.2">GPT-5.2 (Recommended)</option>
                  <option value="gpt-5.2-pro">GPT-5.2 Pro</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.saveBtn} onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
