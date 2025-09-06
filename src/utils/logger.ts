// Production-safe logger utility
const IS_DEVELOPMENT = import.meta.env.DEV;

export const logger = {
  /**
   * Development-only debug logging
   */
  debug: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  /**
   * Information logging (shown in development, minimal in production)
   */
  info: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },

  /**
   * Warning messages (shown in both dev and production)
   */
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  /**
   * Error messages (always shown)
   */
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },

  /**
   * Success messages (development only)
   */
  success: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[SUCCESS] ✅ ${message}`, ...args);
    }
  },

  /**
   * Sync-related logging (development only)
   */
  sync: (message: string, ...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log(`[SYNC] 🔄 ${message}`, ...args);
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