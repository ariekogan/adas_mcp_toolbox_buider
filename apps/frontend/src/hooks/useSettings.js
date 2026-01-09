import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/client';

const STORAGE_KEY = 'mcp_toolbox_settings';

const DEFAULT_SETTINGS = {
  llm_provider: 'anthropic',
  anthropic_api_key: '',
  openai_api_key: '',
  anthropic_model: 'claude-sonnet-4-20250514',
  openai_model: 'gpt-4-turbo'
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
    return !!getActiveApiKey();
  }, [getActiveApiKey]);

  return {
    settings,
    updateSettings,
    showModal,
    openSettings,
    closeSettings,
    getActiveApiKey,
    hasApiKey
  };
}

export default useSettings;
