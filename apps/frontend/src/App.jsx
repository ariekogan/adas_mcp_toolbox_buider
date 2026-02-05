import { useState, useEffect, useCallback } from 'react';
import SkillList from './components/SkillList';
import ChatPanel from './components/ChatPanel';
import SkillPanel from './components/SkillPanel';
import SettingsModal from './components/SettingsModal';
import ExtractionReviewModal from './components/ExtractionReviewModal';
import ExportModal from './components/ExportModal';
import ConnectorsPage from './components/ConnectorsPage';
import TenantChannelsPage from './components/TenantChannelsPage';
import PoliciesPage from './components/PoliciesPage';
import SolutionPanel from './components/SolutionPanel';
import ResizableSplit from './components/ResizableSplit';
import { useSkill } from './hooks/useSkill';
import { useSolution } from './hooks/useSolution';
import { useSettings } from './hooks/useSettings';
import * as api from './api/client';
import { getTenant, setTenant, VALID_TENANTS } from './api/client';
// Force rebuild - triggers and channels update + solution builder

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
  gearBtnWrap: {
    position: 'relative'
  },
  gearBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1
  },
  gearBtnActive: {
    borderColor: 'var(--accent)',
    color: 'var(--accent)'
  },
  gearMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '6px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    minWidth: '220px',
    zIndex: 100,
    overflow: 'hidden'
  },
  gearMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left'
  },
  gearMenuItemActive: {
    background: 'var(--accent)',
    color: 'white'
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
    skills,
    currentSkill,
    loading,
    loadSkills,
    createSkill,
    loadSkill,
    deleteSkill,
    updateSkill,
    addMessage
  } = useSkill();

  const {
    solutions,
    currentSolution,
    loading: solutionLoading,
    loadSolutions,
    createSolution: createSol,
    loadSolution,
    deleteSolution,
    updateSolution,
    addMessage: addSolutionMessage,
  } = useSolution();

  const { settings, updateSettings, showModal, openSettings, closeSettings, hasApiKey, backendStatus } = useSettings();
  const [uiFocus, setUiFocus] = useState(null);
  const [greetingData, setGreetingData] = useState(null);
  const [solutionGreetingData, setSolutionGreetingData] = useState(null);
  const [sending, setSending] = useState(false);
  const [inputHint, setInputHint] = useState(null);
  // Track whether user selected a skill or solution
  const [selectedType, setSelectedType] = useState('skill'); // 'skill' | 'solution'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // File upload extraction state
  const [extraction, setExtraction] = useState(null);
  const [extractionFileInfo, setExtractionFileInfo] = useState(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);

  // Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Navigation state - 'skills', 'connectors', 'channels'
  const [currentView, setCurrentView] = useState('skills');
  const [gearMenuOpen, setGearMenuOpen] = useState(false);

  // Tenant state
  const [tenant, setTenantState] = useState(getTenant());
  const handleTenantChange = useCallback((e) => {
    const newTenant = e.target.value;
    setTenant(newTenant);
    setTenantState(newTenant);
    // Reload skills and solutions for the new tenant
    loadSkills();
    loadSolutions();
  }, [loadSkills, loadSolutions]);

  const messages = currentSkill?.conversation || [];
  const solutionMessages = currentSolution?.conversation || [];

  useEffect(() => {
    loadSkills();
    loadSolutions();
  }, [loadSkills, loadSolutions]);

  useEffect(() => {
    api.getSkillGreeting().then(setGreetingData).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentSkill && currentSkill.conversation?.length === 0 && greetingData) {
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: greetingData.message,
        timestamp: new Date().toISOString(),
        input_hint: greetingData.inputHint
      });
      // Set input hint from greeting
      setInputHint(greetingData.inputHint);
    }
  }, [currentSkill, greetingData, addMessage]);

  // Solution greeting effect - auto-show greeting when solution has empty conversation
  useEffect(() => {
    if (currentSolution && currentSolution.conversation?.length === 0 && solutionGreetingData) {
      addSolutionMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: solutionGreetingData.message,
        timestamp: new Date().toISOString(),
        input_hint: solutionGreetingData.inputHint
      });
      setInputHint(solutionGreetingData.inputHint);
    }
  }, [currentSolution, solutionGreetingData, addSolutionMessage]);

  // Update inputHint when messages change (use last assistant message's hint)
  useEffect(() => {
    const activeMessages = selectedType === 'solution' ? solutionMessages : messages;
    if (activeMessages.length > 0) {
      const lastAssistant = [...activeMessages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant?.input_hint) {
        setInputHint(lastAssistant.input_hint);
      }
    }
  }, [messages, solutionMessages, selectedType]);

  const handleSelect = useCallback(async (id) => {
    setUiFocus(null);
    setSelectedType('skill');
    await loadSkill(id);
  }, [loadSkill]);

  const handleSelectSolution = useCallback(async (id) => {
    setUiFocus(null);
    setSelectedType('solution');
    setInputHint(null);
    await loadSolution(id);
    // Load greeting for solution if conversation is empty
    if (!solutionGreetingData) {
      api.getSolutionGreeting(id).then(setSolutionGreetingData).catch(() => {});
    }
  }, [loadSolution, solutionGreetingData]);

  const handleCreateSolution = useCallback(async (name) => {
    setSelectedType('solution');
    await createSol(name);
  }, [createSol]);

  const handleCreate = useCallback(async (name, templateId = null) => {
    setUiFocus(null);
    setSelectedType('skill');
    await createSkill(name, { llm_provider: settings.llm_provider }, templateId);
  }, [createSkill, settings.llm_provider]);

  const handleSendMessage = useCallback(async (message) => {
    if (!currentSkill) return;

    // Clear input hint while sending
    setInputHint(null);

    addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    setSending(true);
    try {
      const response = await api.sendSkillMessage(currentSkill.id, message, uiFocus);
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        state_update: response.state_update,
        suggested_focus: response.suggested_focus,
        input_hint: response.input_hint
      });
      // Update input hint from response
      setInputHint(response.input_hint || null);
      if (response.skill) {
        updateSkill(response.skill);
      }
    } catch (err) {
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString()
      });
      setInputHint(null);
    } finally {
      setSending(false);
    }
  }, [currentSkill, uiFocus, addMessage, updateSkill]);

  const handleSendSolutionMessage = useCallback(async (message) => {
    if (!currentSolution) return;

    // Clear input hint while sending
    setInputHint(null);

    addSolutionMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    setSending(true);
    try {
      const response = await api.sendSolutionMessage(currentSolution.id, message);
      addSolutionMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        state_update: response.state_update,
        suggested_focus: response.suggested_focus,
        input_hint: response.input_hint
      });
      setInputHint(response.input_hint || null);
      if (response.solution) {
        updateSolution(response.solution);
      }
    } catch (err) {
      addSolutionMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString()
      });
      setInputHint(null);
    } finally {
      setSending(false);
    }
  }, [currentSolution, addSolutionMessage, updateSolution]);

  const handleExport = useCallback(() => {
    if (!currentSkill) return;
    setExportModalOpen(true);
  }, [currentSkill]);

  const handleExportFiles = useCallback(async () => {
    if (!currentSkill) return [];
    const result = await api.previewAdasExport(currentSkill.id);
    return result.files;
  }, [currentSkill]);

  const handleDeployToAdas = useCallback(async () => {
    if (!currentSkill) return null;
    return api.deployToAdas(currentSkill.id);
  }, [currentSkill]);

  // File upload handlers
  const handleFileUpload = useCallback(async (file) => {
    if (!currentSkill) return;

    setSending(true);
    try {
      const result = await api.digestFile(currentSkill.id, file);
      setExtraction(result.extraction);
      setExtractionFileInfo(result.file_info);
    } catch (err) {
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error processing file: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSending(false);
    }
  }, [currentSkill, addMessage]);

  const handleApplyExtraction = useCallback(async (filteredExtraction) => {
    if (!currentSkill) return;

    setApplyingExtraction(true);
    try {
      const result = await api.applyExtraction(currentSkill.id, filteredExtraction);
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: result.message || 'Extraction applied successfully!',
        timestamp: new Date().toISOString()
      });
      if (result.skill) {
        updateSkill(result.skill);
      }
      setExtraction(null);
      setExtractionFileInfo(null);
    } catch (err) {
      addMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error applying extraction: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setApplyingExtraction(false);
    }
  }, [currentSkill, addMessage, updateSkill]);

  const handleCancelExtraction = useCallback(() => {
    setExtraction(null);
    setExtractionFileInfo(null);
  }, []);

  const apiConfigured = hasApiKey();

  return (
    <div style={styles.app}>
      <div style={styles.topBar}>
        <div style={styles.logo}>
          Skill Builder
          <select
            value={tenant}
            onChange={handleTenantChange}
            style={{
              marginLeft: '12px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: '500',
              background: tenant === 'main' ? 'rgba(16,185,129,0.15)' : tenant === 'testing' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
              color: tenant === 'main' ? '#10b981' : tenant === 'testing' ? '#3b82f6' : '#f59e0b',
              border: `1px solid ${tenant === 'main' ? 'rgba(16,185,129,0.3)' : tenant === 'testing' ? 'rgba(59,130,246,0.3)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {VALID_TENANTS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
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
          <div style={styles.gearBtnWrap}>
            <button
              style={{
                ...styles.gearBtn,
                ...(gearMenuOpen || currentView !== 'skills' ? styles.gearBtnActive : {})
              }}
              onClick={() => setGearMenuOpen(prev => !prev)}
              title="Administration"
            >
              &#9881;
            </button>
            {gearMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                  onClick={() => setGearMenuOpen(false)}
                />
                <div style={styles.gearMenu}>
                  <button
                    style={{
                      ...styles.gearMenuItem,
                      ...(currentView === 'connectors' ? styles.gearMenuItemActive : {})
                    }}
                    onClick={() => { setCurrentView('connectors'); setGearMenuOpen(false); }}
                  >
                    MCP-Connectors
                  </button>
                  <button
                    style={{
                      ...styles.gearMenuItem,
                      ...(currentView === 'channels' ? styles.gearMenuItemActive : {})
                    }}
                    onClick={() => { setCurrentView('channels'); setGearMenuOpen(false); }}
                  >
                    Communication Channels
                  </button>
                  <button
                    style={{
                      ...styles.gearMenuItem,
                      ...(currentView === 'llm-models' ? styles.gearMenuItemActive : {})
                    }}
                    onClick={() => { setCurrentView('llm-models'); setGearMenuOpen(false); }}
                  >
                    LLM Models
                  </button>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                  <button
                    style={{
                      ...styles.gearMenuItem,
                      ...(currentView === 'policies' ? styles.gearMenuItemActive : {})
                    }}
                    onClick={() => { setCurrentView('policies'); setGearMenuOpen(false); }}
                  >
                    Policies & Retention
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={styles.main}>
        {currentView === 'channels' ? (
          <TenantChannelsPage onClose={() => setCurrentView('skills')} />
        ) : currentView === 'connectors' ? (
          <ConnectorsPage onClose={() => setCurrentView('skills')} />
        ) : currentView === 'policies' ? (
          <PoliciesPage onClose={() => setCurrentView('skills')} />
        ) : currentView === 'llm-models' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>LLM Models</div>
              <p style={{ fontSize: '14px' }}>Model configuration coming soon.</p>
              <button
                onClick={() => setCurrentView('skills')}
                style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}
              >
                Back to Skills
              </button>
            </div>
          </div>
        ) : (
          <>
            <SkillList
              skills={skills}
              currentId={currentSkill?.id}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onDelete={deleteSkill}
              loading={loading}
              solutions={solutions}
              currentSolutionId={currentSolution?.id}
              onSelectSolution={handleSelectSolution}
              onCreateSolution={handleCreateSolution}
              onDeleteSolution={deleteSolution}
              selectedType={selectedType}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            />

            {selectedType === 'solution' && currentSolution ? (
              <ResizableSplit
                initialLeftPercent={50}
                left={
                  <ChatPanel
                    messages={solutionMessages}
                    onSendMessage={handleSendSolutionMessage}
                    sending={sending}
                    skillName={currentSolution.name}
                    inputHint={inputHint}
                    skill={currentSolution}
                  />
                }
                right={
                  <SolutionPanel solution={currentSolution} sidebarSkills={skills} />
                }
              />
            ) : currentSkill ? (
              <ResizableSplit
                initialLeftPercent={50}
                left={
                  <ChatPanel
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onFileUpload={handleFileUpload}
                    sending={sending}
                    skillName={currentSkill.name}
                    inputHint={inputHint}
                    skill={currentSkill}
                    onFocusChange={setUiFocus}
                  />
                }
                right={
                  <SkillPanel
                    skill={currentSkill}
                    focus={uiFocus}
                    onFocusChange={setUiFocus}
                    onExport={handleExport}
                    onAskAbout={(topicOrPrompt, isRawPrompt) => {
                      if (isRawPrompt) {
                        handleSendMessage(topicOrPrompt);
                      } else {
                        handleSendMessage(`Tell me about the "${topicOrPrompt}" section - what's the current status, what's missing, and how can I improve it?`);
                      }
                    }}
                    onIssuesChange={(issues) => {
                      api.updateSkill(currentSkill.id, { cascading_issues: issues }).catch(err => {
                        console.error('Failed to persist validation issues:', err);
                      });
                    }}
                    onSkillUpdate={updateSkill}
                    skillId={currentSkill.id}
                  />
                }
              />
            ) : (
              <div style={styles.welcome}>
                <div style={styles.welcomeTitle}>Welcome to Skill Builder</div>
                <p style={styles.welcomeText}>
                  Create AI agent skills through guided conversation.
                  Select a skill or solution from the sidebar to get started.
                </p>
              </div>
            )}
          </>
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

      {extraction && (
        <ExtractionReviewModal
          extraction={extraction}
          fileInfo={extractionFileInfo}
          onApply={handleApplyExtraction}
          onCancel={handleCancelExtraction}
          applying={applyingExtraction}
        />
      )}

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        skillId={currentSkill?.id}
        skillName={currentSkill?.name}
        onExportFiles={handleExportFiles}
        onDeployToAdas={handleDeployToAdas}
      />
    </div>
  );
}
