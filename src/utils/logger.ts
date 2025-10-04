// Production-safe logger utility with data sanitization
const IS_DEVELOPMENT = import.meta.env.DEV;

// Sensitive field patterns to redact
const SENSITIVE_FIELDS = [
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'accessToken', 'refreshToken', 'sessionId', 'ssn',
  'creditCard', 'cvv', 'pin', 'privateKey'
];

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
   * Development-only debug logging (with sanitization)
   */
  debug: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[DEBUG] ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Information logging (shown in development, minimal in production, with sanitization)
   */
  info: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
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
   * Success messages (development only, with sanitization)
   */
  success: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[SUCCESS] ✅ ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Sync-related logging (development only, with sanitization)
   */
  sync: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[SYNC] 🔄 ${message}`, ...sanitizeArgs(args));
    }
  },

  /**
   * Performance timing
   */
  time: (label: string) => {
    if (IS_DEVELOPMENT) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (IS_DEVELOPMENT) {
      console.timeEnd(label);
    }
  },

  /**
   * Group logging (development only)
   */
  group: (label: string) => {
    if (IS_DEVELOPMENT) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (IS_DEVELOPMENT) {
      console.groupEnd();
    }
  }
};

// Legacy console replacement for easy migration
export const devConsole = {
  log: logger.debug,
  info: logger.info,
  warn: logger.warn,
  error: logger.error
};