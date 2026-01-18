/**
 * useSkill Hook - State management for Skills
 *
 * Handles skill CRUD operations and state updates for the Skill Builder.
 */

import { useState, useCallback } from 'react';
import * as api from '../api/client';

export function useSkill() {
  const [skills, setSkills] = useState([]);
  const [currentSkill, setCurrentSkill] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listSkills();
      setSkills(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSkill = useCallback(async (name, settings, templateId = null) => {
    setLoading(true);
    setError(null);
    try {
      const skill = await api.createSkill(name, settings, templateId);
      setCurrentSkill(skill);
      await loadSkills();
      return skill;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadSkills]);

  const loadSkill = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const skill = await api.getSkill(id);
      setCurrentSkill(skill);
      return skill;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSkill = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteSkill(id);
      if (currentSkill?.id === id) {
        setCurrentSkill(null);
      }
      await loadSkills();
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
    loading,
    error,
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
