import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/client';

const DEFAULT_SETTINGS = {
  llm_provider: 'openai',
  model_tier: 'normal' // "fast" | "normal" | "deep" — resolved by backend
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showModal, setShowModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ hasApiKey: false, llmProvider: null });
  const [loaded, setLoaded] = useState(false);

  // Load settings from backend on mount
  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => null),
      api.checkHealth().catch(() => null)
    ]).then(([serverSettings, health]) => {
      // Merge server settings
      if (serverSettings) {
        setSettings(prev => ({ ...prev, ...serverSettings }));
      }

      // Set backend status
      if (health) {
        setBackendStatus({
          hasApiKey: health.hasApiKey || false,
          llmProvider: health.llmProvider || 'openai'
        });
      }

      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      // Save to backend (fire-and-forget)
      api.saveSettings({ llm_provider: next.llm_provider, model_tier: next.model_tier }).catch(() => {});
      return next;
    });
  }, []);

  const openSettings = useCallback(() => setShowModal(true), []);
  const closeSettings = useCallback(() => setShowModal(false), []);

  const hasApiKey = useCallback(() => {
    return backendStatus.hasApiKey;
  }, [backendStatus.hasApiKey]);

  return {
    settings,
    updateSettings,
    showModal,
    openSettings,
    closeSettings,
    hasApiKey,
    backendStatus,
    loaded
  };
}

export default useSettings;
