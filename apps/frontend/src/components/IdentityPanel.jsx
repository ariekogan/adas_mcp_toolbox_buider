/**
 * IdentityPanel - Display Problem, Role/Persona, Scenarios, and Sender Identity
 *
 * Extracted from the Overview tab to separate identity/context info
 * from validation status.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listConnectors, listActors, findOrCreateActorForIdentity, createToken, createActor, getTenantChannels } from '../api/client';

// Debounce helper
function useDebouncedCallback(callback, delay) {
  const timeoutRef = useRef(null);

  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
}

const styles = {
  section: {
    marginBottom: '20px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: '8px 0'
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  expandIcon: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    transition: 'transform 0.2s'
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px'
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic'
  },
  field: {
    marginBottom: '12px'
  },
  fieldLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  fieldValue: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.5'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px'
  },
  tag: {
    fontSize: '11px',
    padding: '3px 8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    color: 'var(--text-secondary)'
  },
  toolDetails: {
    marginTop: '8px',
    padding: '8px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    fontSize: '12px'
  },
  infoBtn: {
    padding: '3px 10px',
    background: 'transparent',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    borderRadius: '999px',
    color: '#60a5fa',
    cursor: 'pointer',
    fontSize: '10px',
    transition: 'all 0.15s ease',
    flexShrink: 0
  },
  // Sender Identity styles
  inputGroup: {
    marginBottom: '12px'
  },
  inputLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block'
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none'
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
    minHeight: '60px',
    fontFamily: 'inherit'
  },
  actorSection: {
    marginTop: '16px',
    padding: '12px',
    background: 'linear-gradient(to right, var(--bg-secondary), rgba(var(--accent-rgb), 0.05))',
    borderRadius: '6px',
    border: '1px solid var(--border)'
  },
  actorTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  actorInfo: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '12px'
  },
  actorLinked: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    background: 'var(--bg-card)',
    borderRadius: '6px',
    border: '1px solid var(--success)',
    marginBottom: '8px'
  },
  actorNotLinked: {
    padding: '10px',
    background: 'var(--bg-card)',
    borderRadius: '6px',
    border: '1px dashed var(--border)',
    marginBottom: '8px'
  },
  actorBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    background: 'rgba(var(--success-rgb), 0.1)',
    color: 'var(--success)',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '500'
  },
  tokenDisplay: {
    fontFamily: 'monospace',
    fontSize: '12px',
    background: 'var(--bg-secondary)',
    padding: '8px 10px',
    borderRadius: '6px',
    wordBreak: 'break-all',
    marginTop: '8px'
  },
  button: {
    padding: '6px 12px',
    fontSize: '12px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '500'
  },
  buttonDanger: {
    background: 'var(--danger)'
  },
  actorActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px'
  },
  connectorSelect: {
    padding: '8px 10px',
    fontSize: '13px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    outline: 'none',
    cursor: 'pointer',
    marginBottom: '12px'
  },
  noConnector: {
    padding: '16px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px'
  }
};

// Info button component
function ExplainButton({ topic, onAskAbout }) {
  const [hovered, setHovered] = useState(false);

  if (!onAskAbout) return null;

  return (
    <button
      style={{
        ...styles.infoBtn,
        ...(hovered ? { background: 'rgba(59, 130, 246, 0.15)', borderColor: '#60a5fa' } : {})
      }}
      onClick={(e) => {
        e.stopPropagation();
        onAskAbout(topic);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Explain ${topic}`}
    >
      explain
    </button>
  );
}

export default function IdentityPanel({
  skill,
  onAskAbout,
  validateButton,
  connectorConfigs = [],
  onConnectorConfigChange,
  skillIdentity = null,
  onSkillIdentityChange
}) {
  const [expanded, setExpanded] = useState({
    skillIdentity: true,
    problem: true,
    role: true,
    scenarios: true,
    sender: false  // Collapse legacy sender section by default
  });

  // Skill Identity state
  const [localSkillIdentity, setLocalSkillIdentity] = useState(skillIdentity || {
    actor_ref: '',
    display_name: '',
    channel_identities: {
      email: { from_name: '', from_email: '', signature: '' },
      slack: { bot_name: '' },
      telegram: { parse_mode: '' }
    }
  });
  const [activatingSkillActor, setActivatingSkillActor] = useState(false);
  const [skillActorToken, setSkillActorToken] = useState(null);
  const isEditingSkillIdentityRef = useRef(false);

  // Sync skill identity from props (only when not actively editing)
  useEffect(() => {
    if (skillIdentity && !isEditingSkillIdentityRef.current) {
      setLocalSkillIdentity(skillIdentity);
    }
  }, [skillIdentity]);
  const [expandedItems, setExpandedItems] = useState({});

  // Email connector state
  const [globalConnectors, setGlobalConnectors] = useState([]);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [localIdentity, setLocalIdentity] = useState(() => {
    const identityMap = {};
    for (const config of connectorConfigs) {
      if (config.identity) {
        identityMap[config.connector_id] = { ...config.identity };
      }
    }
    return identityMap;
  });
  const isEditingRef = useRef(false);

  // Actor management state
  const [linkingActor, setLinkingActor] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState(null);

  // Inbound channels state (routes that send messages TO this skill)
  const [inboundChannels, setInboundChannels] = useState({ email: [], slack: [], telegram: [] });

  // Load global connectors and inbound channels
  useEffect(() => {
    async function load() {
      try {
        const result = await listConnectors();
        const emailConnectors = (result.connections || []).filter(c =>
          isEmailConnector(c.id)
        );
        setGlobalConnectors(emailConnectors);
        // Auto-select first email connector if available and none selected
        if (emailConnectors.length > 0 && !selectedConnector) {
          setSelectedConnector(emailConnectors[0].id);
        }
      } catch (err) {
        console.error('Failed to load connectors:', err);
      }

      // Load inbound channel routing for this skill
      if (skill?.id || skill?.name) {
        try {
          const channels = await getTenantChannels();
          // Generate slug from name (e.g., "CS:Tier-1" -> "cs-tier-1")
          const skillSlug = skill.name?.toLowerCase().replace(/[:\s]+/g, '-');
          const skillId = skill.id;

          console.log('[IdentityPanel] Matching inbound channels:', {
            skillName: skill.name,
            skillSlug,
            skillId,
            rules: channels?.email?.routing?.rules
          });

          // Match by slug OR by skill ID
          const matchesSkill = (r) =>
            r.skill_slug === skillSlug ||
            r.skill_slug === skillId ||
            r.skill_id === skillId;

          // Find email routes to this skill (API returns {email: {routing: {rules: [...]}}, slack: {...}})
          const emailRoutes = (channels?.email?.routing?.rules || [])
            .filter(matchesSkill)
            .map(r => r.address);

          // Find slack routes to this skill
          const slackRoutes = (channels?.slack?.routing?.rules || [])
            .filter(matchesSkill)
            .map(r => r.channel || r.mention);

          // Find telegram command aliases that route to this skill
          const telegramAliases = channels?.telegram?.routing?.command_aliases || {};
          const telegramRoutes = Object.entries(telegramAliases)
            .filter(([, slug]) => slug === skillSlug || slug === skillId)
            .map(([cmd]) => `/${cmd}`);

          // Also check telegram rules (chat_id, username)
          const telegramRuleRoutes = (channels?.telegram?.routing?.rules || [])
            .filter(matchesSkill)
            .map(r => r.chat_id ? `Chat ${r.chat_id}` : r.username ? `@${r.username}` : '');

          console.log('[IdentityPanel] Found routes:', { emailRoutes, slackRoutes, telegramRoutes });
          setInboundChannels({ email: emailRoutes, slack: slackRoutes, telegram: [...telegramRoutes, ...telegramRuleRoutes].filter(Boolean) });
        } catch (err) {
          console.error('Failed to load inbound channels:', err);
        }
      }
    }
    load();
  }, [skill?.id, skill?.name]);

  // Sync local identity from props when not editing
  useEffect(() => {
    if (!isEditingRef.current) {
      const identityMap = {};
      for (const config of connectorConfigs) {
        if (config.identity) {
          identityMap[config.connector_id] = { ...config.identity };
        }
      }
      setLocalIdentity(identityMap);
    }
  }, [connectorConfigs]);

  function isEmailConnector(connectorId) {
    const id = connectorId.toLowerCase();
    return id.includes('gmail') || id.includes('mail') || id.includes('email') || id.includes('smtp');
  }

  const toggleSection = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleItem = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Get local identity for selected connector
  function getLocalIdentity() {
    return selectedConnector ? (localIdentity[selectedConnector] || {}) : {};
  }

  // Save identity config to backend
  const saveIdentityConfig = useCallback((identity) => {
    if (!onConnectorConfigChange || !selectedConnector) return;

    const existingConfig = connectorConfigs.find(c => c.connector_id === selectedConnector);
    const newConfig = {
      connector_id: selectedConnector,
      identity: { ...identity }
    };

    // Remove empty values
    Object.keys(newConfig.identity).forEach(key => {
      if (!newConfig.identity[key]) {
        delete newConfig.identity[key];
      }
    });

    // Build new configs array
    const newConfigs = existingConfig
      ? connectorConfigs.map(c => c.connector_id === selectedConnector ? newConfig : c)
      : [...connectorConfigs, newConfig];

    // Remove configs with empty identity
    const filteredConfigs = newConfigs.filter(c =>
      c.identity && Object.keys(c.identity).some(k => c.identity[k])
    );

    onConnectorConfigChange(filteredConfigs);

    setTimeout(() => {
      isEditingRef.current = false;
    }, 100);
  }, [connectorConfigs, onConnectorConfigChange, selectedConnector]);

  // Debounced save
  const debouncedSave = useDebouncedCallback(saveIdentityConfig, 800);

  // Update local identity and trigger debounced save
  const handleIdentityChange = useCallback((field, value) => {
    if (!selectedConnector) return;

    isEditingRef.current = true;

    const currentIdentity = localIdentity[selectedConnector] || {};
    const updatedIdentity = { ...currentIdentity, [field]: value };

    setLocalIdentity(prev => ({
      ...prev,
      [selectedConnector]: updatedIdentity
    }));

    debouncedSave(updatedIdentity);
  }, [debouncedSave, localIdentity, selectedConnector]);

  // Activate identity (link to CORE actor)
  async function handleActivateIdentity() {
    const identity = getLocalIdentity();
    if (!identity.from_email) {
      alert('Please configure an email address first');
      return;
    }

    setLinkingActor(true);
    try {
      // Find or create actor for this identity
      const result = await findOrCreateActorForIdentity({
        provider: 'gmail',
        externalId: identity.from_email,
        displayName: identity.from_name || identity.from_email
      });

      // Generate a token for this skill
      const tokenResult = await createToken(result.actor.actorId, ['*']);

      // Update identity with actor info
      const updatedIdentity = {
        ...identity,
        actor_id: result.actor.actorId,
        actor_display_name: result.actor.displayName,
        token_prefix: tokenResult.prefix
      };

      // Show token once
      setNewlyCreatedToken({
        token: tokenResult.token,
        actorId: result.actor.actorId
      });

      // Update local state
      setLocalIdentity(prev => ({
        ...prev,
        [selectedConnector]: updatedIdentity
      }));

      // Save to backend immediately (not debounced)
      saveIdentityConfig(updatedIdentity);
    } catch (err) {
      console.error('Failed to activate identity:', err);
      alert(`Failed to activate identity: ${err.message}`);
    } finally {
      setLinkingActor(false);
    }
  }

  // Deactivate identity
  function handleDeactivateIdentity() {
    const identity = getLocalIdentity();
    const updatedIdentity = { ...identity };
    delete updatedIdentity.actor_id;
    delete updatedIdentity.actor_display_name;
    delete updatedIdentity.token_prefix;

    setLocalIdentity(prev => ({
      ...prev,
      [selectedConnector]: updatedIdentity
    }));

    saveIdentityConfig(updatedIdentity);
    setNewlyCreatedToken(null);
  }

  // ═══════════════════════════════════════════════════════════════
  // NEW: Skill Identity handlers
  // ═══════════════════════════════════════════════════════════════

  // Save skill identity to parent (debounced)
  const saveSkillIdentity = useCallback((updated) => {
    if (onSkillIdentityChange) {
      onSkillIdentityChange(updated);
    }
    setTimeout(() => {
      isEditingSkillIdentityRef.current = false;
    }, 100);
  }, [onSkillIdentityChange]);

  const debouncedSaveSkillIdentity = useDebouncedCallback(saveSkillIdentity, 800);

  // Update skill identity field - local state immediately, debounced save to parent
  const handleSkillIdentityChange = useCallback((field, value) => {
    isEditingSkillIdentityRef.current = true;

    setLocalSkillIdentity(prev => {
      const updated = { ...prev };

      if (field.includes('.')) {
        // Nested field like 'channel_identities.email.from_name'
        const parts = field.split('.');
        let current = updated;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        updated[field] = value;
      }

      // Debounce save to parent
      debouncedSaveSkillIdentity(updated);

      return updated;
    });
  }, [debouncedSaveSkillIdentity]);

  // Activate skill actor (create agent type actor in CORE)
  async function handleActivateSkillActor() {
    if (!localSkillIdentity.display_name) {
      alert('Please enter a display name for the skill identity');
      return;
    }

    setActivatingSkillActor(true);
    try {
      const skillSlug = skill.id || skill.name?.toLowerCase().replace(/\s+/g, '-') || 'skill';
      const actorRef = `agent::${skillSlug}`;

      // Create agent actor
      const actorResult = await createActor({
        actorType: 'agent',
        displayName: actorRef,
        roles: ['agent'],
        identities: [],
        status: 'active'
      });

      // Create token for the skill
      const tokenResult = await createToken(actorResult.actor.actorId, ['*']);

      // Update local state
      const updated = {
        ...localSkillIdentity,
        actor_ref: actorRef,
        actor_id: actorResult.actor.actorId,
        token_prefix: tokenResult.prefix
      };

      setLocalSkillIdentity(updated);
      setSkillActorToken({
        token: tokenResult.token,
        actorId: actorResult.actor.actorId
      });

      if (onSkillIdentityChange) {
        onSkillIdentityChange(updated);
      }
    } catch (err) {
      console.error('Failed to activate skill actor:', err);
      alert(`Failed to activate skill actor: ${err.message}`);
    } finally {
      setActivatingSkillActor(false);
    }
  }

  // Deactivate skill actor
  function handleDeactivateSkillActor() {
    const updated = { ...localSkillIdentity };
    delete updated.actor_id;
    delete updated.token_prefix;
    // Keep actor_ref as it's the logical reference

    setLocalSkillIdentity(updated);
    setSkillActorToken(null);

    if (onSkillIdentityChange) {
      onSkillIdentityChange(updated);
    }
  }

  if (!skill) {
    return <div style={styles.empty}>No skill selected</div>;
  }

  const identity = getLocalIdentity();

  return (
    <>
      {/* Section header with validate button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--border)'
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: '600',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>Identity</span>
        {validateButton}
      </div>

      {/* Skill Identity - Simple flat form */}
      <div style={styles.card}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Define how this skill identifies itself when sending messages.
        </div>

        {/* Display Name */}
        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Display Name *</label>
          <input
            type="text"
            style={styles.input}
            placeholder="e.g., CS Support Bot"
            value={localSkillIdentity.display_name || ''}
            onChange={(e) => handleSkillIdentityChange('display_name', e.target.value)}
          />
        </div>

        {/* Email Settings */}
        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Email - From Name</label>
          <input
            type="text"
            style={styles.input}
            placeholder="e.g., Customer Support"
            value={localSkillIdentity.channel_identities?.email?.from_name || ''}
            onChange={(e) => handleSkillIdentityChange('channel_identities.email.from_name', e.target.value)}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Email - From Address</label>
          <input
            type="email"
            style={styles.input}
            placeholder="e.g., support@example.com"
            value={localSkillIdentity.channel_identities?.email?.from_email || ''}
            onChange={(e) => handleSkillIdentityChange('channel_identities.email.from_email', e.target.value)}
          />
          {/* Show hint if inbound channels are configured */}
          {inboundChannels.email.length > 0 && !localSkillIdentity.channel_identities?.email?.from_email && (
            <div style={{
              marginTop: '6px',
              padding: '6px 10px',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--accent)'
            }}>
              💡 Tip: Use one of your inbound addresses: {inboundChannels.email.join(', ')}
            </div>
          )}
        </div>

        {/* Slack Settings */}
        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Slack - Bot Name</label>
          <input
            type="text"
            style={styles.input}
            placeholder="e.g., SupportBot"
            value={localSkillIdentity.channel_identities?.slack?.bot_name || ''}
            onChange={(e) => handleSkillIdentityChange('channel_identities.slack.bot_name', e.target.value)}
          />
        </div>

        {/* Telegram Settings */}
        <div style={styles.inputGroup}>
          <label style={styles.inputLabel}>Telegram - Parse Mode</label>
          <select
            style={{ ...styles.input, cursor: 'pointer' }}
            value={localSkillIdentity.channel_identities?.telegram?.parse_mode || ''}
            onChange={(e) => handleSkillIdentityChange('channel_identities.telegram.parse_mode', e.target.value)}
          >
            <option value="">None (plain text)</option>
            <option value="Markdown">Markdown</option>
            <option value="MarkdownV2">MarkdownV2</option>
            <option value="HTML">HTML</option>
          </select>
        </div>

        {/* Activation Status */}
        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: localSkillIdentity.actor_id ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-secondary)',
          borderRadius: '8px',
          border: localSkillIdentity.actor_id ? '1px solid var(--success)' : '1px solid var(--border)'
        }}>
          {localSkillIdentity.actor_id ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={styles.actorBadge}>✓ Active in CORE</span>
                {localSkillIdentity.token_prefix && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Token: {localSkillIdentity.token_prefix}...
                  </div>
                )}
              </div>
              <button
                style={{ ...styles.button, background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-secondary)' }}
                onClick={handleDeactivateSkillActor}
              >
                Deactivate
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Activate to enable sending messages
              </div>
              <button
                style={styles.button}
                onClick={handleActivateSkillActor}
                disabled={!localSkillIdentity.display_name || activatingSkillActor}
              >
                {activatingSkillActor ? 'Activating...' : 'Activate'}
              </button>
            </div>
          )}
        </div>

        {/* Show token if just created */}
        {skillActorToken && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid #eab308',
            borderRadius: '6px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#eab308', marginBottom: '6px' }}>
              ⚠️ Copy this token now - it won't be shown again!
            </div>
            <div style={styles.tokenDisplay}>
              {skillActorToken.token}
            </div>
            <button
              style={{ ...styles.button, marginTop: '10px' }}
              onClick={() => {
                navigator.clipboard.writeText(skillActorToken.token);
                alert('Token copied!');
              }}
            >
              Copy Token
            </button>
          </div>
        )}

        {/* Inbound Channels - shows which addresses/channels route TO this skill */}
        <div style={{
          marginTop: '20px',
          padding: '12px',
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Inbound Channels
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Messages sent to these addresses are routed to this skill.
          </div>

          {inboundChannels.email.length > 0 || inboundChannels.slack.length > 0 || inboundChannels.telegram.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {inboundChannels.email.map((addr, i) => (
                <div key={`email-${i}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  background: 'var(--bg-card)',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  <span style={{ fontSize: '14px' }}>📧</span>
                  <span style={{ color: 'var(--text-primary)' }}>{addr}</span>
                </div>
              ))}
              {inboundChannels.slack.map((channel, i) => (
                <div key={`slack-${i}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  background: 'var(--bg-card)',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  <span style={{ fontSize: '14px' }}>💬</span>
                  <span style={{ color: 'var(--text-primary)' }}>{channel}</span>
                </div>
              ))}
              {inboundChannels.telegram.map((route, i) => (
                <div key={`telegram-${i}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  background: 'var(--bg-card)',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  <span style={{ fontSize: '14px' }}>✈️</span>
                  <span style={{ color: 'var(--text-primary)' }}>{route}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No inbound channels configured.
              <span style={{ color: 'var(--accent)', marginLeft: '4px', cursor: 'pointer' }}>
                Configure in Channels →
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Problem - collapsed by default now */}
      <div style={{ ...styles.section, marginTop: '20px' }}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle} onClick={() => toggleSection('problem')}>
            <span style={{ ...styles.expandIcon, transform: expanded.problem ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Problem
          </div>
          <ExplainButton topic="problem statement" onAskAbout={onAskAbout} />
        </div>
        {expanded.problem && (
          skill.problem?.statement ? (
            <div style={styles.card}>
              <div style={styles.field}>
                <div style={styles.fieldLabel}>Statement</div>
                <div style={styles.fieldValue}>{skill.problem.statement}</div>
              </div>
              {skill.problem.context && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Context</div>
                  <div style={styles.fieldValue}>{skill.problem.context}</div>
                </div>
              )}
              {skill.problem.goals?.length > 0 && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Goals</div>
                  <div style={styles.tagList}>
                    {skill.problem.goals.map((g, i) => (
                      <span key={i} style={styles.tag}>{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.empty}>Not yet defined</div>
          )
        )}
      </div>

      {/* Role / Persona */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle} onClick={() => toggleSection('role')}>
            <span style={{ ...styles.expandIcon, transform: expanded.role ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Role / Persona
          </div>
          <ExplainButton topic="role and persona" onAskAbout={onAskAbout} />
        </div>
        {expanded.role && (
          skill.role?.name ? (
            <div style={styles.card}>
              <div style={styles.field}>
                <div style={styles.fieldLabel}>Name</div>
                <div style={styles.fieldValue}>{skill.role.name}</div>
              </div>
              {skill.role.persona && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Persona</div>
                  <div style={styles.fieldValue}>{skill.role.persona}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.empty}>Not yet defined</div>
          )
        )}
      </div>

      {/* Scenarios */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle} onClick={() => toggleSection('scenarios')}>
            <span style={{ ...styles.expandIcon, transform: expanded.scenarios ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Scenarios ({skill.scenarios?.length || 0})
          </div>
          <ExplainButton topic="scenarios" onAskAbout={onAskAbout} />
        </div>
        {expanded.scenarios && (
          skill.scenarios?.length > 0 ? (
            skill.scenarios.map((scenario, i) => {
              const id = scenario.id || i;
              const isExpanded = expandedItems[id];
              return (
                <div key={id} style={styles.card}>
                  <div style={styles.cardTitle} onClick={() => toggleItem(id)}>
                    <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                    {scenario.title || `Scenario ${i + 1}`}
                  </div>
                  <div style={styles.cardMeta}>{scenario.steps?.length || 0} steps</div>
                  {isExpanded && scenario.description && (
                    <div style={styles.toolDetails}>{scenario.description}</div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={styles.empty}>No scenarios yet</div>
          )
        )}
      </div>
    </>
  );
}
