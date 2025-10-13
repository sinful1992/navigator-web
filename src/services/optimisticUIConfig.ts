// src/services/optimisticUIConfig.ts
/**
 * Optimistic UI Configuration Manager
 *
 * Centralized configuration for the optimistic UI system.
 * Allows easy enable/disable and configuration updates.
 *
 * Feature: Optimistic UI with Change Tracking (DISABLED by default)
 */

import { optimisticUI } from './optimisticUI';
import { changeTracker } from './changeTracker';
import { logger } from '../utils/logger';

export interface OptimisticUISystemConfig {
  enabled: boolean;

  // Change tracker settings
  changeTracker: {
    ttlMs: number;                 // How long to keep change records
    maxChanges: number;            // Maximum number of changes to track
    syncWindowMs: number;          // How long to wait before assuming sync complete
  };

  // Optimistic UI settings
  optimisticUI: {
    maxPendingUpdates: number;     // Max concurrent pending updates
    updateTimeoutMs: number;       // How long before marking as failed
    autoRetry: boolean;            // Auto-retry failed updates
    maxRetries: number;            // Maximum retry attempts
  };

  // Echo filter settings
  echoFilter: {
    deviceIdCheck: boolean;        // Enable device ID based filtering
    timestampCheck: boolean;       // Enable timestamp heuristic filtering
    timestampThresholdMs: number;  // Threshold for timestamp-based echo detection
    trackerCheck: boolean;         // Enable change tracker based filtering
  };
}

const DEFAULT_CONFIG: OptimisticUISystemConfig = {
  enabled: false, // DISABLED by default - must be explicitly enabled

  changeTracker: {
    ttlMs: 5 * 60 * 1000,          // 5 minutes
    maxChanges: 1000,
    syncWindowMs: 10 * 1000,       // 10 seconds
  },

  optimisticUI: {
    maxPendingUpdates: 100,
    updateTimeoutMs: 30 * 1000,    // 30 seconds
    autoRetry: true,
    maxRetries: 3,
  },

  echoFilter: {
    deviceIdCheck: true,
    timestampCheck: true,
    timestampThresholdMs: 100,     // 100ms
    trackerCheck: true,
  },
};

const CONFIG_STORAGE_KEY = 'navigator_optimistic_ui_config';

/**
 * Load configuration from storage
 */
function loadConfig(): OptimisticUISystemConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (error) {
    logger.warn('Failed to load optimistic UI config:', error);
  }
  return DEFAULT_CONFIG;
}

/**
 * Save configuration to storage
 */
function saveConfig(config: OptimisticUISystemConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    logger.info('✅ Optimistic UI config saved');
  } catch (error) {
    logger.error('Failed to save optimistic UI config:', error);
  }
}

let currentConfig: OptimisticUISystemConfig = loadConfig();

/**
 * Get current configuration
 */
export function getConfig(): OptimisticUISystemConfig {
  return { ...currentConfig };
}

/**
 * Update configuration
 */
export async function updateConfig(updates: Partial<OptimisticUISystemConfig>): Promise<void> {
  const newConfig: OptimisticUISystemConfig = {
    ...currentConfig,
    ...updates,
  };

  // Apply nested updates properly
  if (updates.changeTracker) {
    newConfig.changeTracker = { ...currentConfig.changeTracker, ...updates.changeTracker };
  }
  if (updates.optimisticUI) {
    newConfig.optimisticUI = { ...currentConfig.optimisticUI, ...updates.optimisticUI };
  }
  if (updates.echoFilter) {
    newConfig.echoFilter = { ...currentConfig.echoFilter, ...updates.echoFilter };
  }

  currentConfig = newConfig;
  saveConfig(currentConfig);

  // Apply to subsystems
  await applyConfig(currentConfig);

  logger.info('✅ Optimistic UI configuration updated:', currentConfig);
}

/**
 * Apply configuration to all subsystems
 */
async function applyConfig(config: OptimisticUISystemConfig): Promise<void> {
  // Update change tracker
  await changeTracker.updateConfig({
    enabled: config.enabled,
    ttlMs: config.changeTracker.ttlMs,
    maxChanges: config.changeTracker.maxChanges,
    syncWindowMs: config.changeTracker.syncWindowMs,
  });

  // Update optimistic UI
  optimisticUI.updateConfig({
    enabled: config.enabled,
    maxPendingUpdates: config.optimisticUI.maxPendingUpdates,
    updateTimeoutMs: config.optimisticUI.updateTimeoutMs,
    autoRetry: config.optimisticUI.autoRetry,
    maxRetries: config.optimisticUI.maxRetries,
  });
}

/**
 * Enable the optimistic UI system
 */
export async function enable(): Promise<void> {
  logger.info('⚙️ Enabling optimistic UI system...');

  currentConfig.enabled = true;
  saveConfig(currentConfig);

  // Enable change tracker first (required dependency)
  await changeTracker.enable();

  // Enable optimistic UI
  await optimisticUI.enable();

  logger.info('✅ Optimistic UI system ENABLED');
}

/**
 * Disable the optimistic UI system
 */
export async function disable(): Promise<void> {
  logger.info('⚙️ Disabling optimistic UI system...');

  currentConfig.enabled = false;
  saveConfig(currentConfig);

  // Disable optimistic UI
  optimisticUI.disable();

  // Disable change tracker
  await changeTracker.disable();

  logger.info('❌ Optimistic UI system DISABLED');
}

/**
 * Check if the system is enabled
 */
export function isEnabled(): boolean {
  return currentConfig.enabled && changeTracker.isEnabled() && optimisticUI.isEnabled();
}

/**
 * Reset configuration to defaults
 */
export async function resetToDefaults(): Promise<void> {
  logger.info('⚙️ Resetting optimistic UI configuration to defaults...');

  currentConfig = { ...DEFAULT_CONFIG };
  saveConfig(currentConfig);
  await applyConfig(currentConfig);

  logger.info('✅ Optimistic UI configuration reset to defaults');
}

/**
 * Get system statistics for debugging
 */
export async function getSystemStats() {
  const changeTrackerStats = await changeTracker.getStats();
  const optimisticUIStats = optimisticUI.getStats();

  return {
    enabled: isEnabled(),
    config: currentConfig,
    changeTracker: changeTrackerStats,
    optimisticUI: optimisticUIStats,
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: Partial<OptimisticUISystemConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.changeTracker) {
    if (config.changeTracker.ttlMs && config.changeTracker.ttlMs < 1000) {
      errors.push('changeTracker.ttlMs must be at least 1000ms (1 second)');
    }
    if (config.changeTracker.maxChanges && config.changeTracker.maxChanges < 10) {
      errors.push('changeTracker.maxChanges must be at least 10');
    }
    if (config.changeTracker.syncWindowMs && config.changeTracker.syncWindowMs < 100) {
      errors.push('changeTracker.syncWindowMs must be at least 100ms');
    }
  }

  if (config.optimisticUI) {
    if (config.optimisticUI.maxPendingUpdates && config.optimisticUI.maxPendingUpdates < 1) {
      errors.push('optimisticUI.maxPendingUpdates must be at least 1');
    }
    if (config.optimisticUI.updateTimeoutMs && config.optimisticUI.updateTimeoutMs < 1000) {
      errors.push('optimisticUI.updateTimeoutMs must be at least 1000ms (1 second)');
    }
    if (config.optimisticUI.maxRetries && config.optimisticUI.maxRetries < 0) {
      errors.push('optimisticUI.maxRetries must be non-negative');
    }
  }

  if (config.echoFilter) {
    if (
      config.echoFilter.timestampThresholdMs &&
      config.echoFilter.timestampThresholdMs < 0
    ) {
      errors.push('echoFilter.timestampThresholdMs must be non-negative');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Preset configurations for different use cases
 */
export const PRESETS = {
  /**
   * Conservative: Safer settings with longer timeouts and more retries
   */
  conservative: {
    enabled: true,
    changeTracker: {
      ttlMs: 10 * 60 * 1000,       // 10 minutes
      maxChanges: 500,
      syncWindowMs: 15 * 1000,     // 15 seconds
    },
    optimisticUI: {
      maxPendingUpdates: 50,
      updateTimeoutMs: 60 * 1000,  // 60 seconds
      autoRetry: true,
      maxRetries: 5,
    },
    echoFilter: {
      deviceIdCheck: true,
      timestampCheck: true,
      timestampThresholdMs: 200,   // 200ms (more lenient)
      trackerCheck: true,
    },
  },

  /**
   * Aggressive: Faster, more responsive but less forgiving
   */
  aggressive: {
    enabled: true,
    changeTracker: {
      ttlMs: 2 * 60 * 1000,        // 2 minutes
      maxChanges: 1000,
      syncWindowMs: 5 * 1000,      // 5 seconds
    },
    optimisticUI: {
      maxPendingUpdates: 200,
      updateTimeoutMs: 15 * 1000,  // 15 seconds
      autoRetry: true,
      maxRetries: 2,
    },
    echoFilter: {
      deviceIdCheck: true,
      timestampCheck: true,
      timestampThresholdMs: 50,    // 50ms (strict)
      trackerCheck: true,
    },
  },

  /**
   * Balanced: Default production settings
   */
  balanced: DEFAULT_CONFIG,
};

/**
 * Apply a preset configuration
 */
export async function applyPreset(
  preset: 'conservative' | 'aggressive' | 'balanced'
): Promise<void> {
  logger.info(`⚙️ Applying ${preset} preset...`);

  const presetConfig = PRESETS[preset];
  await updateConfig(presetConfig);

  logger.info(`✅ ${preset} preset applied`);
}

// Initialize on module load
(async () => {
  try {
    await applyConfig(currentConfig);

    if (import.meta.env.DEV) {
      logger.info('Optimistic UI system initialized:', {
        enabled: isEnabled(),
        config: currentConfig,
      });
    }
  } catch (error) {
    logger.error('Failed to initialize optimistic UI system:', error);
  }
})();
