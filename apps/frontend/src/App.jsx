import { useState, useEffect, useCallback, useMemo } from 'react';
import SkillList from './components/SkillList';
import ChatPanel from './components/ChatPanel';
import SkillPanel from './components/SkillPanel';
import SettingsModal from './components/SettingsModal';
import ExtractionReviewModal from './components/ExtractionReviewModal';
import ExportModal from './components/ExportModal';
import ConnectorsPage from './components/ConnectorsPage';
import TenantChannelsPage from './components/TenantChannelsPage';
import PoliciesPage from './components/PoliciesPage';
import AgentApiModal from './components/AgentApiModal';
import SolutionPanel from './components/SolutionPanel';
import ResizableSplit from './components/ResizableSplit';
import MapWorkspace from './components/MapWorkspace';
import FloatingChat from './components/FloatingChat';
import SkillDetailView from './components/SkillDetailView';
import { useSkill } from './hooks/useSkill';
import { useSolution } from './hooks/useSolution';
import { useSettings } from './hooks/useSettings';
import * as api from './api/client';
import { getTenant, setTenant, fetchTenants, isAuthenticated, isEmbedded, redirectToLogin, logout } from './api/client';

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
    currentSolutionId,
    loading,
    setSolution,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // View mode for solution layout: 'map' shows MapWorkspace, 'skill' shows SkillDetailView
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'skill'

  // File upload extraction state
  const [extraction, setExtraction] = useState(null);
  const [extractionFileInfo, setExtractionFileInfo] = useState(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);

  // Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Agent API modal — auto-open if ?show=api-key is in the URL
  const [showAgentApiModal, setShowAgentApiModal] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('show') === 'api-key';
  });

  // Context indicator state - shows what panel/tab the chat is aware of
  const [contextLabel, setContextLabel] = useState(null);
  // Reference to control panel navigation from chat side
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // Navigation state - 'skills', 'connectors', 'channels'
  const [currentView, setCurrentView] = useState('skills');
  const [gearMenuOpen, setGearMenuOpen] = useState(false);

  // Tenant state
  const [tenant, setTenantState] = useState(getTenant());
  const [tenants, setTenants] = useState([{ id: getTenant(), name: getTenant() }]);
  useEffect(() => { fetchTenants().then(setTenants); }, []);
  const handleTenantChange = useCallback((e) => {
    const newTenant = e.target.value;
    setTenant(newTenant);
    setTenantState(newTenant);
    // Reload solutions for the new tenant (skills will load when solution selected)
    loadSolutions();
  }, [loadSolutions]);

  const messages = currentSkill?.conversation || [];
  const solutionMessages = currentSolution?.conversation || [];

  // ── Context indicator mappings ──────────────────────────────
  // Maps tab/panel IDs → display labels
  const CONTEXT_LABELS = useMemo(() => ({
    // Skill panel tabs
    identity: 'Identity',
    intents: 'Intents',
    tools: 'Tools',
    connectors: 'Connectors',
    policy: 'Policy',
    security: 'Security',
    engine: 'Engine',
    triggers: 'Triggers',
    // Skill sub-sections
    problem: 'Problem',
    scenarios: 'Scenarios',
    role: 'Role',
    mocks: 'Mocks',
    // Solution panel tabs (lowercase for backend suggested_focus)
    overview: 'Overview',
    'users-roles': 'Users & Roles',
    'team-map': 'Team Map',
    architecture: 'Architecture',
    'trust-rules': 'Trust Rules',
    // Solution panel tabs (title-case as used by SolutionPanel component)
    'Overview': 'Overview',
    'Users & Roles': 'Users & Roles',
    'Team Map': 'Team Map',
    'Architecture': 'Architecture',
    'Trust Rules': 'Trust Rules',
  }), []);

  // Maps label → focus object for navigation
  const LABEL_TO_FOCUS = useMemo(() => ({
    'Users & Roles': { tab: 'Users & Roles' },
    'Identity': { tab: 'Users & Roles' }, // backward compat: old suggested_focus
    'Problem': { tab: 'identity', section: 'problem' },
    'Scenarios': { tab: 'identity', section: 'scenarios' },
    'Role': { tab: 'identity', section: 'role' },
    'Intents': { tab: 'intents' },
    'Tools': { tab: 'tools' },
    'Mocks': { tab: 'tools', section: 'mocks' },
    'Connectors': { tab: 'connectors' },
    'Policy': { tab: 'policy' },
    'Security': { tab: 'security' },
    'Engine': { tab: 'engine' },
    'Triggers': { tab: 'triggers' },
    // Solution tabs
    'Overview': { tab: 'Overview' },
    'Team Map': { tab: 'Team Map' },
    'Architecture': { tab: 'Architecture' },
    'Trust Rules': { tab: 'Trust Rules' },
  }), []);

  // Keywords in user input that hint at a context
  const INPUT_CONTEXT_PATTERNS = useMemo(() => [
    { pattern: /\b(problem|problem statement|what.*problem)\b/i, label: 'Problem' },
    { pattern: /\b(scenario|scenarios|use.?case|example)\b/i, label: 'Scenarios' },
    { pattern: /\b(role|persona|who.*agent|agent.*personality)\b/i, label: 'Role' },
    { pattern: /\b(intent|intents|user.*wants|what.*can.*do)\b/i, label: 'Intents' },
    { pattern: /\b(tool|tools|api|function|capability)\b/i, label: 'Tools' },
    { pattern: /\b(mock|test.*tool|simulate)\b/i, label: 'Mocks' },
    { pattern: /\b(policy|guardrail|rule|constraint|never|always)\b/i, label: 'Policy' },
    { pattern: /\b(security|auth|permission|access.*control)\b/i, label: 'Security' },
    { pattern: /\b(engine|model|llm|temperature)\b/i, label: 'Engine' },
    { pattern: /\b(trigger|email|webhook|schedule|cron)\b/i, label: 'Triggers' },
    { pattern: /\b(connector|mcp|external.*service)\b/i, label: 'Connectors' },
    { pattern: /\b(identity|actor|user.*type|users.*roles)\b/i, label: 'Users & Roles' },
    { pattern: /\b(handoff|routing|team.?map|topology)\b/i, label: 'Team Map' },
    { pattern: /\b(architecture|diagram|overview)\b/i, label: 'Architecture' },
    { pattern: /\b(trust|grant|contract|verification)\b/i, label: 'Trust Rules' },
  ], []);

  // Sync context label when uiFocus changes (user clicked something in panel)
  useEffect(() => {
    if (uiFocus?.tab) {
      const label = CONTEXT_LABELS[uiFocus.tab] ||
        (uiFocus.section ? CONTEXT_LABELS[uiFocus.section] : null);
      if (label) setContextLabel(label);
    }
  }, [uiFocus, CONTEXT_LABELS]);

  // Navigate panel when pendingNavigation is set
  useEffect(() => {
    if (pendingNavigation) {
      setUiFocus(pendingNavigation);
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  // Detect context from user input and auto-set label
  const detectContextFromInput = useCallback((text) => {
    for (const { pattern, label } of INPUT_CONTEXT_PATTERNS) {
      if (pattern.test(text)) {
        setContextLabel(label);
        // Also navigate the panel to match
        const focus = LABEL_TO_FOCUS[label];
        if (focus) setPendingNavigation(focus);
        return;
      }
    }
  }, [INPUT_CONTEXT_PATTERNS, LABEL_TO_FOCUS]);

  // Handle context badge click → navigate to the panel tab
  const handleContextClick = useCallback(() => {
    if (contextLabel) {
      const focus = LABEL_TO_FOCUS[contextLabel];
      if (focus) setPendingNavigation(focus);
    }
  }, [contextLabel, LABEL_TO_FOCUS]);

  // Clear context
  const handleContextClear = useCallback(() => {
    setContextLabel(null);
  }, []);

  // Load solutions on mount
  useEffect(() => {
    loadSolutions();
  }, [loadSolutions]);

  // Load skills when solution changes
  useEffect(() => {
    if (currentSolution?.id) {
      setSolution(currentSolution.id);
      loadSkills(currentSolution.id);
    }
  }, [currentSolution?.id, setSolution, loadSkills]);

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
    setContextLabel(null);
    setSelectedType('skill');
    setViewMode('skill');
    if (!currentSolution?.id) {
      console.error('Cannot select skill without a solution');
      return;
    }
    await loadSkill(currentSolution.id, id);
  }, [loadSkill, currentSolution?.id]);

  const handleSelectSolution = useCallback(async (id) => {
    setUiFocus(null);
    setContextLabel(null);
    setSelectedType('solution');
    setViewMode('map');
    setInputHint(null);
    setSolutionGreetingData(null); // Reset — greeting is per-solution
    await loadSolution(id);
    // Always fetch greeting fresh — it's now solution-state-aware
    api.getSolutionGreeting(id).then(setSolutionGreetingData).catch(() => {});
  }, [loadSolution]);

  const handleCreateSolution = useCallback(async (name) => {
    setSelectedType('solution');
    await createSol(name);
  }, [createSol]);

  const handleCreate = useCallback(async (name, templateId = null) => {
    setUiFocus(null);
    setSelectedType('skill');
    if (!currentSolution?.id) {
      console.error('Cannot create skill without a solution');
      return;
    }
    await createSkill(currentSolution.id, name, { llm_provider: settings.llm_provider }, templateId);
  }, [createSkill, settings.llm_provider, currentSolution?.id]);

  const handleSendMessage = useCallback(async (message) => {
    if (!currentSkill || !currentSolution?.id) return;

    // Detect context from user input
    detectContextFromInput(message);

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
      const llmSettings = {
        llm_provider: settings.llm_provider,
        llm_model: settings.model_tier || 'normal'
      };
      const response = await api.sendSkillMessage(currentSolution.id, currentSkill.id, message, uiFocus, llmSettings);
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
      // Update context indicator from suggested_focus
      if (response.suggested_focus) {
        const focusKey = response.suggested_focus.tab || response.suggested_focus.panel;
        if (focusKey) {
          const label = CONTEXT_LABELS[focusKey.toLowerCase()];
          if (label) {
            setContextLabel(label);
            const focus = LABEL_TO_FOCUS[label];
            if (focus) setPendingNavigation(focus);
          }
        }
      }
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
  }, [currentSkill, currentSolution?.id, uiFocus, addMessage, updateSkill, detectContextFromInput, CONTEXT_LABELS, LABEL_TO_FOCUS, settings]);

  const handleSendSolutionMessage = useCallback(async (message) => {
    if (!currentSolution) return;

    // Detect context from user input
    detectContextFromInput(message);

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
      const llmSettings = {
        llm_provider: settings.llm_provider,
        llm_model: settings.model_tier || 'normal'
      };
      const response = await api.sendSolutionMessage(currentSolution.id, message, llmSettings);
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
      // Update context indicator from suggested_focus
      if (response.suggested_focus) {
        const focusKey = response.suggested_focus.tab || response.suggested_focus.panel;
        if (focusKey) {
          const label = CONTEXT_LABELS[focusKey.toLowerCase()];
          if (label) {
            setContextLabel(label);
            const focus = LABEL_TO_FOCUS[label];
            if (focus) setPendingNavigation(focus);
          }
        }
      }
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
  }, [currentSolution, addSolutionMessage, updateSolution, detectContextFromInput, CONTEXT_LABELS, LABEL_TO_FOCUS, settings]);

  const handleSimplifyMessage = useCallback(async (content) => {
    const llmSettings = {
      llm_provider: settings.llm_provider,
      llm_model: 'fast'
    };
    return api.simplifyMessage(content, llmSettings);
  }, [settings.llm_provider]);

  const handleExport = useCallback(() => {
    if (!currentSkill) return;
    setExportModalOpen(true);
  }, [currentSkill]);

  const handleExportFiles = useCallback(async () => {
    if (!currentSkill || !currentSolution?.id) return [];
    const result = await api.previewAdasExport(currentSolution.id, currentSkill.id);
    return result.files;
  }, [currentSkill, currentSolution?.id]);

  const handleDeployToAdas = useCallback(async () => {
    if (!currentSkill || !currentSolution?.id) return null;
    return api.deployToAdas(currentSolution.id, currentSkill.id);
  }, [currentSkill, currentSolution?.id]);

  const handleDownloadGenericTemplate = useCallback(async () => {
    try {
      const result = await api.downloadGenericMCPTemplate();
      if (result.files) {
        result.files.forEach((file, index) => {
          setTimeout(() => {
            const blob = new Blob([file.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, index * 150);
        });
      }
    } catch (err) {
      console.error('Failed to download generic template:', err);
    }
  }, []);

  // File upload handlers
  const handleFileUpload = useCallback(async (file) => {
    if (!currentSkill || !currentSolution?.id) return;

    setSending(true);
    try {
      const result = await api.digestFile(currentSolution.id, currentSkill.id, file);
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
  }, [currentSkill, currentSolution?.id, addMessage]);

  const handleApplyExtraction = useCallback(async (filteredExtraction) => {
    if (!currentSkill || !currentSolution?.id) return;

    setApplyingExtraction(true);
    try {
      const result = await api.applyExtraction(currentSolution.id, currentSkill.id, filteredExtraction);
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
  }, [currentSkill, currentSolution?.id, addMessage, updateSkill]);

  const handleCancelExtraction = useCallback(() => {
    setExtraction(null);
    setExtractionFileInfo(null);
  }, []);

  const apiConfigured = hasApiKey();
  const embedded = isEmbedded();

  // Auth gate: require authentication for protected flows and standalone mode
  if (!isAuthenticated()) {
    // If ?show=api-key — this is an agent sending a user to get their key.
    // Auto-redirect to login immediately (redirectToLogin preserves the full URL).
    if (showAgentApiModal) {
      redirectToLogin();
      return null;
    }
    // Standalone mode (not in iframe): show login screen
    if (!isEmbedded()) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', gap: '24px'
        }}>
          <div style={{ fontSize: '28px', fontWeight: '700' }}>A-Team</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', maxWidth: '360px' }}>
            Sign in to access your AI agent skills and solutions.
          </div>
          <button
            onClick={redirectToLogin}
            style={{
              padding: '10px 24px', fontSize: '14px', fontWeight: '600',
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            Sign in with Google
          </button>
        </div>
      );
    }
  }

  return (
    <div style={styles.app}>
      {!embedded && (
        <div style={styles.topBar}>
          <div style={styles.logo}>
            A-Team
            {currentSolution && (
              <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '13px' }}>
                — {currentSolution.name}
              </span>
            )}
            <select
              value={tenant}
              onChange={handleTenantChange}
              style={(() => {
                const KNOWN = { main: '#10b981', testing: '#3b82f6', dev: '#f59e0b' };
                const PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                const idx = tenants.findIndex(t => t.id === tenant);
                const c = KNOWN[tenant] || PALETTE[idx % PALETTE.length] || '#8b949e';
                return {
                  marginLeft: '12px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: '500',
                  background: `${c}20`,
                  color: c,
                  border: `1px solid ${c}50`,
                  borderRadius: '4px',
                  cursor: 'pointer'
                };
              })()}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name || t.id}</option>
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
                    <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                    <button
                      style={styles.gearMenuItem}
                      onClick={() => { handleDownloadGenericTemplate(); setGearMenuOpen(false); }}
                    >
                      Download MCP Template
                    </button>
                    <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                    <button
                      style={styles.gearMenuItem}
                      onClick={() => { setShowAgentApiModal(true); setGearMenuOpen(false); }}
                    >
                      Agent API
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
              onDelete={(skillId) => currentSolution?.id && deleteSkill(currentSolution.id, skillId)}
              loading={loading}
              solutions={solutions}
              currentSolutionId={currentSolution?.id}
              onSelectSolution={handleSelectSolution}
              onCreateSolution={handleCreateSolution}
              onDeleteSolution={deleteSolution}
              selectedType={selectedType}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
              embedded={embedded}
              currentView={currentView}
              onNavigateView={setCurrentView}
              onOpenSettings={openSettings}
              onOpenAgentApi={() => setShowAgentApiModal(true)}
              onDownloadTemplate={handleDownloadGenericTemplate}
              apiConfigured={apiConfigured}
            />

            {selectedType === 'solution' && currentSolution ? (
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {viewMode === 'map' ? (
                  <MapWorkspace
                    solution={currentSolution}
                    sidebarSkills={skills}
                    onSkillClick={handleSelect}
                  />
                ) : viewMode === 'skill' && currentSkill ? (
                  <SkillDetailView
                    skill={currentSkill}
                    solutionId={currentSolution?.id}
                    focus={uiFocus}
                    onFocusChange={setUiFocus}
                    onGoHome={() => {
                      setViewMode('map');
                      setSelectedType('solution');
                    }}
                    onExport={handleExport}
                    onAskAbout={(topicOrPrompt, isRawPrompt) => {
                      if (isRawPrompt) {
                        handleSendMessage(topicOrPrompt);
                      } else {
                        handleSendMessage(`Tell me about the "${topicOrPrompt}" section - what's the current status, what's missing, and how can I improve it?`);
                      }
                    }}
                    onIssuesChange={(issues) => {
                      if (currentSolution?.id) {
                        api.updateSkill(currentSolution.id, currentSkill.id, { cascading_issues: issues }).catch(err => {
                          console.error('Failed to persist validation issues:', err);
                        });
                      }
                    }}
                    onSkillUpdate={updateSkill}
                    skillId={currentSkill?.id}
                  />
                ) : (
                  <MapWorkspace
                    solution={currentSolution}
                    sidebarSkills={skills}
                    onSkillClick={handleSelect}
                  />
                )}

                {/* Floating chat overlay */}
                <FloatingChat
                  messages={viewMode === 'skill' ? messages : solutionMessages}
                  onSendMessage={viewMode === 'skill' ? handleSendMessage : handleSendSolutionMessage}
                  onFileUpload={viewMode === 'skill' ? handleFileUpload : undefined}
                  sending={sending}
                  skillName={currentSkill?.name || ''}
                  solutionName={currentSolution.name}
                  inputHint={inputHint}
                  skill={viewMode === 'skill' ? currentSkill : currentSolution}
                  onFocusChange={setUiFocus}
                  solution={currentSolution}
                  solutionSkills={currentSolution.skills || []}
                  onSelectSkill={handleSelect}
                  currentSkillId={currentSkill?.id}
                  contextLabel={contextLabel}
                  onContextClick={handleContextClick}
                  onContextClear={handleContextClear}
                  onSimplifyMessage={handleSimplifyMessage}
                />
              </div>
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
                    contextLabel={contextLabel}
                    onContextClick={handleContextClick}
                    onContextClear={handleContextClear}
                    onSimplifyMessage={handleSimplifyMessage}
                  />
                }
                right={
                  <SkillPanel
                    skill={currentSkill}
                    solutionId={currentSolution?.id}
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
                      if (currentSolution?.id) {
                        api.updateSkill(currentSolution.id, currentSkill.id, { cascading_issues: issues }).catch(err => {
                          console.error('Failed to persist validation issues:', err);
                        });
                      }
                    }}
                    onSkillUpdate={updateSkill}
                    skillId={currentSkill.id}
                  />
                }
              />
            ) : (
              <div style={styles.welcome}>
                <div style={styles.welcomeTitle}>Welcome to A-Team</div>
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
        solutionId={currentSolution?.id}
        onExportFiles={handleExportFiles}
        onDeployToAdas={handleDeployToAdas}
      />

      {showAgentApiModal && (
        <AgentApiModal onClose={() => setShowAgentApiModal(false)} />
      )}
    </div>
  );
}
