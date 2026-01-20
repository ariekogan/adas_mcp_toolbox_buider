/**
 * Connector Validation Layer
 *
 * Provides error classification, user-friendly messages, and recovery guidance
 * for MCP connector issues.
 */

/**
 * Error categories with user-friendly messages and recovery steps
 */
const ERROR_PATTERNS = [
  {
    // Command/runtime not found
    patterns: ['command not found', 'ENOENT', 'not found in PATH', 'spawn ENOENT'],
    category: 'runtime_missing',
    title: 'Required software not installed',
    message: 'The connector requires software that is not installed on the server.',
    recovery: [
      'Check if the required runtime (Node.js, Python, Docker) is installed',
      'Verify the command is available in the system PATH',
      'Contact your administrator to install the required software'
    ],
    severity: 'error'
  },
  {
    // Port already in use
    patterns: ['EADDRINUSE', 'address already in use', 'port is already allocated'],
    category: 'port_conflict',
    title: 'Port conflict',
    message: 'The connector tried to use a network port that is already in use.',
    recovery: [
      'The port may be used by another application - check with `lsof -i :PORT`',
      'If this connector supports it, a different port will be auto-assigned',
      'Try disconnecting other connectors that might be using the same port',
      'Restart the application if the issue persists'
    ],
    severity: 'error'
  },
  {
    // Timeout waiting for response
    patterns: ['timeout', 'ETIMEDOUT', 'Request timeout'],
    category: 'timeout',
    title: 'Connection timeout',
    message: 'The connector did not respond in time. It may be starting slowly or waiting for authentication.',
    recovery: [
      'Check if authentication credentials are correct',
      'The connector may require manual setup first',
      'Try again - some connectors are slow to start initially'
    ],
    severity: 'warning'
  },
  {
    // Authentication issues
    patterns: ['auth', 'unauthorized', '401', 'forbidden', '403', 'credentials', 'invalid.*token', 'invalid.*key'],
    category: 'auth_failed',
    title: 'Authentication failed',
    message: 'The connector could not authenticate with the service.',
    recovery: [
      'Verify your credentials are correct',
      'Check if the API key or token has expired',
      'Ensure the account has the required permissions'
    ],
    severity: 'error'
  },
  {
    // Process crashed
    patterns: ['process terminated', 'exited with code', 'SIGTERM', 'SIGKILL', 'crashed'],
    category: 'process_crash',
    title: 'Connector crashed',
    message: 'The connector process stopped unexpectedly.',
    recovery: [
      'Check if all required environment variables are set',
      'The connector may have a bug or compatibility issue',
      'Try disconnecting and reconnecting'
    ],
    severity: 'error'
  },
  {
    // Network/connection issues
    patterns: ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'network', 'socket hang up'],
    category: 'network_error',
    title: 'Network error',
    message: 'Could not establish a network connection.',
    recovery: [
      'Check your internet connection',
      'Verify the service is online and accessible',
      'Check if a firewall is blocking the connection'
    ],
    severity: 'error'
  },
  {
    // npm/package issues
    patterns: ['npm error', 'npm ERR', 'E404', 'package.*not found', 'ERESOLVE'],
    category: 'package_error',
    title: 'Package installation failed',
    message: 'Could not install the required package.',
    recovery: [
      'Check your internet connection',
      'The package may have been removed or renamed',
      'Try again later - npm may be experiencing issues'
    ],
    severity: 'error'
  },
  {
    // Permission issues
    patterns: ['EACCES', 'permission denied', 'EPERM'],
    category: 'permission_error',
    title: 'Permission denied',
    message: 'The connector does not have permission to perform the required action.',
    recovery: [
      'Check file and folder permissions',
      'The connector may need elevated privileges',
      'Contact your administrator'
    ],
    severity: 'error'
  }
];

/**
 * Default error info when no pattern matches
 */
const DEFAULT_ERROR = {
  category: 'unknown',
  title: 'Connection failed',
  message: 'An unexpected error occurred while connecting.',
  recovery: [
    'Try disconnecting and reconnecting',
    'Check the connector configuration',
    'Contact support if the issue persists'
  ],
  severity: 'error'
};

/**
 * Classify an error and return user-friendly information
 *
 * @param {Error|string} error - The error to classify
 * @param {object} context - Additional context (connector name, etc.)
 * @returns {object} Classified error with user-friendly message and recovery steps
 */
export function classifyError(error, context = {}) {
  const errorString = (error?.message || error || '').toLowerCase();
  const errorStack = (error?.stack || '').toLowerCase();
  const fullError = `${errorString} ${errorStack}`;

  // Find matching error pattern
  for (const pattern of ERROR_PATTERNS) {
    const matches = pattern.patterns.some(p => {
      if (p.includes('.*')) {
        // Regex pattern
        return new RegExp(p, 'i').test(fullError);
      }
      return fullError.includes(p.toLowerCase());
    });

    if (matches) {
      return {
        ...pattern,
        originalError: error?.message || error,
        context,
        timestamp: new Date().toISOString()
      };
    }
  }

  // No pattern matched
  return {
    ...DEFAULT_ERROR,
    originalError: error?.message || error,
    context,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format error for API response
 *
 * @param {object} classifiedError - Output from classifyError()
 * @returns {object} Formatted error for API response
 */
export function formatErrorResponse(classifiedError) {
  return {
    success: false,
    error: {
      category: classifiedError.category,
      title: classifiedError.title,
      message: classifiedError.message,
      recovery: classifiedError.recovery,
      severity: classifiedError.severity,
      details: classifiedError.originalError
    }
  };
}

/**
 * Check if an error is recoverable (user can retry after fixing something)
 *
 * @param {object} classifiedError - Output from classifyError()
 * @param {object} options - Additional options
 * @param {boolean} options.hasPortConfig - Whether the connector has port auto-assignment
 * @returns {boolean}
 */
export function isRecoverable(classifiedError, options = {}) {
  // Port conflicts are recoverable if connector supports auto-assignment
  if (classifiedError.category === 'port_conflict' && options.hasPortConfig) {
    return true;
  }

  const nonRecoverable = ['port_conflict', 'package_error'];
  return !nonRecoverable.includes(classifiedError.category);
}

/**
 * Get connector status based on error
 *
 * @param {object} classifiedError - Output from classifyError()
 * @returns {string} Status: 'available', 'unavailable', 'auth_required', 'error'
 */
export function getStatusFromError(classifiedError) {
  switch (classifiedError.category) {
    case 'auth_failed':
    case 'timeout': // Often auth-related
      return 'auth_required';
    case 'runtime_missing':
    case 'port_conflict':
    case 'package_error':
      return 'unavailable';
    default:
      return 'error';
  }
}

export default {
  classifyError,
  formatErrorResponse,
  isRecoverable,
  getStatusFromError,
  ERROR_PATTERNS
};
