// Production-safe logger utility with data sanitization
const IS_DEVELOPMENT = import.meta.env.DEV;

// Sensitive field patterns to redact
const SENSITIVE_FIELDS = [
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'accessToken', 'refreshToken', 'sessionId', 'ssn',
  'creditCard', 'cvv', 'pin', 'privateKey'
];

// Log levels
type LogLevel = 'silent' | 'normal' | 'verbose';

/**
 * Get current log level from localStorage or return default
 */
function getLogLevel(): LogLevel {
  if (typeof window === 'undefined') return 'normal';

  try {
    const stored = localStorage.getItem('logLevel') as LogLevel;
    if (stored && ['silent', 'normal', 'verbose'].includes(stored)) {
      return stored;
    }
  } catch {
    // Ignore errors
  }

  // Default: normal in development, silent in production
  return IS_DEVELOPMENT ? 'normal' : 'silent';
}

/**
 * Check if debug mode is enabled in production
 * Can be enabled via URL parameter (?debug=true) or localStorage
 */
function isDebugModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  // Check URL parameter
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') return true;
  } catch {
    // Ignore errors
  }

  // Check localStorage
  try {
    return localStorage.getItem('debugMode') === 'true';
  } catch {
    return false;
  }
}

/**
 * Determine if verbose logging should be enabled
 */
const shouldLogVerbose = (): boolean => {
  const level = getLogLevel();
  return level === 'verbose' || (IS_DEVELOPMENT && isDebugModeEnabled());
};

/**
 * Determine if normal logging should be enabled
 */
const shouldLogNormal = (): boolean => {
  const level = getLogLevel();
  return level !== 'silent';
};

/**
 * Sanitize data to remove sensitive information before logging
 */
function sanitize(data: any): any {
  if (data === null || data === undefined) return data;

  // Handle primitives
  if (typeof data !== 'object') return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item));
  }

  // Handle objects
  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Check if field contains sensitive data
    const isSensitive = SENSITIVE_FIELDS.some(field =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize all arguments passed to logger
 */
function sanitizeArgs(args: any[]): any[] {
  return args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return sanitize(arg);
    }
    return arg;
  });
}

export const logger = {
  /**
   * Debug logging (with sanitization)
   * Only shown when log level is 'verbose'
   */
  debug: (message: string, ...args: any[]) => {
    if (shouldLogVerbose()) {
      console.log(`[DEBUG] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Information logging (with sanitization)
   * Only shown when log level is 'verbose'
   */
  info: (message: string, ...args: any[]) => {
    if (shouldLogVerbose()) {
      console.log(`[INFO] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Warning messages (shown in normal and verbose modes, with sanitization)
   */
  warn: (message: string, ...args: any[]) => {
    if (shouldLogNormal()) {
      console.warn(`[WARN] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Error messages (always shown, with sanitization)
   */
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...sanitizeArgs(args));
  },

  /**
   * Success messages (with sanitization)
   * Only shown when log level is 'verbose'
   */
  success: (message: string, ...args: any[]) => {
    if (shouldLogVerbose()) {
      console.log(`[SUCCESS] ✅ ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Sync-related logging (with sanitization)
   * Only shown when log level is 'verbose'
   */
  sync: (message: string, ...args: any[]) => {
    if (shouldLogVerbose()) {
      console.log(`[SYNC] 🔄 ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Performance timing
   * Only shown when log level is 'verbose'
   */
  time: (label: string) => {
    if (shouldLogVerbose()) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (shouldLogVerbose()) {
      console.timeEnd(label);
    }
  },

  /**
   * Group logging
   * Only shown when log level is 'verbose'
   */
  group: (label: string) => {
    if (shouldLogVerbose()) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (shouldLogVerbose()) {
      console.groupEnd();
    }
  },

  /**
   * Set log level
   * @param level - 'silent' (errors only), 'normal' (errors + warnings), 'verbose' (everything)
   */
  setLevel: (level: LogLevel) => {
    try {
      localStorage.setItem('logLevel', level);
      console.log(`[LOG LEVEL] Set to '${level}' - Refresh the page to apply`);
    } catch (e) {
      console.error('[LOG LEVEL] Failed to set:', e);
    }
  },

  /**
   * Get current log level
   */
  getLevel: (): LogLevel => {
    return getLogLevel();
  },

  /**
   * Enable debug mode in production (LEGACY - use setLevel('verbose') instead)
   * Sets localStorage flag and logs confirmation
   */
  enableDebugMode: () => {
    try {
      localStorage.setItem('debugMode', 'true');
      console.log('[DEBUG MODE] ✅ Enabled - Refresh the page to see all logs');
    } catch (e) {
      console.error('[DEBUG MODE] ❌ Failed to enable:', e);
    }
  },

  /**
   * Disable debug mode (LEGACY - use setLevel('normal') instead)
   * Removes localStorage flag and logs confirmation
   */
  disableDebugMode: () => {
    try {
      localStorage.removeItem('debugMode');
      console.log('[DEBUG MODE] ❌ Disabled - Refresh the page');
    } catch (e) {
      console.error('[DEBUG MODE] Failed to disable:', e);
    }
  },

  /**
   * Check if debug mode is currently active
   */
  isDebugMode: (): boolean => {
    return isDebugModeEnabled();
  }
};

// Legacy console replacement for easy migration
export const devConsole = {
  log: logger.debug,
  info: logger.info,
  warn: logger.warn,
  error: logger.error
};

// Expose logger globally for browser console access
if (typeof window !== 'undefined') {
  (window as any).logger = logger;
}