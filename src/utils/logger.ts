// Production-safe logger utility with data sanitization
const IS_DEVELOPMENT = import.meta.env.DEV;

// Sensitive field patterns to redact
const SENSITIVE_FIELDS = [
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'accessToken', 'refreshToken', 'sessionId', 'ssn',
  'creditCard', 'cvv', 'pin', 'privateKey'
];

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
 * Determine if logging should be enabled
 */
const shouldLog = (): boolean => IS_DEVELOPMENT || isDebugModeEnabled();

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
   * Shown in development or when debug mode is enabled
   */
  debug: (message: string, ...args: any[]) => {
    if (shouldLog()) {
      console.log(`[DEBUG] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Information logging (with sanitization)
   * Shown in development or when debug mode is enabled
   */
  info: (message: string, ...args: any[]) => {
    if (shouldLog()) {
      console.log(`[INFO] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Warning messages (shown in both dev and production, with sanitization)
   */
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...sanitizeArgs(args));
  },

  /**
   * Error messages (always shown, with sanitization)
   */
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...sanitizeArgs(args));
  },

  /**
   * Success messages (with sanitization)
   * Shown in development or when debug mode is enabled
   */
  success: (message: string, ...args: any[]) => {
    if (shouldLog()) {
      console.log(`[SUCCESS] ✅ ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Sync-related logging (with sanitization)
   * Shown in development or when debug mode is enabled
   */
  sync: (message: string, ...args: any[]) => {
    if (shouldLog()) {
      console.log(`[SYNC] 🔄 ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Performance timing
   * Shown in development or when debug mode is enabled
   */
  time: (label: string) => {
    if (shouldLog()) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (shouldLog()) {
      console.timeEnd(label);
    }
  },

  /**
   * Group logging
   * Shown in development or when debug mode is enabled
   */
  group: (label: string) => {
    if (shouldLog()) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (shouldLog()) {
      console.groupEnd();
    }
  },

  /**
   * Enable debug mode in production
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
   * Disable debug mode
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