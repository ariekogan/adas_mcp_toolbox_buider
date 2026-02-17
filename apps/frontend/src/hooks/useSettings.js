import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/client';

const STORAGE_KEY = 'mcp_toolbox_settings';

const DEFAULT_SETTINGS = {
  llm_provider: 'openai', // Default to OpenAI
  anthropic_api_key: '',
  openai_api_key: '',
  anthropic_model: 'claude-sonnet-4-20250514',
  openai_model: 'gpt-5.2'
};

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [showModal, setShowModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ hasApiKey: false, llmProvider: null });

  // Check backend health for API key status
  useEffect(() => {
    api.checkHealth()
      .then(health => {
        setBackendStatus({
          hasApiKey: health.hasApiKey || false,
          llmProvider: health.llmProvider || 'anthropic'
        });
        // Only sync if local provider not set
        if (health.llmProvider && !settings.llm_provider) {
          setSettings(prev => ({ ...prev, llm_provider: health.llmProvider }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const openSettings = useCallback(() => setShowModal(true), []);
  const closeSettings = useCallback(() => setShowModal(false), []);

  const getActiveApiKey = useCallback(() => {
    if (settings.llm_provider === 'anthropic') {
      return settings.anthropic_api_key;
    }
    return settings.openai_api_key;
  }, [settings]);

  const hasApiKey = useCallback(() => {
    // Check backend status first (server-side keys), then local storage
    return backendStatus.hasApiKey || !!getActiveApiKey();
  }, [backendStatus.hasApiKey, getActiveApiKey]);

  return {
    settings,
    updateSettings,
    showModal,
    openSettings,
    closeSettings,
    getActiveApiKey,
    hasApiKey,
    backendStatus
  };
}

export default useSettings;
