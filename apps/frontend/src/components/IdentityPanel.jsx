/**
 * IdentityPanel - Display Problem, Role/Persona, Scenarios, and Sender Identity
 *
 * Extracted from the Overview tab to separate identity/context info
 * from validation status.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listConnectors, listActors, findOrCreateActorForIdentity, createToken } from '../api/client';

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
  onConnectorConfigChange
}) {
  const [expanded, setExpanded] = useState({
    problem: true,
    role: true,
    scenarios: true,
    sender: true
  });
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

  // Load global connectors
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
    }
    load();
  }, []);

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

      {/* Sender Identity - NEW SECTION */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle} onClick={() => toggleSection('sender')}>
            <span style={{ ...styles.expandIcon, transform: expanded.sender ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            Sender Identity
          </div>
        </div>
        {expanded.sender && (
          globalConnectors.length === 0 ? (
            <div style={styles.noConnector}>
              <div style={{ marginBottom: '8px' }}>No email connector linked</div>
              <div style={{ fontSize: '12px' }}>
                Link a Gmail or email connector in the Connectors tab to configure sender identity.
              </div>
            </div>
          ) : (
            <div style={styles.card}>
              {/* Connector selector (if multiple email connectors) */}
              {globalConnectors.length > 1 && (
                <select
                  style={styles.connectorSelect}
                  value={selectedConnector || ''}
                  onChange={(e) => setSelectedConnector(e.target.value)}
                >
                  {globalConnectors.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.id}</option>
                  ))}
                </select>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>From Name</label>
                <input
                  type="text"
                  style={styles.input}
                  placeholder="e.g., Support Bot"
                  value={identity.from_name || ''}
                  onChange={(e) => handleIdentityChange('from_name', e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>From Email</label>
                <input
                  type="email"
                  style={styles.input}
                  placeholder="e.g., support@example.com"
                  value={identity.from_email || ''}
                  onChange={(e) => handleIdentityChange('from_email', e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Signature</label>
                <textarea
                  style={styles.textarea}
                  placeholder="e.g., -- Sent by ADAS Support"
                  value={identity.signature || ''}
                  onChange={(e) => handleIdentityChange('signature', e.target.value)}
                />
              </div>

              {/* Activation Section */}
              <div style={styles.actorSection}>
                <div style={styles.actorTitle}>
                  Activate Identity
                </div>
                <div style={styles.actorInfo}>
                  Activate this identity so the skill can send emails on your behalf.
                </div>

                {identity.actor_id ? (
                  <>
                    <div style={styles.actorLinked}>
                      <span style={styles.actorBadge}>
                        Active
                      </span>
                      <span style={{ flex: 1, fontSize: '13px' }}>
                        {identity.actor_display_name || identity.from_email}
                      </span>
                    </div>
                    {identity.token_prefix && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Access key: <code>{identity.token_prefix}...</code>
                      </div>
                    )}
                    {newlyCreatedToken && (
                      <div style={{
                        padding: '12px',
                        background: 'rgba(var(--warning-rgb), 0.1)',
                        border: '1px solid var(--warning)',
                        borderRadius: '6px',
                        marginBottom: '12px'
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--warning)', marginBottom: '6px' }}>
                          Copy this access key now - it won't be shown again!
                        </div>
                        <div style={styles.tokenDisplay}>
                          {newlyCreatedToken.token}
                        </div>
                        <button
                          style={{ ...styles.button, marginTop: '10px' }}
                          onClick={() => {
                            navigator.clipboard.writeText(newlyCreatedToken.token);
                            alert('Access key copied to clipboard!');
                          }}
                        >
                          Copy Key
                        </button>
                      </div>
                    )}
                    <div style={styles.actorActions}>
                      <button
                        style={{ ...styles.button, ...styles.buttonDanger }}
                        onClick={handleDeactivateIdentity}
                      >
                        Deactivate
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.actorNotLinked}>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        Not activated yet
                      </span>
                    </div>
                    <div style={styles.actorActions}>
                      <button
                        style={styles.button}
                        onClick={handleActivateIdentity}
                        disabled={!identity.from_email || linkingActor}
                      >
                        {linkingActor ? 'Activating...' : 'Activate Identity'}
                      </button>
                    </div>
                    {!identity.from_email && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Enter an email address above to activate
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Problem */}
      <div style={styles.section}>
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
