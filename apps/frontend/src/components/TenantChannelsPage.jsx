import { useState, useEffect, useCallback } from 'react';
import * as api from '../api/client';

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    overflow: 'hidden'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  closeBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px'
  },
  section: {
    marginBottom: '32px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  channelCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px'
  },
  channelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px'
  },
  channelTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  channelIcon: {
    fontSize: '24px'
  },
  channelName: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  channelDesc: {
    fontSize: '13px',
    color: 'var(--text-muted)'
  },
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    background: 'var(--bg-tertiary)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  toggleEnabled: {
    background: 'var(--accent)'
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    background: 'white',
    borderRadius: '50%',
    transition: 'transform 0.2s'
  },
  toggleKnobEnabled: {
    transform: 'translateX(20px)'
  },
  routingSection: {
    marginTop: '16px',
    padding: '16px',
    background: 'var(--bg-primary)',
    borderRadius: '6px',
    border: '1px solid var(--border)'
  },
  routingTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '12px'
  },
  routingMode: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px'
  },
  modeBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '13px'
  },
  modeBtnActive: {
    background: 'var(--bg-tertiary)',
    borderColor: 'var(--text-muted)',
    color: 'var(--text-primary)'
  },
  rulesList: {
    marginTop: '12px'
  },
  ruleItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
    marginBottom: '8px',
    border: '1px solid var(--border)'
  },
  ruleText: {
    fontSize: '13px',
    color: 'var(--text-primary)'
  },
  ruleArrow: {
    color: 'var(--text-muted)',
    margin: '0 8px'
  },
  ruleSkill: {
    color: 'var(--accent)',
    fontWeight: '500'
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '14px'
  },
  editBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '14px'
  },
  ruleActions: {
    display: 'flex',
    gap: '4px'
  },
  editForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1
  },
  editInput: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    flex: 1
  },
  editSelect: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    minWidth: '120px',
    cursor: 'pointer'
  },
  saveBtn: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid var(--success)',
    background: 'transparent',
    color: 'var(--success)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500'
  },
  cancelBtn: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px'
  },
  addRuleForm: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px'
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '13px'
  },
  addBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--success)',
    background: 'transparent',
    color: 'var(--success)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500'
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    minWidth: '150px',
    cursor: 'pointer'
  },
  policiesCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '20px'
  },
  policyItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--border)'
  },
  policyLabel: {
    fontSize: '14px',
    color: 'var(--text-primary)'
  },
  policyDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: 'var(--text-muted)'
  },
  error: {
    padding: '16px',
    background: '#ef444420',
    border: '1px solid var(--error)',
    borderRadius: '8px',
    color: 'var(--error)',
    marginBottom: '16px'
  }
};

export default function TenantChannelsPage({ onClose }) {
  const [tenantConfig, setTenantConfig] = useState(null);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state for adding rules
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [newEmailSkill, setNewEmailSkill] = useState('');
  const [newSlackMention, setNewSlackMention] = useState('');
  const [newSlackSkill, setNewSlackSkill] = useState('');

  // Edit state for routing rules
  const [editingEmailRule, setEditingEmailRule] = useState(null); // { originalAddress, address, skill_slug }
  const [editingSlackRule, setEditingSlackRule] = useState(null); // { originalHandle, mention_handle, skill_slug }

  // Load tenant config and skills list
  useEffect(() => {
    loadTenantConfig();
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const skillsList = await api.listSkills();
      setSkills(skillsList || []);
    } catch (err) {
      console.error('Failed to load skills:', err);
    }
  };

  // Helper to generate skill slug from name
  const getSkillSlug = (skill) => {
    return skill.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || skill.id;
  };

  const loadTenantConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const config = await api.getTenantConfig();
      setTenantConfig(config);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle channel enabled
  const handleToggleChannel = useCallback(async (channel) => {
    if (!tenantConfig) return;

    const currentEnabled = tenantConfig.channels?.[channel]?.enabled || false;

    try {
      setSaving(true);
      await api.enableTenantChannel(channel, !currentEnabled);
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          [channel]: {
            ...prev.channels[channel],
            enabled: !currentEnabled
          }
        }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [tenantConfig]);

  // Add email routing rule
  const handleAddEmailRule = useCallback(async (e) => {
    e.preventDefault();
    if (!newEmailAddress || !newEmailSkill) return;

    try {
      setSaving(true);
      await api.addEmailRoutingRule(newEmailAddress, newEmailSkill);
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          email: {
            ...prev.channels.email,
            routing: {
              ...prev.channels.email.routing,
              rules: [
                ...(prev.channels.email.routing?.rules || []),
                { address: newEmailAddress.toLowerCase(), skill_slug: newEmailSkill }
              ]
            }
          }
        }
      }));
      setNewEmailAddress('');
      setNewEmailSkill('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [newEmailAddress, newEmailSkill]);

  // Remove email routing rule
  const handleRemoveEmailRule = useCallback(async (address) => {
    try {
      setSaving(true);
      await api.removeEmailRoutingRule(address);
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          email: {
            ...prev.channels.email,
            routing: {
              ...prev.channels.email.routing,
              rules: prev.channels.email.routing.rules.filter(r => r.address !== address)
            }
          }
        }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  // Start editing an email rule
  const handleStartEditEmailRule = useCallback((rule) => {
    setEditingEmailRule({
      originalAddress: rule.address,
      address: rule.address,
      skill_slug: rule.skill_slug
    });
  }, []);

  // Cancel editing email rule
  const handleCancelEditEmailRule = useCallback(() => {
    setEditingEmailRule(null);
  }, []);

  // Save edited email rule (delete old, add new)
  const handleSaveEditEmailRule = useCallback(async () => {
    if (!editingEmailRule || !editingEmailRule.address || !editingEmailRule.skill_slug) return;

    try {
      setSaving(true);
      // Delete old rule
      await api.removeEmailRoutingRule(editingEmailRule.originalAddress);
      // Add new rule
      await api.addEmailRoutingRule(editingEmailRule.address, editingEmailRule.skill_slug);

      // Update local state
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          email: {
            ...prev.channels.email,
            routing: {
              ...prev.channels.email.routing,
              rules: prev.channels.email.routing.rules.map(r =>
                r.address === editingEmailRule.originalAddress
                  ? { address: editingEmailRule.address.toLowerCase(), skill_slug: editingEmailRule.skill_slug }
                  : r
              )
            }
          }
        }
      }));
      setEditingEmailRule(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [editingEmailRule]);

  // Add Slack routing rule
  const handleAddSlackRule = useCallback(async (e) => {
    e.preventDefault();
    if (!newSlackMention || !newSlackSkill) return;

    const mention = newSlackMention.startsWith('@') ? newSlackMention : `@${newSlackMention}`;

    try {
      setSaving(true);
      await api.addSlackRoutingRule({ mention_handle: mention, skill_slug: newSlackSkill });
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          slack: {
            ...prev.channels.slack,
            routing: {
              ...prev.channels.slack.routing,
              rules: [
                ...(prev.channels.slack.routing?.rules || []),
                { mention_handle: mention.toLowerCase(), skill_slug: newSlackSkill }
              ]
            }
          }
        }
      }));
      setNewSlackMention('');
      setNewSlackSkill('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [newSlackMention, newSlackSkill]);

  // Remove Slack routing rule
  const handleRemoveSlackRule = useCallback(async (rule) => {
    try {
      setSaving(true);
      await api.removeSlackRoutingRule({ mention_handle: rule.mention_handle });
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          slack: {
            ...prev.channels.slack,
            routing: {
              ...prev.channels.slack.routing,
              rules: prev.channels.slack.routing.rules.filter(r =>
                r.mention_handle !== rule.mention_handle
              )
            }
          }
        }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  // Start editing a Slack rule
  const handleStartEditSlackRule = useCallback((rule) => {
    setEditingSlackRule({
      originalHandle: rule.mention_handle,
      mention_handle: rule.mention_handle,
      skill_slug: rule.skill_slug
    });
  }, []);

  // Cancel editing Slack rule
  const handleCancelEditSlackRule = useCallback(() => {
    setEditingSlackRule(null);
  }, []);

  // Save edited Slack rule (delete old, add new)
  const handleSaveEditSlackRule = useCallback(async () => {
    if (!editingSlackRule || !editingSlackRule.mention_handle || !editingSlackRule.skill_slug) return;

    const mention = editingSlackRule.mention_handle.startsWith('@')
      ? editingSlackRule.mention_handle
      : `@${editingSlackRule.mention_handle}`;

    try {
      setSaving(true);
      // Delete old rule
      await api.removeSlackRoutingRule({ mention_handle: editingSlackRule.originalHandle });
      // Add new rule
      await api.addSlackRoutingRule({ mention_handle: mention, skill_slug: editingSlackRule.skill_slug });

      // Update local state
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          slack: {
            ...prev.channels.slack,
            routing: {
              ...prev.channels.slack.routing,
              rules: prev.channels.slack.routing.rules.map(r =>
                r.mention_handle === editingSlackRule.originalHandle
                  ? { mention_handle: mention.toLowerCase(), skill_slug: editingSlackRule.skill_slug }
                  : r
              )
            }
          }
        }
      }));
      setEditingSlackRule(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [editingSlackRule]);

  // Toggle auto-provision
  const handleToggleAutoProvision = useCallback(async () => {
    if (!tenantConfig) return;

    const current = tenantConfig.policies?.allow_external_users || false;

    try {
      setSaving(true);
      await api.updateTenantPolicies({ allow_external_users: !current });
      setTenantConfig(prev => ({
        ...prev,
        policies: {
          ...prev.policies,
          allow_external_users: !current
        }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [tenantConfig]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Tenant Channels</div>
            <div style={styles.subtitle}>Configure communication channels and routing</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  const emailConfig = tenantConfig?.channels?.email || {};
  const slackConfig = tenantConfig?.channels?.slack || {};
  const policies = tenantConfig?.policies || {};

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Tenant Channels</div>
          <div style={styles.subtitle}>Configure communication channels and routing rules</div>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div style={styles.content}>
        {error && (
          <div style={styles.error}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Email Channel */}
        <div style={styles.section}>
          <div style={styles.channelCard}>
            <div style={styles.channelHeader}>
              <div style={styles.channelTitle}>
                <span style={styles.channelIcon}>📧</span>
                <div>
                  <div style={styles.channelName}>Email (Gmail)</div>
                  <div style={styles.channelDesc}>Route emails to skills by recipient address</div>
                </div>
              </div>
              <div
                style={{ ...styles.toggle, ...(emailConfig.enabled ? styles.toggleEnabled : {}) }}
                onClick={() => handleToggleChannel('email')}
              >
                <div style={{ ...styles.toggleKnob, ...(emailConfig.enabled ? styles.toggleKnobEnabled : {}) }} />
              </div>
            </div>

            {emailConfig.enabled && (
              <div style={styles.routingSection}>
                <div style={styles.routingTitle}>Routing Rules</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Route incoming emails to skills based on recipient address
                </div>

                <div style={styles.rulesList}>
                  {(emailConfig.routing?.rules || []).map((rule, idx) => (
                    <div key={idx} style={styles.ruleItem}>
                      {editingEmailRule?.originalAddress === rule.address ? (
                        <>
                          <div style={styles.editForm}>
                            <input
                              style={styles.editInput}
                              value={editingEmailRule.address}
                              onChange={(e) => setEditingEmailRule(prev => ({ ...prev, address: e.target.value }))}
                              placeholder="Email address"
                            />
                            <span style={styles.ruleArrow}>→</span>
                            <select
                              style={styles.editSelect}
                              value={editingEmailRule.skill_slug}
                              onChange={(e) => setEditingEmailRule(prev => ({ ...prev, skill_slug: e.target.value }))}
                            >
                              <option value="">Select skill...</option>
                              {skills.map(skill => (
                                <option key={skill.id} value={getSkillSlug(skill)}>
                                  {skill.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={styles.ruleActions}>
                            <button
                              style={styles.saveBtn}
                              onClick={handleSaveEditEmailRule}
                              disabled={saving || !editingEmailRule.address || !editingEmailRule.skill_slug}
                            >
                              Save
                            </button>
                            <button
                              style={styles.cancelBtn}
                              onClick={handleCancelEditEmailRule}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span style={styles.ruleText}>{rule.address}</span>
                            <span style={styles.ruleArrow}>→</span>
                            <span style={styles.ruleSkill}>{rule.skill_slug}</span>
                          </div>
                          <div style={styles.ruleActions}>
                            <button
                              style={styles.editBtn}
                              onClick={() => handleStartEditEmailRule(rule)}
                              disabled={saving || editingEmailRule !== null}
                              title="Edit rule"
                            >
                              ✏️
                            </button>
                            <button
                              style={styles.deleteBtn}
                              onClick={() => handleRemoveEmailRule(rule.address)}
                              disabled={saving || editingEmailRule !== null}
                              title="Delete rule"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <form style={styles.addRuleForm} onSubmit={handleAddEmailRule}>
                  <input
                    style={styles.input}
                    placeholder="Email address (e.g., support@domain.com)"
                    value={newEmailAddress}
                    onChange={(e) => setNewEmailAddress(e.target.value)}
                  />
                  <select
                    style={styles.select}
                    value={newEmailSkill}
                    onChange={(e) => setNewEmailSkill(e.target.value)}
                  >
                    <option value="">Select skill...</option>
                    {skills.map(skill => (
                      <option key={skill.id} value={getSkillSlug(skill)}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    style={styles.addBtn}
                    disabled={saving || !newEmailAddress || !newEmailSkill}
                  >
                    Add Rule
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Slack Channel */}
        <div style={styles.section}>
          <div style={styles.channelCard}>
            <div style={styles.channelHeader}>
              <div style={styles.channelTitle}>
                <span style={styles.channelIcon}>💬</span>
                <div>
                  <div style={styles.channelName}>Slack</div>
                  <div style={styles.channelDesc}>Route Slack messages to skills by mention</div>
                </div>
              </div>
              <div
                style={{ ...styles.toggle, ...(slackConfig.enabled ? styles.toggleEnabled : {}) }}
                onClick={() => handleToggleChannel('slack')}
              >
                <div style={{ ...styles.toggleKnob, ...(slackConfig.enabled ? styles.toggleKnobEnabled : {}) }} />
              </div>
            </div>

            {slackConfig.enabled && (
              <div style={styles.routingSection}>
                <div style={styles.routingTitle}>Routing Rules</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Route Slack messages to skills based on @mention handle
                </div>

                <div style={styles.rulesList}>
                  {(slackConfig.routing?.rules || []).map((rule, idx) => (
                    <div key={idx} style={styles.ruleItem}>
                      {editingSlackRule?.originalHandle === rule.mention_handle ? (
                        <>
                          <div style={styles.editForm}>
                            <input
                              style={styles.editInput}
                              value={editingSlackRule.mention_handle}
                              onChange={(e) => setEditingSlackRule(prev => ({ ...prev, mention_handle: e.target.value }))}
                              placeholder="Mention handle (e.g., @support)"
                            />
                            <span style={styles.ruleArrow}>→</span>
                            <select
                              style={styles.editSelect}
                              value={editingSlackRule.skill_slug}
                              onChange={(e) => setEditingSlackRule(prev => ({ ...prev, skill_slug: e.target.value }))}
                            >
                              <option value="">Select skill...</option>
                              {skills.map(skill => (
                                <option key={skill.id} value={getSkillSlug(skill)}>
                                  {skill.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={styles.ruleActions}>
                            <button
                              style={styles.saveBtn}
                              onClick={handleSaveEditSlackRule}
                              disabled={saving || !editingSlackRule.mention_handle || !editingSlackRule.skill_slug}
                            >
                              Save
                            </button>
                            <button
                              style={styles.cancelBtn}
                              onClick={handleCancelEditSlackRule}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span style={styles.ruleText}>{rule.mention_handle || rule.channel_id}</span>
                            <span style={styles.ruleArrow}>→</span>
                            <span style={styles.ruleSkill}>{rule.skill_slug}</span>
                          </div>
                          <div style={styles.ruleActions}>
                            {rule.mention_handle && (
                              <button
                                style={styles.editBtn}
                                onClick={() => handleStartEditSlackRule(rule)}
                                disabled={saving || editingSlackRule !== null}
                                title="Edit rule"
                              >
                                ✏️
                              </button>
                            )}
                            <button
                              style={styles.deleteBtn}
                              onClick={() => handleRemoveSlackRule(rule)}
                              disabled={saving || editingSlackRule !== null}
                              title="Delete rule"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <form style={styles.addRuleForm} onSubmit={handleAddSlackRule}>
                  <input
                    style={styles.input}
                    placeholder="Mention handle (e.g., @support)"
                    value={newSlackMention}
                    onChange={(e) => setNewSlackMention(e.target.value)}
                  />
                  <select
                    style={styles.select}
                    value={newSlackSkill}
                    onChange={(e) => setNewSlackSkill(e.target.value)}
                  >
                    <option value="">Select skill...</option>
                    {skills.map(skill => (
                      <option key={skill.id} value={getSkillSlug(skill)}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    style={styles.addBtn}
                    disabled={saving || !newSlackMention || !newSlackSkill}
                  >
                    Add Rule
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Policies */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>
              ⚙️ Policies
            </div>
          </div>
          <div style={styles.policiesCard}>
            <div style={styles.policyItem}>
              <div>
                <div style={styles.policyLabel}>Auto-provision external users</div>
                <div style={styles.policyDesc}>
                  Automatically create actors for unknown senders
                </div>
              </div>
              <div
                style={{ ...styles.toggle, ...(policies.allow_external_users ? styles.toggleEnabled : {}) }}
                onClick={handleToggleAutoProvision}
              >
                <div style={{ ...styles.toggleKnob, ...(policies.allow_external_users ? styles.toggleKnobEnabled : {}) }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
