import { useState, useEffect, useCallback } from 'react';
import ProjectList from './components/ProjectList';
import ChatPanel from './components/ChatPanel';
import DomainPanel from './components/DomainPanel';
import SettingsModal from './components/SettingsModal';
import { useDomain } from './hooks/useDomain';
import { useSettings } from './hooks/useSettings';
import * as api from './api/client';

const styles = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden'
  },
  topBar: {
    height: '48px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '16px',
    fontWeight: '600'
  },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  settingsBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '6px 12px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  apiStatus: {
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px'
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden'
  },
  welcome: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    textAlign: 'center',
    color: 'var(--text-muted)'
  },
  welcomeTitle: {
    fontSize: '28px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '12px'
  },
  welcomeText: {
    fontSize: '16px',
    maxWidth: '400px',
    lineHeight: '1.6'
  }
};

export default function App() {
  const {
    domains,
    currentDomain,
    loading,
    loadDomains,
    createDomain,
    loadDomain,
    deleteDomain,
    updateDomain,
    addMessage
  } = useDomain();

  const { settings, updateSettings, showModal, openSettings, closeSettings, hasApiKey, backendStatus } = useSettings();
  const [uiFocus, setUiFocus] = useState(null);
  const [greeting, setGreeting] = useState(null);
  const [sending, setSending] = useState(false);

  const messages = currentDomain?.conversation || [];

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  useEffect(() => {
    api.getDomainGreeting().then(setGreeting).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentDomain && currentDomain.conversation?.length === 0 && greeting) {
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toISOString()
      });
    }
  }, [currentDomain, greeting, addMessage]);

  const handleSelect = useCallback(async (id) => {
    setUiFocus(null);
    await loadDomain(id);
  }, [loadDomain]);

  const handleCreate = useCallback(async (name) => {
    setUiFocus(null);
    await createDomain(name, { llm_provider: settings.llm_provider });
  }, [createDomain, settings.llm_provider]);

  const handleSendMessage = useCallback(async (message) => {
    if (!currentDomain) return;

    addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    setSending(true);
    try {
      const response = await api.sendDomainMessage(currentDomain.id, message, uiFocus);
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        state_update: response.state_update,
        suggested_focus: response.suggested_focus
      });
      if (response.domain) {
        updateDomain(response.domain);
      }
    } catch (err) {
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSending(false);
    }
  }, [currentDomain, uiFocus, addMessage, updateDomain]);

  const handleExport = useCallback(async () => {
    if (!currentDomain) return;
    try {
      const result = await api.exportDomain(currentDomain.id);
      alert(`Export complete! Version ${result.version}\n\nFiles:\n${result.files.map(f => f.name).join('\n')}`);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  }, [currentDomain]);

  const apiConfigured = hasApiKey();

  return (
    <div style={styles.app}>
      <div style={styles.topBar}>
        <div style={styles.logo}>
          DAL Builder
        </div>
        <div style={styles.topActions}>
          <span style={{
            ...styles.apiStatus,
            background: apiConfigured ? '#10b98120' : '#ef444420',
            color: apiConfigured ? 'var(--success)' : 'var(--error)'
          }}>
            {apiConfigured ? 'API Key Set' : 'No API Key'}
          </span>
          <button style={styles.settingsBtn} onClick={openSettings}>
            Settings
          </button>
        </div>
      </div>

      <div style={styles.main}>
        <ProjectList
          projects={domains}
          currentId={currentDomain?.id}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={deleteDomain}
          loading={loading}
        />

        {currentDomain ? (
          <div style={styles.mainContent}>
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              sending={sending}
              projectName={currentDomain.name}
            />
            <DomainPanel
              domain={currentDomain}
              focus={uiFocus}
              onFocusChange={setUiFocus}
              onExport={handleExport}
              domainId={currentDomain.id}
            />
          </div>
        ) : (
          <div style={styles.welcome}>
            <div style={styles.welcomeTitle}>Welcome to DAL Builder</div>
            <p style={styles.welcomeText}>
              Create domain configurations for ADAS through guided conversation.
              Select a domain from the sidebar or create a new one to get started.
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <SettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={closeSettings}
          backendStatus={backendStatus}
        />
      )}
    </div>
  );
}
