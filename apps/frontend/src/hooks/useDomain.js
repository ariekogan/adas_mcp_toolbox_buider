/**
 * useDomain Hook - State management for DraftDomain
 *
 * Handles domain CRUD operations and state updates for the DAL Builder.
 */

import { useState, useCallback } from 'react';
import * as api from '../api/client';

export function useDomain() {
  const [domains, setDomains] = useState([]);
  const [currentDomain, setCurrentDomain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listDomains();
      setDomains(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createDomain = useCallback(async (name, settings) => {
    setLoading(true);
    setError(null);
    try {
      const domain = await api.createDomain(name, settings);
      setCurrentDomain(domain);
      await loadDomains();
      return domain;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadDomains]);

  const loadDomain = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const domain = await api.getDomain(id);
      setCurrentDomain(domain);
      return domain;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDomain = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteDomain(id);
      if (currentDomain?.id === id) {
        setCurrentDomain(null);
      }
      await loadDomains();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentDomain, loadDomains]);

  const updateDomain = useCallback((domain) => {
    setCurrentDomain(domain);
  }, []);

  const addMessage = useCallback((message) => {
    setCurrentDomain(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        conversation: [...(prev.conversation || []), message]
      };
    });
  }, []);

  const closeDomain = useCallback(() => {
    setCurrentDomain(null);
  }, []);

  return {
    domains,
    currentDomain,
    loading,
    error,
    loadDomains,
    createDomain,
    loadDomain,
    deleteDomain,
    updateDomain,
    addMessage,
    closeDomain
  };
}

export default useDomain;
