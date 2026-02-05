/**
 * useSolution Hook - State management for Solutions
 *
 * Handles solution CRUD operations and state updates for the Solution Builder.
 */

import { useState, useCallback } from 'react';
import * as api from '../api/client';

export function useSolution() {
  const [solutions, setSolutions] = useState([]);
  const [currentSolution, setCurrentSolution] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSolutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listSolutions();
      setSolutions(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSolution = useCallback(async (name) => {
    setLoading(true);
    setError(null);
    try {
      const solution = await api.createSolution(name);
      setCurrentSolution(solution);
      await loadSolutions();
      return solution;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadSolutions]);

  const loadSolution = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const solution = await api.getSolution(id);
      setCurrentSolution(solution);
      return solution;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSolution = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteSolution(id);
      if (currentSolution?.id === id) {
        setCurrentSolution(null);
      }
      await loadSolutions();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentSolution, loadSolutions]);

  const updateSolution = useCallback((solution) => {
    setCurrentSolution(solution);
  }, []);

  const addMessage = useCallback((message) => {
    setCurrentSolution(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        conversation: [...(prev.conversation || []), message]
      };
    });
  }, []);

  const closeSolution = useCallback(() => {
    setCurrentSolution(null);
  }, []);

  return {
    solutions,
    currentSolution,
    loading,
    error,
    loadSolutions,
    createSolution,
    loadSolution,
    deleteSolution,
    updateSolution,
    addMessage,
    closeSolution
  };
}

export default useSolution;
