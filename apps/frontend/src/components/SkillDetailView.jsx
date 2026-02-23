/**
 * SkillDetailView — Vertical tab sidebar + SkillPanel content
 * Wraps SkillPanel with external tab control via VerticalTabBar
 */
import React, { useState, useEffect, useCallback } from 'react';
import VerticalTabBar from './VerticalTabBar';
import SkillPanel from './SkillPanel';

// Re-export getTabBadge logic for VerticalTabBar badges
// (duplicated from SkillPanel's internal function — kept in sync)
const badgeGreen = { background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
const badgeYellow = { background: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
const badgeRed = { background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
const badgeGray = { background: 'rgba(107, 114, 128, 0.2)', color: '#6b7280' };

function getBadgeStyle(current, total, minRequired = 1) {
  if (total === 0) return badgeGray;
  const ratio = current / total;
  if (ratio >= 1) return badgeGreen;
  if (current >= minRequired) return badgeYellow;
  return badgeRed;
}

function getTabBadge(tabId, skill) {
  if (!skill) return null;
  switch (tabId) {
    case 'identity': {
      let count = 0;
      if (skill.problem?.statement?.length >= 10) count++;
      if (skill.scenarios?.length >= 1) count++;
      if (skill.role?.name && skill.role?.persona) count++;
      return { text: `${count}/3`, style: getBadgeStyle(count, 3, 2) };
    }
    case 'intents': {
      const intents = skill.intents?.supported || [];
      if (intents.length === 0) return { text: '0', style: badgeGray };
      const withExamples = intents.filter(i => i.examples?.length > 0).length;
      return { text: `${withExamples}/${intents.length}`, style: getBadgeStyle(withExamples, intents.length, 1) };
    }
    case 'tools': {
      const tools = skill.tools || [];
      if (tools.length === 0) return { text: '0', style: badgeGray };
      const defined = tools.filter(t => t.name && t.description && t.output?.description).length;
      return { text: `${defined}/${tools.length}`, style: getBadgeStyle(defined, tools.length * 2, tools.length) };
    }
    case 'policy': {
      const total = (skill.policy?.guardrails?.never?.length || 0) + (skill.policy?.guardrails?.always?.length || 0);
      if (total === 0) return { text: '0', style: badgeGray };
      return { text: `${total}`, style: getBadgeStyle(total, 2, 1) };
    }
    case 'security': {
      const tools = skill.tools || [];
      if (tools.length === 0) return { text: '—', style: badgeGray };
      const classified = tools.filter(t => t.security?.classification).length;
      if (classified === 0) return { text: '0/' + tools.length, style: badgeGray };
      if (classified < tools.length) return { text: classified + '/' + tools.length, style: badgeYellow };
      return { text: classified + '/' + tools.length, style: badgeGreen };
    }
    case 'engine':
      return { text: '✓', style: badgeGreen };
    case 'triggers': {
      const triggers = skill.triggers || [];
      if (triggers.length === 0) return { text: '0', style: badgeGray };
      const enabled = triggers.filter(t => t.enabled).length;
      return { text: `${enabled}/${triggers.length}`, style: enabled > 0 ? badgeGreen : badgeYellow };
    }
    default:
      return null;
  }
}

export default function SkillDetailView({
  skill,
  solutionId,
  focus,
  onFocusChange,
  onGoHome,
  onGoVoice,
  onExport,
  onAskAbout,
  onIssuesChange,
  onSkillUpdate,
  skillId,
}) {
  const [activeTab, setActiveTab] = useState('identity');

  // Sync from external focus
  useEffect(() => {
    if (focus?.tab) {
      setActiveTab(focus.tab);
    }
  }, [focus]);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    onFocusChange?.({ tab: tabId });
  }, [onFocusChange]);

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      <VerticalTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onGoHome={onGoHome}
        onGoVoice={onGoVoice}
        getTabBadge={getTabBadge}
        skill={skill}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SkillPanel
          skill={skill}
          solutionId={solutionId}
          focus={{ tab: activeTab, section: focus?.section }}
          onFocusChange={(f) => {
            if (f?.tab) setActiveTab(f.tab);
            onFocusChange?.(f);
          }}
          onExport={onExport}
          onAskAbout={onAskAbout}
          onIssuesChange={onIssuesChange}
          onSkillUpdate={onSkillUpdate}
          skillId={skillId}
          hideTabBar
        />
      </div>
    </div>
  );
}
