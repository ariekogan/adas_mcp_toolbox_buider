import { useState, useEffect, useCallback } from 'react';
import ProjectList from './components/ProjectList';
import ChatPanel from './components/ChatPanel';
import ToolboxPanel from './components/ToolboxPanel';
import SettingsModal from './components/SettingsModal';
import { useProject } from './hooks/useProject';
import { useChat } from './hooks/useChat';
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
    projects,
    currentProject,
    toolbox,
    conversation,
    loading,
    loadProjects,
    createProject,
    loadProject,
    deleteProject,
    updateToolbox,
    addMessage
  } = useProject();

  const { settings, updateSettings, showModal, openSettings, closeSettings, hasApiKey } = useSettings();
  const [uiFocus, setUiFocus] = useState(null);
  const [greeting, setGreeting] = useState(null);

  const { sending, sendMessage } = useChat({
    projectId: currentProject?.id,
    onToolboxUpdate: updateToolbox,
    onMessageAdd: addMessage
  });

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load greeting
  useEffect(() => {
    api.getGreeting().then(setGreeting);
  }, []);

  // Add greeting when starting new project
  useEffect(() => {
    if (currentProject && conversation?.messages?.length === 0 && greeting) {
      addMessage({
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toISOString()
      });
    }
  }, [currentProject, conversation?.messages?.length, greeting, addMessage]);

  const handleSelectProject = useCallback(async (id) => {
    await loadProject(id);
    setUiFocus(null);
  }, [loadProject]);

  const handleCreateProject = useCallback(async (name) => {
    await createProject(name, {
      llm_provider: settings.llm_provider
    });
    setUiFocus(null);
  }, [createProject, settings.llm_provider]);

  const handleSendMessage = useCallback(async (message) => {
    await sendMessage(message, uiFocus);
  }, [sendMessage, uiFocus]);

  const handleExport = useCallback(async () => {
    if (!currentProject) return;
    try {
      const result = await api.exportProject(currentProject.id);
      alert(`Export complete! Version ${result.version}\n\nFiles:\n${result.files.map(f => f.name).join('\n')}`);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  }, [currentProject]);

  const apiConfigured = hasApiKey();

  return (
    <div style={styles.app}>
      <div style={styles.topBar}>
        <div style={styles.logo}>
          🧰 MCP Toolbox Builder
        </div>
        <div style={styles.topActions}>
          <span style={{
            ...styles.apiStatus,
            background: apiConfigured ? '#10b98120' : '#ef444420',
            color: apiConfigured ? 'var(--success)' : 'var(--error)'
          }}>
            {apiConfigured ? '✓ API Key Set' : '⚠ No API Key'}
          </span>
          <button style={styles.settingsBtn} onClick={openSettings}>
            ⚙️ Settings
          </button>
        </div>
      </div>
      
      <div style={styles.main}>
        <ProjectList
          projects={projects}
          currentId={currentProject?.id}
          onSelect={handleSelectProject}
          onCreate={handleCreateProject}
          onDelete={deleteProject}
          loading={loading}
        />
        
        {currentProject ? (
          <div style={styles.mainContent}>
            <ChatPanel
              messages={conversation?.messages || []}
              onSendMessage={handleSendMessage}
              sending={sending}
              projectName={currentProject.name}
            />
            <ToolboxPanel
              toolbox={toolbox}
              focus={uiFocus}
              onFocusChange={setUiFocus}
              onExport={handleExport}
            />
          </div>
        ) : (
          <div style={styles.welcome}>
            <div style={styles.welcomeTitle}>Welcome to MCP Toolbox Builder</div>
            <p style={styles.welcomeText}>
              Create custom AI tools through guided conversation.
              Select a project from the sidebar or create a new one to get started.
            </p>
          </div>
        )}
      </div>
      
      {showModal && (
        <SettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}
