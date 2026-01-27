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
  const [emailAliases, setEmailAliases] = useState([]);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state for adding rules
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [newEmailSkill, setNewEmailSkill] = useState('');
  const [newSlackMention, setNewSlackMention] = useState('');
  const [newSlackSkill, setNewSlackSkill] = useState('');
  const [newTelegramCommand, setNewTelegramCommand] = useState('');
  const [newTelegramSkill, setNewTelegramSkill] = useState('');

  // Edit state for routing rules
  const [editingEmailRule, setEditingEmailRule] = useState(null); // { originalAddress, address, skill_slug }
  const [editingSlackRule, setEditingSlackRule] = useState(null); // { originalHandle, mention_handle, skill_slug }
  const [editingTelegramAlias, setEditingTelegramAlias] = useState(null); // { originalCommand, command, skill_slug }

  // Email config state
  const [emailCreds, setEmailCreds] = useState({
    emailUser: '', emailPass: '',
    smtpHost: 'smtp.gmail.com', smtpPort: 587,
    imapHost: 'imap.gmail.com', imapPort: 993
  });
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState(null);
  const [emailMsg, setEmailMsg] = useState(null); // { type: 'success'|'error', text }

  // Telegram config state
  const [telegramBotConfig, setTelegramBotConfig] = useState({ botName: '', botToken: '' });
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramMsg, setTelegramMsg] = useState(null);

  // Retention cleanup state
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleanupStats, setCleanupStats] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupError, setCleanupError] = useState(null);

  // Load tenant config and skills list
  useEffect(() => {
    loadTenantConfig();
    loadSkills();
    loadEmailAliases();
    loadEmailConfig();
    loadTelegramConfig();
  }, []);

  const loadSkills = async () => {
    try {
      const skillsList = await api.listSkills();
      setSkills(skillsList || []);
    } catch (err) {
      console.error('Failed to load skills:', err);
    }
  };

  const loadEmailAliases = async () => {
    try {
      setLoadingAliases(true);
      const result = await api.listEmailAliases();
      if (result.ok && result.aliases) {
        setEmailAliases(result.aliases);
      }
    } catch (err) {
      console.error('Failed to load email aliases:', err);
    } finally {
      setLoadingAliases(false);
    }
  };

  // Load email config from CORE
  const loadEmailConfig = async () => {
    try {
      const result = await api.getEmailConfig();
      if (result.ok && result.configured && result.config) {
        setEmailCreds({
          emailUser: result.config.emailUser || '',
          emailPass: '',
          smtpHost: result.config.smtpHost || 'smtp.gmail.com',
          smtpPort: result.config.smtpPort || 587,
          imapHost: result.config.imapHost || 'imap.gmail.com',
          imapPort: result.config.imapPort || 993
        });
        setEmailConfigured(true);
      }
    } catch (err) {
      console.error('Failed to load email config:', err);
    }
  };

  // Save email config
  const handleSaveEmailConfig = async () => {
    if (!emailCreds.emailUser || !emailCreds.emailPass) {
      setEmailMsg({ type: 'error', text: 'Email and password are required' });
      return;
    }
    try {
      setEmailSaving(true);
      setEmailMsg(null);
      setEmailTestResult(null);
      const result = await api.setEmailConfig(emailCreds);
      if (!result.ok) throw new Error(result.error || 'Failed to save');
      setEmailMsg({ type: 'success', text: 'Email configuration saved' });
      setEmailConfigured(true);
      setEmailCreds(prev => ({ ...prev, emailPass: '' }));
    } catch (err) {
      setEmailMsg({ type: 'error', text: err.message });
    } finally {
      setEmailSaving(false);
    }
  };

  // Test email connection
  const handleTestEmail = async () => {
    try {
      setEmailTesting(true);
      setEmailMsg(null);
      setEmailTestResult(null);
      const result = await api.testEmailConnection({ protocol: 'both' });
      setEmailTestResult(result);
      if (result.ok) {
        setEmailMsg({ type: 'success', text: 'Connection test passed!' });
      } else {
        setEmailMsg({ type: 'error', text: 'Connection test failed' });
      }
    } catch (err) {
      setEmailMsg({ type: 'error', text: err.message });
    } finally {
      setEmailTesting(false);
    }
  };

  // Load Telegram config from CORE
  const loadTelegramConfig = async () => {
    try {
      const result = await api.getTelegramBotConfig();
      if (result.ok && result.configured && result.config) {
        setTelegramBotConfig({
          botName: result.config.botName || '',
          botToken: ''
        });
        setTelegramConfigured(true);
      }
    } catch (err) {
      console.error('Failed to load telegram config:', err);
    }
  };

  // Save Telegram config
  const handleSaveTelegramConfig = async () => {
    if (!telegramBotConfig.botToken) {
      setTelegramMsg({ type: 'error', text: 'Bot token is required' });
      return;
    }
    try {
      setTelegramSaving(true);
      setTelegramMsg(null);
      const result = await api.setTelegramBotConfig(telegramBotConfig);
      if (!result.ok) throw new Error(result.error || 'Failed to save');
      setTelegramMsg({ type: 'success', text: 'Telegram configuration saved' });
      setTelegramConfigured(true);
      setTelegramBotConfig(prev => ({ ...prev, botToken: '' }));
    } catch (err) {
      setTelegramMsg({ type: 'error', text: err.message });
    } finally {
      setTelegramSaving(false);
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
      setRetentionDays(config?.policies?.retention_days ?? 30);
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

  // Add Telegram command alias
  const handleAddTelegramAlias = useCallback(async (e) => {
    e.preventDefault();
    if (!newTelegramCommand || !newTelegramSkill) return;

    const cmd = newTelegramCommand.toLowerCase().replace(/^\//, '');

    try {
      setSaving(true);
      await api.addTelegramRoutingRule({ command: cmd, skill_slug: newTelegramSkill });
      setTenantConfig(prev => ({
        ...prev,
        channels: {
          ...prev.channels,
          telegram: {
            ...prev.channels.telegram,
            routing: {
              ...prev.channels.telegram?.routing,
              command_aliases: {
                ...(prev.channels.telegram?.routing?.command_aliases || {}),
                [cmd]: newTelegramSkill
              }
            }
          }
        }
      }));
      setNewTelegramCommand('');
      setNewTelegramSkill('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [newTelegramCommand, newTelegramSkill]);

  // Remove Telegram command alias
  const handleRemoveTelegramAlias = useCallback(async (command) => {
    try {
      setSaving(true);
      await api.removeTelegramRoutingRule({ command });
      setTenantConfig(prev => {
        const aliases = { ...(prev.channels.telegram?.routing?.command_aliases || {}) };
        delete aliases[command];
        return {
          ...prev,
          channels: {
            ...prev.channels,
            telegram: {
              ...prev.channels.telegram,
              routing: {
                ...prev.channels.telegram?.routing,
                command_aliases: aliases
              }
            }
          }
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  // Start editing a Telegram alias
  const handleStartEditTelegramAlias = useCallback((command, skillSlug) => {
    setEditingTelegramAlias({
      originalCommand: command,
      command,
      skill_slug: skillSlug
    });
  }, []);

  // Cancel editing Telegram alias
  const handleCancelEditTelegramAlias = useCallback(() => {
    setEditingTelegramAlias(null);
  }, []);

  // Save edited Telegram alias (delete old, add new)
  const handleSaveEditTelegramAlias = useCallback(async () => {
    if (!editingTelegramAlias || !editingTelegramAlias.command || !editingTelegramAlias.skill_slug) return;

    const cmd = editingTelegramAlias.command.toLowerCase().replace(/^\//, '');

    try {
      setSaving(true);
      // Delete old alias
      await api.removeTelegramRoutingRule({ command: editingTelegramAlias.originalCommand });
      // Add new alias
      await api.addTelegramRoutingRule({ command: cmd, skill_slug: editingTelegramAlias.skill_slug });

      // Update local state
      setTenantConfig(prev => {
        const aliases = { ...(prev.channels.telegram?.routing?.command_aliases || {}) };
        delete aliases[editingTelegramAlias.originalCommand];
        aliases[cmd] = editingTelegramAlias.skill_slug;
        return {
          ...prev,
          channels: {
            ...prev.channels,
            telegram: {
              ...prev.channels.telegram,
              routing: {
                ...prev.channels.telegram?.routing,
                command_aliases: aliases
              }
            }
          }
        };
      });
      setEditingTelegramAlias(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [editingTelegramAlias]);

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

  // Save retention days
  const handleSaveRetentionDays = useCallback(async (days) => {
    const value = Math.max(1, Math.min(365, Number(days) || 30));
    try {
      setSaving(true);
      await api.updateTenantPolicies({ retention_days: value });
      setRetentionDays(value);
      setTenantConfig(prev => ({
        ...prev,
        policies: { ...prev.policies, retention_days: value }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  // Preview cleanup (dry run)
  const handlePreviewCleanup = useCallback(async () => {
    try {
      setCleanupLoading(true);
      setCleanupError(null);
      const result = await api.previewRetentionCleanup();
      setCleanupStats(result.stats);
    } catch (err) {
      setCleanupError(err.message);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  // Run actual cleanup
  const handleRunCleanup = useCallback(async () => {
    try {
      setCleanupLoading(true);
      setCleanupError(null);
      const result = await api.triggerRetentionCleanup(false);
      setCleanupStats(result.stats);
    } catch (err) {
      setCleanupError(err.message);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

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
  const telegramConfig = tenantConfig?.channels?.telegram || {};
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
              <>
              {/* Email Credentials */}
              <div style={styles.routingSection}>
                <div style={styles.routingTitle}>Connection Settings</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Gmail SMTP/IMAP credentials for sending and receiving email
                </div>

                {/* Status */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '12px', padding: '8px 10px',
                  background: emailConfigured ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                  border: `1px solid ${emailConfigured ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
                  borderRadius: '6px'
                }}>
                  <span style={{ fontSize: '13px', color: emailConfigured ? '#22c55e' : '#fbbf24' }}>
                    {emailConfigured ? 'Configured' : 'Not configured'}
                  </span>
                </div>

                {/* Messages */}
                {emailMsg && (
                  <div style={{
                    padding: '8px 10px', marginBottom: '12px', borderRadius: '6px', fontSize: '13px',
                    background: emailMsg.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${emailMsg.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: emailMsg.type === 'success' ? '#4ade80' : '#f87171'
                  }}>
                    {emailMsg.text}
                  </div>
                )}

                {/* Gmail Address */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Gmail Address
                  </label>
                  <input
                    type="email"
                    value={emailCreds.emailUser}
                    onChange={(e) => { setEmailCreds(p => ({ ...p, emailUser: e.target.value })); setEmailMsg(null); }}
                    placeholder="your.email@gmail.com"
                    style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* App Password */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    App Password
                  </label>
                  <input
                    type="password"
                    value={emailCreds.emailPass}
                    onChange={(e) => { setEmailCreds(p => ({ ...p, emailPass: e.target.value })); setEmailMsg(null); }}
                    placeholder={emailConfigured ? '(unchanged)' : 'Enter app password'}
                    style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  {emailConfigured && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Leave blank to keep existing password
                    </div>
                  )}
                </div>

                {/* Advanced SMTP/IMAP settings */}
                <details style={{ marginBottom: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Advanced Settings
                  </summary>
                  <div style={{ paddingLeft: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>SMTP Host</label>
                        <input type="text" value={emailCreds.smtpHost}
                          onChange={(e) => setEmailCreds(p => ({ ...p, smtpHost: e.target.value }))}
                          style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 8px' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Port</label>
                        <input type="number" value={emailCreds.smtpPort}
                          onChange={(e) => setEmailCreds(p => ({ ...p, smtpPort: parseInt(e.target.value) || 587 }))}
                          style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 8px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>IMAP Host</label>
                        <input type="text" value={emailCreds.imapHost}
                          onChange={(e) => setEmailCreds(p => ({ ...p, imapHost: e.target.value }))}
                          style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 8px' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Port</label>
                        <input type="number" value={emailCreds.imapPort}
                          onChange={(e) => setEmailCreds(p => ({ ...p, imapPort: parseInt(e.target.value) || 993 }))}
                          style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 8px' }} />
                      </div>
                    </div>
                  </div>
                </details>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSaveEmailConfig}
                    disabled={emailSaving || !emailCreds.emailUser || (!emailCreds.emailPass && !emailConfigured)}
                    style={{
                      ...styles.addBtn,
                      flex: 1, textAlign: 'center',
                      opacity: (emailSaving || !emailCreds.emailUser || (!emailCreds.emailPass && !emailConfigured)) ? 0.5 : 1,
                      cursor: (emailSaving || !emailCreds.emailUser || (!emailCreds.emailPass && !emailConfigured)) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {emailSaving ? 'Saving...' : 'Save'}
                  </button>
                  {emailConfigured && (
                    <button
                      onClick={handleTestEmail}
                      disabled={emailTesting}
                      style={{
                        ...styles.cancelBtn,
                        opacity: emailTesting ? 0.5 : 1,
                        cursor: emailTesting ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {emailTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                  )}
                </div>

                {/* Test Results */}
                {emailTestResult && (
                  <div style={{
                    marginTop: '12px', padding: '10px 12px',
                    background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '6px'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
                      Test Results
                    </div>
                    <div style={{ fontSize: '12px', color: emailTestResult.ok ? '#4ade80' : '#f87171' }}>
                      {emailTestResult.ok
                        ? `Connected (${emailTestResult.aliasCount || 0} aliases found)`
                        : (emailTestResult.error || 'Connection failed')}
                    </div>
                  </div>
                )}
              </div>

              {/* Routing Rules */}
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
                            <select
                              style={styles.editSelect}
                              value={editingEmailRule.address}
                              onChange={(e) => setEditingEmailRule(prev => ({ ...prev, address: e.target.value }))}
                            >
                              <option value="">Select email...</option>
                              {emailAliases.map(alias => (
                                <option key={alias.sendAsEmail} value={alias.sendAsEmail}>
                                  {alias.sendAsEmail}
                                </option>
                              ))}
                            </select>
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
                  <select
                    style={styles.select}
                    value={newEmailAddress}
                    onChange={(e) => setNewEmailAddress(e.target.value)}
                  >
                    <option value="">
                      {loadingAliases ? 'Loading emails...' : 'Select email address...'}
                    </option>
                    {emailAliases.map(alias => (
                      <option key={alias.sendAsEmail} value={alias.sendAsEmail}>
                        {alias.sendAsEmail}{alias.displayName ? ` (${alias.displayName})` : ''}{alias.isPrimary ? ' [Primary]' : ''}
                      </option>
                    ))}
                  </select>
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
              </>
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

        {/* Telegram Channel */}
        <div style={styles.section}>
          <div style={styles.channelCard}>
            <div style={styles.channelHeader}>
              <div style={styles.channelTitle}>
                <span style={styles.channelIcon}>✈️</span>
                <div>
                  <div style={styles.channelName}>Telegram</div>
                  <div style={styles.channelDesc}>Route Telegram messages to skills by command prefix</div>
                </div>
              </div>
              <div
                style={{ ...styles.toggle, ...(telegramConfig.enabled ? styles.toggleEnabled : {}) }}
                onClick={() => handleToggleChannel('telegram')}
              >
                <div style={{ ...styles.toggleKnob, ...(telegramConfig.enabled ? styles.toggleKnobEnabled : {}) }} />
              </div>
            </div>

            {telegramConfig.enabled && (
              <>
              {/* Telegram Bot Settings */}
              <div style={styles.routingSection}>
                <div style={styles.routingTitle}>Bot Settings</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Telegram bot credentials from @BotFather
                </div>

                {/* Status */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '12px', padding: '8px 10px',
                  background: telegramConfigured ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                  border: `1px solid ${telegramConfigured ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
                  borderRadius: '6px'
                }}>
                  <span style={{ fontSize: '13px', color: telegramConfigured ? '#22c55e' : '#fbbf24' }}>
                    {telegramConfigured ? 'Configured' : 'Not configured'}
                  </span>
                </div>

                {/* Messages */}
                {telegramMsg && (
                  <div style={{
                    padding: '8px 10px', marginBottom: '12px', borderRadius: '6px', fontSize: '13px',
                    background: telegramMsg.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${telegramMsg.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: telegramMsg.type === 'success' ? '#4ade80' : '#f87171'
                  }}>
                    {telegramMsg.text}
                  </div>
                )}

                {/* Bot Name */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Bot Name
                  </label>
                  <input
                    type="text"
                    value={telegramBotConfig.botName}
                    onChange={(e) => { setTelegramBotConfig(p => ({ ...p, botName: e.target.value })); setTelegramMsg(null); }}
                    placeholder="e.g., MyAssistantBot"
                    style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Bot Token */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Bot Token
                  </label>
                  <input
                    type="password"
                    value={telegramBotConfig.botToken}
                    onChange={(e) => { setTelegramBotConfig(p => ({ ...p, botToken: e.target.value })); setTelegramMsg(null); }}
                    placeholder={telegramConfigured ? '(unchanged)' : 'Enter bot token from @BotFather'}
                    style={{ ...styles.input, maxWidth: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  {telegramConfigured && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Leave blank to keep existing token
                    </div>
                  )}
                </div>

                {/* Save button */}
                <button
                  onClick={handleSaveTelegramConfig}
                  disabled={telegramSaving || (!telegramBotConfig.botToken && !telegramConfigured)}
                  style={{
                    ...styles.addBtn,
                    width: '100%', textAlign: 'center',
                    opacity: (telegramSaving || (!telegramBotConfig.botToken && !telegramConfigured)) ? 0.5 : 1,
                    cursor: (telegramSaving || (!telegramBotConfig.botToken && !telegramConfigured)) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {telegramSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {/* Command Aliases */}
              <div style={styles.routingSection}>
                <div style={styles.routingTitle}>Command Aliases</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Map Telegram /command prefixes to skills (e.g., /dev, /support)
                </div>

                <div style={styles.rulesList}>
                  {Object.entries(telegramConfig.routing?.command_aliases || {}).map(([cmd, skillSlug]) => (
                    <div key={cmd} style={styles.ruleItem}>
                      {editingTelegramAlias?.originalCommand === cmd ? (
                        <>
                          <div style={styles.editForm}>
                            <input
                              style={{ ...styles.editInput, maxWidth: '120px' }}
                              value={editingTelegramAlias.command}
                              onChange={(e) => setEditingTelegramAlias(prev => ({ ...prev, command: e.target.value }))}
                              placeholder="command"
                            />
                            <span style={styles.ruleArrow}>&rarr;</span>
                            <select
                              style={styles.editSelect}
                              value={editingTelegramAlias.skill_slug}
                              onChange={(e) => setEditingTelegramAlias(prev => ({ ...prev, skill_slug: e.target.value }))}
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
                              onClick={handleSaveEditTelegramAlias}
                              disabled={saving || !editingTelegramAlias.command || !editingTelegramAlias.skill_slug}
                            >
                              Save
                            </button>
                            <button
                              style={styles.cancelBtn}
                              onClick={handleCancelEditTelegramAlias}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span style={styles.ruleText}>/{cmd}</span>
                            <span style={styles.ruleArrow}>&rarr;</span>
                            <span style={styles.ruleSkill}>{skillSlug}</span>
                          </div>
                          <div style={styles.ruleActions}>
                            <button
                              style={styles.editBtn}
                              onClick={() => handleStartEditTelegramAlias(cmd, skillSlug)}
                              disabled={saving || editingTelegramAlias !== null}
                              title="Edit alias"
                            >
                              ✏️
                            </button>
                            <button
                              style={styles.deleteBtn}
                              onClick={() => handleRemoveTelegramAlias(cmd)}
                              disabled={saving || editingTelegramAlias !== null}
                              title="Delete alias"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <form style={styles.addRuleForm} onSubmit={handleAddTelegramAlias}>
                  <input
                    style={{ ...styles.input, maxWidth: '180px' }}
                    placeholder="Command (e.g., dev)"
                    value={newTelegramCommand}
                    onChange={(e) => setNewTelegramCommand(e.target.value)}
                  />
                  <select
                    style={styles.select}
                    value={newTelegramSkill}
                    onChange={(e) => setNewTelegramSkill(e.target.value)}
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
                    disabled={saving || !newTelegramCommand || !newTelegramSkill}
                  >
                    Add Alias
                  </button>
                </form>
              </div>
              </>
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

        {/* Data Retention */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>
              Data Retention
            </div>
          </div>
          <div style={styles.policiesCard}>
            {/* Retention Days Setting */}
            <div style={styles.policyItem}>
              <div>
                <div style={styles.policyLabel}>Keep history</div>
                <div style={styles.policyDesc}>
                  Jobs, conversations, logs, and cache older than this are cleaned up daily (relative to latest activity)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Last</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  onBlur={(e) => handleSaveRetentionDays(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRetentionDays(e.target.value); }}
                  style={{
                    width: '60px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>days</span>
              </div>
            </div>

            {/* Manual Cleanup Actions */}
            <div style={{ ...styles.policyItem, borderBottom: 'none' }}>
              <div>
                <div style={styles.policyLabel}>Manual cleanup</div>
                <div style={styles.policyDesc}>
                  Preview or run cleanup immediately
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handlePreviewCleanup}
                  disabled={cleanupLoading || saving}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: cleanupLoading || saving ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    opacity: cleanupLoading || saving ? 0.6 : 1
                  }}
                >
                  {cleanupLoading ? 'Scanning...' : 'Preview'}
                </button>
                <button
                  onClick={handleRunCleanup}
                  disabled={cleanupLoading || saving}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #f59e0b',
                    background: 'transparent',
                    color: '#f59e0b',
                    cursor: cleanupLoading || saving ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    opacity: cleanupLoading || saving ? 0.6 : 1
                  }}
                >
                  Clean Now
                </button>
              </div>
            </div>

            {/* Cleanup Error */}
            {cleanupError && (
              <div style={{
                marginTop: '12px',
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                color: '#f87171',
                fontSize: '13px'
              }}>
                {cleanupError}
              </div>
            )}

            {/* Cleanup Stats Display */}
            {cleanupStats && (
              <div style={{
                marginTop: '12px',
                padding: '12px 16px',
                background: 'var(--bg-primary)',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
                  {cleanupStats.dryRun ? 'Preview' : 'Cleanup Complete'}
                  {' \u2014 '}
                  {cleanupStats.dryRun ? 'Would free' : 'Freed'}
                  {' '}
                  {formatBytes(cleanupStats.totalFreedBytes)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', color: 'var(--text-secondary)' }}>
                  <span>Jobs: {cleanupStats.jobs?.deleted || 0} {cleanupStats.dryRun ? 'to delete' : 'deleted'}</span>
                  <span>Conversations: {cleanupStats.conversations?.deleted || 0}</span>
                  <span>Trace logs: {cleanupStats.logs?.deleted || 0}</span>
                  <span>Focus cache: {cleanupStats.focusCache?.deleted || 0}</span>
                  <span>Audit logs: {cleanupStats.auditLogs?.deleted || 0}</span>
                  <span>Skills scanned: {cleanupStats.skills_scanned}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
