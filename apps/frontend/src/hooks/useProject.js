import { useState, useCallback } from 'react';
import * as api from '../api/client';

export function useProject() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [toolbox, setToolbox] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProjects();
      setProjects(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createProject = useCallback(async (name, settings) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.createProject(name, settings);
      setCurrentProject(result.project);
      setToolbox(result.toolbox);
      setConversation(result.conversation);
      await loadProjects();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadProjects]);

  const loadProject = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getProject(id);
      setCurrentProject(result.project);
      setToolbox(result.toolbox);
      setConversation(result.conversation);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteProject = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteProject(id);
      if (currentProject?.id === id) {
        setCurrentProject(null);
        setToolbox(null);
        setConversation(null);
      }
      await loadProjects();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentProject, loadProjects]);

  const updateToolbox = useCallback((newToolbox) => {
    setToolbox(newToolbox);
  }, []);

  const addMessage = useCallback((message) => {
    setConversation(prev => ({
      ...prev,
      messages: [...(prev?.messages || []), message]
    }));
  }, []);

  const closeProject = useCallback(() => {
    setCurrentProject(null);
    setToolbox(null);
    setConversation(null);
  }, []);

  return {
    projects,
    currentProject,
    toolbox,
    conversation,
    loading,
    error,
    loadProjects,
    createProject,
    loadProject,
    deleteProject,
    updateToolbox,
    addMessage,
    closeProject
  };
}

export default useProject;
