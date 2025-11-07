// Production-safe logger utility with data sanitization
const IS_DEVELOPMENT = import.meta.env.DEV;

// Sensitive field patterns to redact
const SENSITIVE_FIELDS = [
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'accessToken', 'refreshToken', 'sessionId', 'ssn',
  'creditCard', 'cvv', 'pin', 'privateKey'
];

// Log levels
type LogLevel = 'silent' | 'normal' | 'sync' | 'verbose';

/**
 * Get current log level from localStorage or return default
 */
function getLogLevel(): LogLevel {
  if (typeof window === 'undefined') return 'normal';

  try {
    const stored = localStorage.getItem('logLevel') as LogLevel;
    if (stored && ['silent', 'normal', 'sync', 'verbose'].includes(stored)) {
      return stored;
    }
  } catch {
    // Ignore errors
  }

  // Default: silent everywhere (user must explicitly enable logging)
  // This prevents thousands of sync logs on every refresh
  return 'silent';
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
 * Determine if sync-specific logs should be shown
 * Sync logs are shown at 'sync' or 'verbose' levels
 */
const shouldLogSync = (): boolean => {
  const level = getLogLevel();
  return level === 'sync' || level === 'verbose';
};

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
   * Sync logs require 'sync' or 'verbose' level
   */
  debug: (message: string, ...args: any[]) => {
    // Check if this is a sync-related log
    const isSyncLog = message.includes('AUTO-SYNC') || message.includes('SYNC') || message.includes('UPLOAD');

    // Sync logs require 'sync' or 'verbose' level
    if (isSyncLog) {
      if (shouldLogSync()) {
        console.log(`[DEBUG] ${message}`, ...sanitizeArgs(args));
      }
      return;
    }

    // Non-sync logs require 'verbose' level
    if (shouldLogVerbose()) {
      console.log(`[DEBUG] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Information logging (with sanitization)
   * Only shown when log level is 'verbose'
   * Sync logs require 'sync' or 'verbose' level
   */
  info: (message: string, ...args: any[]) => {
    // Check if this is a sync-related log
    const isSyncLog = message.includes('AUTO-SYNC') || message.includes('SYNC') || message.includes('UPLOAD') || message.includes('BOOTSTRAP') || message.includes('FETCH');

    // Sync logs require 'sync' or 'verbose' level
    if (isSyncLog) {
      if (shouldLogSync()) {
        console.log(`[INFO] ${message}`, ...sanitizeArgs(args));
      }
      return;
    }

    // Non-sync logs require 'verbose' level
    if (shouldLogVerbose()) {
      console.log(`[INFO] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Warning messages (shown in normal and verbose modes, with sanitization)
   * Sync logs require 'sync' or 'verbose' level
   */
  warn: (message: string, ...args: any[]) => {
    // Check if this is a sync-related log
    const isSyncLog = message.includes('AUTO-SYNC') || message.includes('SYNC') || message.includes('NO PROGRESS');

    // Sync logs require 'sync' or 'verbose' level
    if (isSyncLog) {
      if (shouldLogSync()) {
        console.warn(`[WARN] ${message}`, ...sanitizeArgs(args));
      }
      return;
    }

    // Non-sync warnings require 'normal' or higher
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
   * @param level - 'silent' (errors only), 'normal' (errors + warnings), 'sync' (errors + warnings + sync logs), 'verbose' (everything)
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

  // Show helpful message on first load
  const hasSeenLoggerMessage = sessionStorage.getItem('logger_message_shown');
  if (!hasSeenLoggerMessage && IS_DEVELOPMENT) {
    console.log(
      '%c💡 Logging is disabled by default to improve performance',
      'color: #0ea5e9; font-weight: bold; font-size: 12px;'
    );
    console.log(
      '%cTo enable logging, use: %clogger.setLevel("verbose")%c or %clogger.setLevel("sync")',
      'color: #64748b;',
      'color: #10b981; font-weight: bold; background: #f0fdf4; padding: 2px 4px; border-radius: 3px;',
      'color: #64748b;',
      'color: #10b981; font-weight: bold; background: #f0fdf4; padding: 2px 4px; border-radius: 3px;'
    );
    console.log(
      '%cCurrent level: %c' + getLogLevel(),
      'color: #64748b;',
      'color: #8b5cf6; font-weight: bold;'
    );
    sessionStorage.setItem('logger_message_shown', 'true');
  }
}