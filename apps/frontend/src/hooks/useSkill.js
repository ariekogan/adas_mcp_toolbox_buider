/**
 * useSkill Hook - State management for Skills
 *
 * Skills are now solution-scoped. All operations require a solutionId.
 * The hook tracks the current solution and provides methods that use it.
 */

import { useState, useCallback } from 'react';
import * as api from '../api/client';

export function useSkill() {
  const [skills, setSkills] = useState([]);
  const [currentSkill, setCurrentSkill] = useState(null);
  const [currentSolutionId, setCurrentSolutionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Set the current solution context - call this when solution changes
  const setSolution = useCallback((solutionId) => {
    if (solutionId !== currentSolutionId) {
      setCurrentSolutionId(solutionId);
      setSkills([]); // Clear skills when solution changes
      setCurrentSkill(null);
    }
  }, [currentSolutionId]);

  const loadSkills = useCallback(async (solutionId) => {
    const solId = solutionId || currentSolutionId;
    console.log('[useSkill] loadSkills called with:', solId);
    if (!solId) {
      setSkills([]);
      return [];
    }

    setLoading(true);
    setError(null);
    try {
      const list = await api.listSkills(solId);
      console.log('[useSkill] API returned skills:', list.length, list.map(s => ({ id: s.id, solution_id: s.solution_id })));
      setSkills(list);
      return list;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentSolutionId]);

  const createSkill = useCallback(async (solutionId, name, settings, templateId = null) => {
    if (!solutionId) {
      throw new Error('solutionId is required to create a skill');
    }

    setLoading(true);
    setError(null);
    try {
      const skill = await api.createSkill(solutionId, name, settings, templateId);
      setCurrentSkill(skill);
      setCurrentSolutionId(solutionId);
      await loadSkills(solutionId);
      return skill;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadSkills]);

  const loadSkill = useCallback(async (solutionId, skillId) => {
    if (!solutionId) {
      throw new Error('solutionId is required to load a skill');
    }

    setLoading(true);
    setError(null);
    try {
      const skill = await api.getSkill(solutionId, skillId);
      setCurrentSkill(skill);
      setCurrentSolutionId(solutionId);
      return skill;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSkill = useCallback(async (solutionId, skillId) => {
    if (!solutionId) {
      throw new Error('solutionId is required to delete a skill');
    }

    setLoading(true);
    setError(null);
    try {
      await api.deleteSkill(solutionId, skillId);
      if (currentSkill?.id === skillId) {
        setCurrentSkill(null);
      }
      await loadSkills(solutionId);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentSkill, loadSkills]);

  const updateSkill = useCallback((skill) => {
    setCurrentSkill(skill);
  }, []);

  const addMessage = useCallback((message) => {
    setCurrentSkill(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        conversation: [...(prev.conversation || []), message]
      };
    });
  }, []);

  const closeSkill = useCallback(() => {
    setCurrentSkill(null);
  }, []);

  return {
    skills,
    currentSkill,
    currentSolutionId,
    loading,
    error,
    setSolution,
    loadSkills,
    createSkill,
    loadSkill,
    deleteSkill,
    updateSkill,
    addMessage,
    closeSkill
  };
}

export default useSkill;
