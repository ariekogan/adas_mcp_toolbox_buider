/**
 * SolutionPanel — Displays solution-level architecture
 *
 * Replaces SkillPanel when a solution is selected.
 * Shows topology view, grants, handoffs, routing, security contracts, and validation.
 */

import { useState, useEffect } from 'react';
import * as api from '../api/client';

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
    borderLeft: '1px solid var(--border)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    padding: '0 16px',
  },
  tab: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    borderBottom: '2px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
  },
  tabActive: {
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    marginLeft: '8px',
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  // Topology
  topologyContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    padding: '16px 0',
  },
  skillBox: {
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: '12px',
    padding: '16px',
    minWidth: '180px',
    position: 'relative',
  },
  skillBoxName: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '4px',
  },
  skillBoxRole: {
    fontSize: '11px',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  skillBoxChannels: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px',
  },
  // Arrows
  arrowContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
  },
  arrow: {
    fontSize: '18px',
    color: 'var(--accent)',
  },
  arrowLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  // Validation
  validationError: {
    background: 'var(--error)10',
    border: '1px solid var(--error)30',
    borderRadius: '6px',
    padding: '8px 12px',
    marginBottom: '6px',
    fontSize: '13px',
    color: 'var(--error)',
  },
  validationWarning: {
    background: '#f59e0b10',
    border: '1px solid #f59e0b30',
    borderRadius: '6px',
    padding: '8px 12px',
    marginBottom: '6px',
    fontSize: '13px',
    color: '#f59e0b',
  },
  validationOk: {
    background: '#10b98110',
    border: '1px solid #10b98130',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '14px',
    color: '#10b981',
    textAlign: 'center',
  },
};

const ROLE_COLORS = {
  gateway: { bg: '#f59e0b20', color: '#f59e0b' },
  worker: { bg: '#3b82f620', color: '#60a5fa' },
  orchestrator: { bg: '#8b5cf620', color: '#a78bfa' },
  approval: { bg: '#10b98120', color: '#34d399' },
};

const TABS = ['Topology', 'Skills', 'Grants', 'Handoffs', 'Routing', 'Security', 'Validation'];

export default function SolutionPanel({ solution }) {
  const [activeTab, setActiveTab] = useState('Topology');
  const [validation, setValidation] = useState(null);

  useEffect(() => {
    if (solution?.id && activeTab === 'Validation') {
      api.validateSolution(solution.id).then(setValidation).catch(console.error);
    }
  }, [solution?.id, activeTab]);

  if (!solution) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>Select a solution to view its architecture</div>
      </div>
    );
  }

  const skills = solution.skills || [];
  const grants = solution.grants || [];
  const handoffs = solution.handoffs || [];
  const routing = solution.routing || {};
  const contracts = solution.security_contracts || [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>★ {solution.name}</div>
        <div style={styles.subtitle}>
          {skills.length} skills · {grants.length} grants · {handoffs.length} handoffs
        </div>
      </div>

      <div style={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === 'Topology' && <TopologyView skills={skills} handoffs={handoffs} routing={routing} />}
        {activeTab === 'Skills' && <SkillsView skills={skills} />}
        {activeTab === 'Grants' && <GrantsView grants={grants} />}
        {activeTab === 'Handoffs' && <HandoffsView handoffs={handoffs} />}
        {activeTab === 'Routing' && <RoutingView routing={routing} />}
        {activeTab === 'Security' && <SecurityView contracts={contracts} />}
        {activeTab === 'Validation' && <ValidationView solution={solution} validation={validation} />}
      </div>
    </div>
  );
}

function TopologyView({ skills, handoffs, routing }) {
  return (
    <div>
      <div style={styles.sectionTitle}>Skill Topology</div>
      <div style={styles.topologyContainer}>
        {skills.map(skill => {
          const roleColor = ROLE_COLORS[skill.role] || ROLE_COLORS.worker;
          return (
            <div key={skill.id} style={styles.skillBox}>
              <div style={styles.skillBoxName}>{skill.id}</div>
              <span style={{
                ...styles.skillBoxRole,
                ...styles.badge,
                background: roleColor.bg,
                color: roleColor.color,
                marginLeft: 0,
              }}>
                {skill.role}
              </span>
              {skill.description && (
                <div style={{ ...styles.cardMeta, marginTop: '8px' }}>
                  {skill.description}
                </div>
              )}
              {skill.entry_channels?.length > 0 && (
                <div style={styles.skillBoxChannels}>
                  📡 {skill.entry_channels.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {handoffs.length > 0 && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: '16px' }}>Handoff Flows</div>
          {handoffs.map(handoff => (
            <div key={handoff.id} style={styles.arrowContainer}>
              <strong>{handoff.from}</strong>
              <span style={styles.arrow}>→</span>
              <strong>{handoff.to}</strong>
              <span style={styles.arrowLabel}>
                ({(handoff.grants_passed || []).join(', ')})
              </span>
            </div>
          ))}
        </>
      )}

      {Object.keys(routing).length > 0 && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: '16px' }}>Channel Entry Points</div>
          {Object.entries(routing).map(([channel, config]) => (
            <div key={channel} style={styles.arrowContainer}>
              <span>📡 {channel}</span>
              <span style={styles.arrow}>→</span>
              <strong>{config.default_skill}</strong>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SkillsView({ skills }) {
  if (skills.length === 0) return <div style={styles.empty}>No skills defined yet</div>;

  return (
    <div>
      {skills.map(skill => {
        const roleColor = ROLE_COLORS[skill.role] || ROLE_COLORS.worker;
        return (
          <div key={skill.id} style={styles.card}>
            <div style={styles.cardTitle}>
              {skill.id}
              <span style={{
                ...styles.badge,
                background: roleColor.bg,
                color: roleColor.color,
              }}>
                {skill.role}
              </span>
            </div>
            <div style={styles.cardMeta}>
              {skill.description}
              {skill.entry_channels?.length > 0 && (
                <span> · Channels: {skill.entry_channels.join(', ')}</span>
              )}
              {skill.connectors?.length > 0 && (
                <span> · Connectors: {skill.connectors.join(', ')}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GrantsView({ grants }) {
  if (grants.length === 0) return <div style={styles.empty}>No grants defined yet</div>;

  return (
    <div>
      {grants.map(grant => (
        <div key={grant.key} style={styles.card}>
          <div style={styles.cardTitle}>
            <code>{grant.key}</code>
            {grant.internal && (
              <span style={{ ...styles.badge, background: '#6b728020', color: '#9ca3af' }}>
                internal
              </span>
            )}
          </div>
          <div style={styles.cardMeta}>
            {grant.description}
            <br />
            Issued by: {(grant.issued_by || []).join(', ') || 'none'} ·
            Consumed by: {(grant.consumed_by || []).join(', ') || 'none'}
            {grant.ttl_seconds && <span> · TTL: {grant.ttl_seconds}s</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function HandoffsView({ handoffs }) {
  if (handoffs.length === 0) return <div style={styles.empty}>No handoffs defined yet</div>;

  return (
    <div>
      {handoffs.map(handoff => (
        <div key={handoff.id} style={styles.card}>
          <div style={styles.cardTitle}>
            {handoff.from} → {handoff.to}
            <span style={{ ...styles.badge, background: '#3b82f620', color: '#60a5fa' }}>
              {handoff.mechanism || 'internal'}
            </span>
          </div>
          <div style={styles.cardMeta}>
            Trigger: {handoff.trigger}
            <br />
            Passes: {(handoff.grants_passed || []).join(', ') || 'none'}
            {handoff.grants_dropped?.length > 0 && (
              <span> · Drops: {handoff.grants_dropped.join(', ')}</span>
            )}
            {handoff.ttl_seconds && <span> · TTL: {handoff.ttl_seconds}s</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoutingView({ routing }) {
  const entries = Object.entries(routing);
  if (entries.length === 0) return <div style={styles.empty}>No routing configured yet</div>;

  return (
    <div>
      {entries.map(([channel, config]) => (
        <div key={channel} style={styles.card}>
          <div style={styles.cardTitle}>
            📡 {channel}
          </div>
          <div style={styles.cardMeta}>
            Default skill: <strong>{config.default_skill}</strong>
            {config.description && <span> · {config.description}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SecurityView({ contracts }) {
  if (contracts.length === 0) return <div style={styles.empty}>No security contracts defined yet</div>;

  return (
    <div>
      {contracts.map((contract, i) => (
        <div key={i} style={styles.card}>
          <div style={styles.cardTitle}>
            {contract.name}
          </div>
          <div style={styles.cardMeta}>
            Consumer: {contract.consumer} · Provider: {contract.provider}
            <br />
            Requires: {(contract.requires_grants || []).join(', ')}
            {contract.for_tools?.length > 0 && (
              <span> · Tools: {contract.for_tools.join(', ')}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ValidationView({ solution, validation }) {
  if (!validation) return <div style={styles.empty}>Loading validation...</div>;

  const { errors, warnings, summary } = validation;

  return (
    <div>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Summary</div>
        <div style={styles.card}>
          <div style={styles.cardMeta}>
            {summary.skills} skills · {summary.grants} grants · {summary.handoffs} handoffs ·
            {summary.channels} channels · {summary.security_contracts} contracts
          </div>
        </div>
      </div>

      {errors.length === 0 && warnings.length === 0 && (
        <div style={styles.validationOk}>
          ✓ All cross-skill contracts are valid
        </div>
      )}

      {errors.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Errors ({errors.length})</div>
          {errors.map((error, i) => (
            <div key={i} style={styles.validationError}>
              ✕ {error.message}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Warnings ({warnings.length})</div>
          {warnings.map((warning, i) => (
            <div key={i} style={styles.validationWarning}>
              ⚠ {warning.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
