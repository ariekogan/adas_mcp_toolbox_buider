/**
 * useValidation Hook - Cascading validation state management
 *
 * Manages validation issues that arise when skill components change,
 * allowing background validation to suggest improvements and detect blockers.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { runValidation, isIssueStillRelevant, VALIDATION_SEVERITY } from '../services/validationEngine';

/**
 * @param {Object} skill - The skill/domain object
 * @param {Function} onIssuesChange - Callback when issues change (for persistence)
 */
export function useValidation(skill, onIssuesChange) {
  // Initialize from skill's persisted cascading_issues or empty array
  const [issues, setIssues] = useState([]);
  const [lastRunTimestamp, setLastRunTimestamp] = useState(null);
  const previousSkillRef = useRef(null);
  const lastSkillIdRef = useRef(null);
  const hasLoadedFromSkillRef = useRef(false);

  // Sync issues from skill when skill id changes (new skill loaded)
  useEffect(() => {
    if (!skill) return;

    // Only load from skill if it's a different skill or first load
    if (skill.id !== lastSkillIdRef.current) {
      lastSkillIdRef.current = skill.id;
      hasLoadedFromSkillRef.current = false;
    }

    // Load persisted issues from skill (once per skill)
    if (!hasLoadedFromSkillRef.current && skill.cascading_issues) {
      setIssues(skill.cascading_issues);
      hasLoadedFromSkillRef.current = true;
    } else if (!hasLoadedFromSkillRef.current) {
      // No persisted issues, mark as loaded
      hasLoadedFromSkillRef.current = true;
    }
  }, [skill?.id, skill?.cascading_issues]);

  // Persist issues when they change (debounced to avoid too many saves)
  const persistTimeoutRef = useRef(null);
  useEffect(() => {
    if (!onIssuesChange || !hasLoadedFromSkillRef.current) return;

    // Debounce persistence
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
    persistTimeoutRef.current = setTimeout(() => {
      onIssuesChange(issues);
    }, 500);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [issues, onIssuesChange]);

  // Add a new validation issue
  const addIssue = useCallback((issue) => {
    setIssues(prev => {
      // Avoid duplicates by checking id
      if (prev.some(i => i.id === issue.id)) {
        return prev;
      }
      return [...prev, { ...issue, status: 'new', createdAt: new Date().toISOString() }];
    });
  }, []);

  // Remove an issue by id
  const removeIssue = useCallback((issueId) => {
    setIssues(prev => prev.filter(i => i.id !== issueId));
  }, []);

  // Update issue status (new → reviewing → resolved/dismissed)
  const updateIssueStatus = useCallback((issueId, status) => {
    setIssues(prev => prev.map(i => {
      if (i.id === issueId) {
        return {
          ...i,
          status,
          ...(status === 'resolved' || status === 'dismissed'
            ? { resolvedAt: new Date().toISOString() }
            : {})
        };
      }
      return i;
    }));
  }, []);

  // Clear all issues
  const clearAll = useCallback(() => {
    setIssues([]);
  }, []);

  // Clear resolved/dismissed issues
  const clearResolved = useCallback(() => {
    setIssues(prev => prev.filter(i => i.status !== 'resolved' && i.status !== 'dismissed'));
  }, []);

  // Dismiss an issue (user chose to ignore)
  const dismissIssue = useCallback((issueId) => {
    updateIssueStatus(issueId, 'dismissed');
  }, [updateIssueStatus]);

  // Mark issue as being reviewed (user clicked to chat)
  const markReviewing = useCallback((issueId) => {
    updateIssueStatus(issueId, 'reviewing');
  }, [updateIssueStatus]);

  // Mark issue as resolved
  const resolveIssue = useCallback((issueId) => {
    updateIssueStatus(issueId, 'resolved');
  }, [updateIssueStatus]);

  // Run validation when skill changes
  useEffect(() => {
    if (!skill) return;

    const prevSkill = previousSkillRef.current;
    previousSkillRef.current = skill;

    // Always check relevance of existing issues (even on first load after issues exist)
    setIssues(prev => {
      const stillRelevant = prev.filter(issue => {
        // Keep dismissed issues as-is (user explicitly dismissed)
        if (issue.status === 'dismissed') return true;
        // Check if issue is still relevant
        return isIssueStillRelevant(issue, skill);
      });
      // Only update if something was removed
      if (stillRelevant.length !== prev.length) {
        return stillRelevant;
      }
      return prev;
    });

    // Skip adding new issues on first load (no previous state)
    if (!prevSkill) return;

    // Detect what changed
    const changes = detectChanges(prevSkill, skill);

    if (changes.length > 0) {
      // Run validation for detected changes
      const newIssues = runValidation(changes, skill);

      // Add new issues (validation engine assigns unique IDs)
      newIssues.forEach(issue => {
        addIssue(issue);
      });

      setLastRunTimestamp(new Date().toISOString());
    }
  }, [skill, addIssue]);

  // Computed values
  const activeIssues = issues.filter(i => i.status === 'new' || i.status === 'reviewing');
  const blockers = activeIssues.filter(i => i.severity === VALIDATION_SEVERITY.BLOCKER);
  const warnings = activeIssues.filter(i => i.severity === VALIDATION_SEVERITY.WARNING);
  const suggestions = activeIssues.filter(i => i.severity === VALIDATION_SEVERITY.SUGGESTION);
  const hasBlockers = blockers.length > 0;

  return {
    issues,
    activeIssues,
    blockers,
    warnings,
    suggestions,
    hasBlockers,
    lastRunTimestamp,
    addIssue,
    removeIssue,
    dismissIssue,
    markReviewing,
    resolveIssue,
    clearAll,
    clearResolved
  };
}

/**
 * Detect what changed between previous and current skill state
 */
function detectChanges(prevSkill, currentSkill) {
  const changes = [];

  // Check scenarios
  const prevScenarios = prevSkill.scenarios || [];
  const currScenarios = currentSkill.scenarios || [];

  if (currScenarios.length > prevScenarios.length) {
    const newScenario = currScenarios[currScenarios.length - 1];
    changes.push({
      type: 'scenario_added',
      item: newScenario,
      id: newScenario?.id || `scenario_${currScenarios.length}`
    });
  }

  // Check intents
  const prevIntents = prevSkill.intents?.supported || [];
  const currIntents = currentSkill.intents?.supported || [];

  if (currIntents.length > prevIntents.length) {
    const newIntent = currIntents[currIntents.length - 1];
    changes.push({
      type: 'intent_added',
      item: newIntent,
      id: newIntent?.id || `intent_${currIntents.length}`
    });
  }

  // Check for intent modifications
  currIntents.forEach((intent, idx) => {
    const prevIntent = prevIntents.find(i => i.id === intent.id);
    if (prevIntent && JSON.stringify(prevIntent) !== JSON.stringify(intent)) {
      changes.push({
        type: 'intent_modified',
        item: intent,
        id: intent.id,
        previousItem: prevIntent
      });
    }
  });

  // Check tools
  const prevTools = prevSkill.tools || [];
  const currTools = currentSkill.tools || [];

  if (currTools.length > prevTools.length) {
    const newTool = currTools[currTools.length - 1];
    changes.push({
      type: 'tool_added',
      item: newTool,
      id: newTool?.id || newTool?.name || `tool_${currTools.length}`
    });
  }

  // Check for tool modifications
  currTools.forEach((tool, idx) => {
    const prevTool = prevTools.find(t => t.id === tool.id || t.name === tool.name);
    if (prevTool && JSON.stringify(prevTool) !== JSON.stringify(tool)) {
      changes.push({
        type: 'tool_modified',
        item: tool,
        id: tool.id || tool.name,
        previousItem: prevTool
      });
    }
  });

  // Check policy
  const prevPolicy = prevSkill.policy || {};
  const currPolicy = currentSkill.policy || {};

  if (JSON.stringify(prevPolicy) !== JSON.stringify(currPolicy)) {
    changes.push({
      type: 'policy_modified',
      item: currPolicy,
      previousItem: prevPolicy
    });
  }

  return changes;
}

export default useValidation;
