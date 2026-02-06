/**
 * SecurityPanel - Display Identity & Access Control configuration
 *
 * Read-only visualization of security config (authored via bot dialog):
 * - Tool security classifications
 * - Access policy rules
 * - Grant mappings
 * - Response filters
 * - Context propagation
 */

import { useState } from 'react';

// ── ExplainButton (same pattern as PolicyPanel) ────────────────────

function ExplainButton({ topic, onAskAbout }) {
  const [hovered, setHovered] = useState(false);
  if (!onAskAbout) return null;

  return (
    <button
      style={{
        padding: '3px 10px',
        background: hovered ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
        border: '1px solid ' + (hovered ? '#60a5fa' : 'rgba(59, 130, 246, 0.4)'),
        borderRadius: '999px',
        color: '#60a5fa',
        cursor: 'pointer',
        fontSize: '10px',
        transition: 'all 0.15s ease',
        flexShrink: 0
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

// ── Classification badge ───────────────────────────────────────────

const CLASSIFICATION_COLORS = {
  public: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: 'Public' },
  pii_read: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', label: 'PII Read' },
  pii_write: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'PII Write' },
  financial: { bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', label: 'Financial' },
  destructive: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Destructive' },
};

function ClassificationBadge({ classification }) {
  if (!classification) {
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: '600',
        background: 'rgba(107, 114, 128, 0.2)',
        color: '#9ca3af',
      }}>
        Unclassified
      </span>
    );
  }

  const config = CLASSIFICATION_COLORS[classification] || CLASSIFICATION_COLORS.public;
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '10px',
      fontWeight: '600',
      background: config.bg,
      color: config.color,
    }}>
      {config.label}
    </span>
  );
}

// ── Effect badge ───────────────────────────────────────────────────

const EFFECT_COLORS = {
  allow: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
  deny: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  constrain: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' },
};

function EffectBadge({ effect }) {
  const config = EFFECT_COLORS[effect] || EFFECT_COLORS.allow;
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '10px',
      fontWeight: '600',
      textTransform: 'uppercase',
      background: config.bg,
      color: config.color,
    }}>
      {effect}
    </span>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

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
  sectionHeaderButtons: {
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
    marginBottom: '8px',
    border: '1px solid transparent'
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '4px'
  },
  cardDetail: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '6px',
    lineHeight: '1.5'
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontStyle: 'italic',
    padding: '12px 0'
  },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--bg-card)',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '13px'
  },
  toolName: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--text-primary)'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '4px'
  },
  tag: {
    padding: '1px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontFamily: 'monospace',
    background: 'rgba(107, 114, 128, 0.15)',
    color: 'var(--text-secondary)'
  },
  fieldPath: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '1px 4px',
    borderRadius: '3px'
  },
  grantKey: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '1px 4px',
    borderRadius: '3px'
  },
  arrow: {
    color: 'var(--text-muted)',
    margin: '0 4px'
  },
  divider: {
    borderTop: '1px solid var(--border)',
    margin: '12px 0'
  }
};

// ── Main Component ─────────────────────────────────────────────────

export default function SecurityPanel({ skill, onAskAbout, focus, validateButton }) {
  const [expandedSections, setExpandedSections] = useState({
    classifications: true,
    accessPolicy: true,
    grantMappings: true,
    responseFilters: true,
    contextPropagation: true
  });

  const tools = skill?.tools || [];
  const accessRules = skill?.access_policy?.rules || [];
  const grantMappings = skill?.grant_mappings || [];
  const responseFilters = skill?.response_filters || [];
  const contextProp = skill?.context_propagation?.on_handoff;

  // Helper to get classification from either location (bot saves to tool.classification, not tool.security.classification)
  const getClassification = (tool) => tool.security?.classification || tool.classification;

  const classifiedCount = tools.filter(t => getClassification(t)).length;
  const highRiskCount = tools.filter(t =>
    ['pii_write', 'financial', 'destructive'].includes(getClassification(t))
  ).length;

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const hasAnySecurity = classifiedCount > 0 || accessRules.length > 0 ||
    grantMappings.length > 0 || responseFilters.length > 0;

  return (
    <div>
      {/* Section header */}
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle}>
          <span>Identity & Access Control</span>
        </div>
        <div style={styles.sectionHeaderButtons}>
          <ExplainButton topic="security" onAskAbout={onAskAbout} />
          {validateButton}
        </div>
      </div>

      {!hasAnySecurity && tools.length === 0 && (
        <div style={styles.empty}>
          No tools defined yet. Define tools first, then configure security.
        </div>
      )}

      {!hasAnySecurity && tools.length > 0 && (
        <div style={styles.empty}>
          No security configuration yet. Ask the bot: "Let's configure security for my tools"
        </div>
      )}

      {/* ── 1. Tool Classifications ──────────────────────────────── */}
      <div style={styles.section}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection('classifications')}
        >
          <div style={styles.sectionTitle}>
            <span style={styles.expandIcon}>
              {expandedSections.classifications ? '▼' : '▶'}
            </span>
            Tool Classifications ({classifiedCount}/{tools.length})
            {highRiskCount > 0 && (
              <span style={{
                fontSize: '10px',
                color: '#ef4444',
                fontWeight: '500',
                textTransform: 'none'
              }}>
                {highRiskCount} high-risk
              </span>
            )}
          </div>
          <ExplainButton topic="tool classification" onAskAbout={onAskAbout} />
        </div>

        {expandedSections.classifications && tools.length > 0 && (
          <div>
            {tools.map(tool => (
              <div key={tool.name || tool.id} style={styles.toolRow}>
                <span style={styles.toolName}>{tool.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ClassificationBadge classification={getClassification(tool)} />
                  {(tool.security?.data_owner_field || tool.data_owner_field) && (
                    <span style={{ ...styles.tag, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                      owner: {tool.security?.data_owner_field || tool.data_owner_field}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 2. Access Policy Rules ───────────────────────────────── */}
      <div style={styles.section}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection('accessPolicy')}
        >
          <div style={styles.sectionTitle}>
            <span style={styles.expandIcon}>
              {expandedSections.accessPolicy ? '▼' : '▶'}
            </span>
            Access Policy Rules ({accessRules.length})
          </div>
          <ExplainButton topic="access policy" onAskAbout={onAskAbout} />
        </div>

        {expandedSections.accessPolicy && accessRules.length === 0 && (
          <div style={styles.empty}>No access policy rules defined</div>
        )}

        {expandedSections.accessPolicy && accessRules.map((rule, i) => (
          <div key={i} style={styles.card}>
            <div style={styles.cardTitle}>
              <EffectBadge effect={rule.effect} />
              <div style={styles.tagList}>
                {(rule.tools || []).map(t => (
                  <span key={t} style={styles.tag}>{t}</span>
                ))}
              </div>
            </div>

            {rule.when && (
              <div style={styles.cardDetail}>
                <strong>When: </strong>
                {rule.when.origin_type && `origin = ${rule.when.origin_type}`}
                {rule.when.root_origin_type && `root_origin = ${rule.when.root_origin_type}`}
                {rule.when.channel && ` channel = ${rule.when.channel}`}
              </div>
            )}

            {rule.require && (
              <div style={styles.cardDetail}>
                <strong>Require: </strong>
                {rule.require.has_grant && (
                  <span>
                    grants: {(Array.isArray(rule.require.has_grant)
                      ? rule.require.has_grant
                      : [rule.require.has_grant]
                    ).map(g => (
                      <span key={g} style={styles.grantKey}>{g}</span>
                    ))}
                  </span>
                )}
                {rule.require.grant_value && (
                  <span style={{ marginLeft: '8px' }}>
                    {Object.entries(rule.require.grant_value).map(([k, v]) => (
                      <span key={k}>
                        <span style={styles.grantKey}>{k}</span>
                        {' = '}
                        {Array.isArray(v) ? v.join(' | ') : v}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )}

            {rule.constrain && (
              <div style={styles.cardDetail}>
                {rule.constrain.inject_args && (
                  <div>
                    <strong>Inject: </strong>
                    {Object.entries(rule.constrain.inject_args).map(([k, v]) => (
                      <span key={k} style={{ marginRight: '8px' }}>
                        {k} <span style={styles.arrow}>&larr;</span> <span style={styles.grantKey}>{v}</span>
                      </span>
                    ))}
                  </div>
                )}
                {rule.constrain.response_filter && (
                  <div style={{ marginTop: '2px' }}>
                    <strong>Filter: </strong>
                    <span style={styles.tag}>{rule.constrain.response_filter}</span>
                  </div>
                )}
              </div>
            )}

            {rule.deny_message && (
              <div style={{ ...styles.cardMeta, color: '#ef4444' }}>
                "{rule.deny_message}"
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 3. Grant Mappings ────────────────────────────────────── */}
      <div style={styles.section}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection('grantMappings')}
        >
          <div style={styles.sectionTitle}>
            <span style={styles.expandIcon}>
              {expandedSections.grantMappings ? '▼' : '▶'}
            </span>
            Grant Mappings ({grantMappings.length})
          </div>
          <ExplainButton topic="grant mappings" onAskAbout={onAskAbout} />
        </div>

        {expandedSections.grantMappings && grantMappings.length === 0 && (
          <div style={styles.empty}>No grant mappings defined</div>
        )}

        {expandedSections.grantMappings && grantMappings.map((mapping, i) => (
          <div key={i} style={styles.card}>
            <div style={styles.cardTitle}>
              <span style={styles.tag}>{mapping.tool}</span>
              {mapping.on_success && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>on success</span>
              )}
            </div>
            {(mapping.grants || []).map((grant, gi) => (
              <div key={gi} style={styles.cardDetail}>
                <span style={styles.grantKey}>{grant.key}</span>
                <span style={styles.arrow}>&larr;</span>
                <span style={styles.fieldPath}>{grant.value_from}</span>
                {grant.condition && (
                  <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    if {grant.condition}
                  </span>
                )}
                {grant.ttl_seconds && (
                  <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    TTL: {grant.ttl_seconds}s
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── 4. Response Filters ──────────────────────────────────── */}
      <div style={styles.section}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection('responseFilters')}
        >
          <div style={styles.sectionTitle}>
            <span style={styles.expandIcon}>
              {expandedSections.responseFilters ? '▼' : '▶'}
            </span>
            Response Filters ({responseFilters.length})
          </div>
          <ExplainButton topic="response filters" onAskAbout={onAskAbout} />
        </div>

        {expandedSections.responseFilters && responseFilters.length === 0 && (
          <div style={styles.empty}>No response filters defined</div>
        )}

        {expandedSections.responseFilters && responseFilters.map((filter, i) => (
          <div key={i} style={styles.card}>
            <div style={styles.cardTitle}>
              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{filter.id}</span>
              {filter.unless_grant && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  skip if <span style={styles.grantKey}>{filter.unless_grant}</span>
                </span>
              )}
            </div>
            {filter.description && (
              <div style={styles.cardMeta}>{filter.description}</div>
            )}

            {filter.strip_fields?.length > 0 && (
              <div style={styles.cardDetail}>
                <strong>Strip: </strong>
                {filter.strip_fields.map((f, fi) => (
                  <span key={fi} style={{ ...styles.fieldPath, marginRight: '4px' }}>{f}</span>
                ))}
              </div>
            )}

            {filter.mask_fields?.length > 0 && (
              <div style={styles.cardDetail}>
                <strong>Mask: </strong>
                {filter.mask_fields.map((m, mi) => (
                  <span key={mi} style={{ marginRight: '8px' }}>
                    <span style={styles.fieldPath}>{m.field}</span>
                    <span style={styles.arrow}>&rarr;</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>"{m.mask}"</span>
                  </span>
                ))}
              </div>
            )}

            {filter.tools?.length > 0 && (
              <div style={{ ...styles.cardDetail, marginTop: '6px' }}>
                <strong>Applies to: </strong>
                <div style={styles.tagList}>
                  {filter.tools.map(t => (
                    <span key={t} style={styles.tag}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 5. Context Propagation ───────────────────────────────── */}
      {contextProp && (
        <div style={styles.section}>
          <div
            style={styles.sectionHeader}
            onClick={() => toggleSection('contextPropagation')}
          >
            <div style={styles.sectionTitle}>
              <span style={styles.expandIcon}>
                {expandedSections.contextPropagation ? '▼' : '▶'}
              </span>
              Context Propagation (Handoffs)
            </div>
          </div>

          {expandedSections.contextPropagation && (
            <div style={styles.card}>
              {contextProp.propagate_grants?.length > 0 && (
                <div style={styles.cardDetail}>
                  <strong>Propagate to child skills: </strong>
                  <div style={{ ...styles.tagList, marginTop: '4px' }}>
                    {contextProp.propagate_grants.map(g => (
                      <span key={g} style={styles.grantKey}>{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {contextProp.drop_grants?.length > 0 && (
                <div style={{ ...styles.cardDetail, marginTop: '8px' }}>
                  <strong>Drop on handoff: </strong>
                  <div style={{ ...styles.tagList, marginTop: '4px' }}>
                    {contextProp.drop_grants.map(g => (
                      <span key={g} style={{
                        ...styles.tag,
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        textDecoration: 'line-through'
                      }}>{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
