import { useState, useCallback } from 'react';
import * as api from '../api/client';

export function useChat({ projectId, onToolboxUpdate, onMessageAdd }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (message, uiFocus = null) => {
    if (!projectId || !message.trim()) return null;
    
    setSending(true);
    setError(null);
    
    // Add user message immediately
    onMessageAdd?.({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await api.sendMessage(projectId, message, uiFocus);
      
      // Add assistant message
      onMessageAdd?.({
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString()
      });
      
      // Update toolbox
      if (response.toolbox) {
        onToolboxUpdate?.(response.toolbox);
      }
      
      return response;
    } catch (err) {
      setError(err.message);
      // Add error message
      onMessageAdd?.({
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString(),
        isError: true
      });
      return null;
    } finally {
      setSending(false);
    }
  }, [projectId, onToolboxUpdate, onMessageAdd]);

  const getGreeting = useCallback(async () => {
    try {
      return await api.getGreeting();
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  return {
    sending,
    error,
    sendMessage,
    getGreeting
  };
}

export default useChat;
