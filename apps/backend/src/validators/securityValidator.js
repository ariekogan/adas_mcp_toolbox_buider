/**
 * Security Validator - validates Identity & Access Control configuration
 * @module validators/securityValidator
 */

/**
 * @typedef {import('../types/DraftDomain.js').DraftDomain} DraftDomain
 * @typedef {import('../types/DraftDomain.js').ValidationIssue} ValidationIssue
 */

/**
 * Classifications that REQUIRE an access policy rule.
 * Tools with these classifications produce errors if uncovered.
 */
const HIGH_RISK_CLASSIFICATIONS = ['pii_write', 'financial', 'destructive'];

/**
 * Classifications that RECOMMEND response filters.
 * Tools with these classifications produce warnings if they lack filters.
 */
const PII_CLASSIFICATIONS = ['pii_read', 'pii_write'];

/**
 * Valid security classification values.
 */
const VALID_CLASSIFICATIONS = ['public', 'pii_read', 'pii_write', 'financial', 'destructive'];

/**
 * Valid risk levels.
 */
const VALID_RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

/**
 * Valid access policy effects.
 */
const VALID_EFFECTS = ['allow', 'deny', 'constrain'];

/**
 * Regex for syntactically valid field paths used in response filters.
 * Allows dotted identifiers and bracket notation, e.g. "customer.address.line1" or "items[0].name".
 */
const FIELD_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\])*$/;

/**
 * Coverage metadata for auto-generating documentation
 * @type {Array<{section: string, field: string, check: string, type: string}>}
 */
export const COVERAGE = [
  { section: 'security', field: 'tools[].security.classification', check: 'All tools have security classification', type: 'security' },
  { section: 'security', field: 'access_policy.rules[].tools', check: 'High-risk tools covered by access policy', type: 'security' },
  { section: 'security', field: 'response_filters', check: 'PII tools have response filters', type: 'security' },
  { section: 'security', field: 'grant_mappings[].tool', check: 'Grant mappings reference valid tools', type: 'security' },
  { section: 'security', field: 'access_policy.rules[].tools', check: 'Access policy tool references are valid', type: 'security' },
  { section: 'security', field: 'response_filters[].strip_fields', check: 'Response filter field paths are valid', type: 'security' },
  { section: 'security', field: 'response_filters[].mask_fields', check: 'Response filter mask field paths are valid', type: 'security' },
  { section: 'security', field: 'tools[].security.data_owner_field', check: 'Data-owner tools have constrain policy', type: 'security' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Set of all tool names defined on the domain.
 * @param {DraftDomain} domain
 * @returns {Set<string>}
 */
function getToolNameSet(domain) {
  const names = new Set();
  for (const tool of domain.tools || []) {
    if (tool.name) {
      names.add(tool.name);
    }
  }
  return names;
}

/**
 * Build the set of tool names that are covered by at least one access_policy rule.
 * A wildcard "*" entry means every tool is covered.
 * @param {DraftDomain} domain
 * @returns {{ coveredTools: Set<string>, hasWildcard: boolean }}
 */
function getAccessPolicyCoverage(domain) {
  const coveredTools = new Set();
  let hasWildcard = false;

  const rules = domain.access_policy?.rules || [];
  for (const rule of rules) {
    for (const toolRef of rule.tools || []) {
      if (toolRef === '*') {
        hasWildcard = true;
      } else {
        coveredTools.add(toolRef);
      }
    }
  }

  return { coveredTools, hasWildcard };
}

/**
 * Build the set of tool names that are covered by at least one response_filter.
 * Response filters apply broadly (not per-tool), so we track their existence.
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
function hasResponseFilters(domain) {
  return Array.isArray(domain.response_filters) && domain.response_filters.length > 0;
}

/**
 * Determine whether a constrain rule exists that injects a given field name.
 * A constrain rule is an access_policy rule with effect "constrain" whose
 * `constrain` object references the field (by key or value_from).
 * @param {DraftDomain} domain
 * @param {string} toolName
 * @param {string} fieldName
 * @returns {boolean}
 */
function hasConstrainPolicyForField(domain, toolName, fieldName) {
  const rules = domain.access_policy?.rules || [];
  for (const rule of rules) {
    if (rule.effect !== 'constrain') continue;

    // Rule must apply to this tool (or wildcard)
    const appliesToTool =
      (rule.tools || []).includes('*') ||
      (rule.tools || []).includes(toolName);
    if (!appliesToTool) continue;

    // Check if the constrain object references the field
    const constrain = rule.constrain || {};
    for (const [key, value] of Object.entries(constrain)) {
      if (key === fieldName || value === fieldName) return true;
    }
  }

  // Also check grant_mappings that reference this tool and field
  for (const mapping of domain.grant_mappings || []) {
    if (mapping.tool !== toolName) continue;
    for (const grant of mapping.grants || []) {
      if (grant.value_from === fieldName) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

/**
 * Validate security configuration of a domain.
 *
 * Checks:
 * 1. All high-risk tools (pii_write, financial, destructive) have access policies
 * 2. All pii_read tools have response filters or access policies
 * 3. Grant mappings reference valid tool names
 * 4. Access policy tool references are valid
 * 5. Response filter field paths are syntactically valid
 * 6. Tools with data_owner_field have corresponding grant mappings or access policies
 *    that constrain by that field
 *
 * @param {DraftDomain} domain
 * @returns {ValidationIssue[]} Array of issues (errors and warnings)
 */
export function validateSecurity(domain) {
  const issues = [];

  const tools = domain.tools || [];
  const toolNames = getToolNameSet(domain);
  const { coveredTools, hasWildcard } = getAccessPolicyCoverage(domain);
  const domainHasFilters = hasResponseFilters(domain);

  // -----------------------------------------------------------------------
  // 1 & 2 & 6  Per-tool checks
  // -----------------------------------------------------------------------
  tools.forEach((tool, i) => {
    const basePath = `tools[${i}]`;
    const classification = tool.security?.classification;
    const risk = tool.security?.risk;
    const dataOwnerField = tool.security?.data_owner_field;

    // Warn on unclassified tools
    if (!classification) {
      issues.push({
        code: 'UNCLASSIFIED_TOOL',
        severity: 'warning',
        path: `${basePath}.security.classification`,
        message: `Tool "${tool.name}" has no security classification`,
        suggestion: 'Assign a classification (public, pii_read, pii_write, financial, destructive)',
      });
      return; // skip further security checks for this tool
    }

    // Validate classification value
    if (!VALID_CLASSIFICATIONS.includes(classification)) {
      issues.push({
        code: 'INVALID_CLASSIFICATION',
        severity: 'error',
        path: `${basePath}.security.classification`,
        message: `Tool "${tool.name}" has invalid classification "${classification}"`,
        suggestion: `Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`,
      });
    }

    // Validate risk value if present
    if (risk && !VALID_RISK_LEVELS.includes(risk)) {
      issues.push({
        code: 'INVALID_RISK_LEVEL',
        severity: 'error',
        path: `${basePath}.security.risk`,
        message: `Tool "${tool.name}" has invalid risk level "${risk}"`,
        suggestion: `Must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
      });
    }

    // Check 1: High-risk tools must have an access policy
    if (HIGH_RISK_CLASSIFICATIONS.includes(classification)) {
      const covered = hasWildcard || coveredTools.has(tool.name);
      if (!covered) {
        issues.push({
          code: 'HIGH_RISK_NO_POLICY',
          severity: 'error',
          path: `${basePath}.security`,
          message: `High-risk tool "${tool.name}" (${classification}) has no access policy`,
          suggestion: 'Add an access_policy rule covering this tool',
        });
      }
    }

    // Check 2: PII tools should have response filters
    if (PII_CLASSIFICATIONS.includes(classification) && !domainHasFilters) {
      const covered = hasWildcard || coveredTools.has(tool.name);
      // Only warn if also missing from access_policy
      if (!covered) {
        issues.push({
          code: 'PII_NO_FILTER',
          severity: 'warning',
          path: `${basePath}.security`,
          message: `PII tool "${tool.name}" (${classification}) has no response filter or access policy`,
          suggestion: 'Add a response_filter to strip or mask sensitive fields, or add an access_policy rule',
        });
      }
    }

    // Check 6: data_owner_field should have a constrain policy
    if (dataOwnerField && tool.name) {
      if (!hasConstrainPolicyForField(domain, tool.name, dataOwnerField)) {
        issues.push({
          code: 'DATA_OWNER_NO_CONSTRAIN',
          severity: 'warning',
          path: `${basePath}.security.data_owner_field`,
          message: `Tool "${tool.name}" has data_owner_field "${dataOwnerField}" but no constrain policy or grant mapping injects it`,
          suggestion: `Add an access_policy rule with effect "constrain" that references "${dataOwnerField}", or a grant_mapping that captures it`,
        });
      }
    }
  });

  // -----------------------------------------------------------------------
  // 3  Grant mappings reference valid tools
  // -----------------------------------------------------------------------
  (domain.grant_mappings || []).forEach((mapping, i) => {
    if (mapping.tool && !toolNames.has(mapping.tool)) {
      issues.push({
        code: 'GRANT_MAPPING_INVALID_TOOL',
        severity: 'error',
        path: `grant_mappings[${i}].tool`,
        message: `Grant mapping references non-existent tool "${mapping.tool}"`,
        suggestion: 'Update the tool name or define the missing tool',
      });
    }
  });

  // -----------------------------------------------------------------------
  // 4  Access policy tool references are valid
  // -----------------------------------------------------------------------
  (domain.access_policy?.rules || []).forEach((rule, i) => {
    (rule.tools || []).forEach((toolRef, j) => {
      if (toolRef === '*') return; // wildcard is always valid
      if (!toolNames.has(toolRef)) {
        issues.push({
          code: 'ACCESS_POLICY_INVALID_TOOL',
          severity: 'error',
          path: `access_policy.rules[${i}].tools[${j}]`,
          message: `Access policy rule references non-existent tool "${toolRef}"`,
          suggestion: 'Update the tool name or define the missing tool',
        });
      }
    });

    // Validate effect value if present
    if (rule.effect && !VALID_EFFECTS.includes(rule.effect)) {
      issues.push({
        code: 'INVALID_POLICY_EFFECT',
        severity: 'error',
        path: `access_policy.rules[${i}].effect`,
        message: `Access policy rule has invalid effect "${rule.effect}"`,
        suggestion: `Must be one of: ${VALID_EFFECTS.join(', ')}`,
      });
    }
  });

  // -----------------------------------------------------------------------
  // 5  Response filter field paths are syntactically valid
  // -----------------------------------------------------------------------
  (domain.response_filters || []).forEach((filter, i) => {
    const basePath = `response_filters[${i}]`;

    (filter.strip_fields || []).forEach((field, j) => {
      if (!FIELD_PATH_PATTERN.test(field)) {
        issues.push({
          code: 'INVALID_FILTER_FIELD_PATH',
          severity: 'error',
          path: `${basePath}.strip_fields[${j}]`,
          message: `Invalid field path "${field}" in response filter`,
          suggestion: 'Use dotted notation (e.g. "customer.ssn") or bracket notation (e.g. "items[0].name")',
        });
      }
    });

    (filter.mask_fields || []).forEach((field, j) => {
      if (!FIELD_PATH_PATTERN.test(field)) {
        issues.push({
          code: 'INVALID_FILTER_FIELD_PATH',
          severity: 'error',
          path: `${basePath}.mask_fields[${j}]`,
          message: `Invalid field path "${field}" in response filter`,
          suggestion: 'Use dotted notation (e.g. "customer.email") or bracket notation (e.g. "items[0].name")',
        });
      }
    });
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Completeness check
// ---------------------------------------------------------------------------

/**
 * Get security completeness status.
 * Returns true only if all high-risk tools have access policies.
 *
 * @param {DraftDomain} domain
 * @returns {boolean}
 */
export function isSecurityComplete(domain) {
  const tools = domain.tools || [];
  const { coveredTools, hasWildcard } = getAccessPolicyCoverage(domain);

  for (const tool of tools) {
    const classification = tool.security?.classification;
    if (!classification) continue;
    if (!HIGH_RISK_CLASSIFICATIONS.includes(classification)) continue;

    const covered = hasWildcard || coveredTools.has(tool.name);
    if (!covered) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

/**
 * Get security coverage report.
 * Shows which tools are classified, which have policies, etc.
 *
 * @param {DraftDomain} domain
 * @returns {{
 *   total_tools: number,
 *   classified: number,
 *   unclassified: number,
 *   high_risk: number,
 *   high_risk_with_policy: number,
 *   pii_tools: number,
 *   pii_with_filters: number,
 *   grant_mappings_count: number,
 *   access_rules_count: number,
 *   response_filters_count: number
 * }}
 */
export function getSecurityReport(domain) {
  const tools = domain.tools || [];
  const { coveredTools, hasWildcard } = getAccessPolicyCoverage(domain);
  const domainHasFilters = hasResponseFilters(domain);

  let classified = 0;
  let unclassified = 0;
  let highRisk = 0;
  let highRiskWithPolicy = 0;
  let piiTools = 0;
  let piiWithFilters = 0;

  for (const tool of tools) {
    const classification = tool.security?.classification;

    if (!classification) {
      unclassified++;
      continue;
    }

    classified++;

    // High-risk counting
    if (HIGH_RISK_CLASSIFICATIONS.includes(classification)) {
      highRisk++;
      const covered = hasWildcard || coveredTools.has(tool.name);
      if (covered) highRiskWithPolicy++;
    }

    // PII counting
    if (PII_CLASSIFICATIONS.includes(classification)) {
      piiTools++;
      // A PII tool is "covered" if there are response filters OR it has an access policy
      const hasPolicyCoverage = hasWildcard || coveredTools.has(tool.name);
      if (domainHasFilters || hasPolicyCoverage) {
        piiWithFilters++;
      }
    }
  }

  return {
    total_tools: tools.length,
    classified,
    unclassified,
    high_risk: highRisk,
    high_risk_with_policy: highRiskWithPolicy,
    pii_tools: piiTools,
    pii_with_filters: piiWithFilters,
    grant_mappings_count: (domain.grant_mappings || []).length,
    access_rules_count: (domain.access_policy?.rules || []).length,
    response_filters_count: (domain.response_filters || []).length,
  };
}
