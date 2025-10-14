// src/devTools.ts
/**
 * Development Tools
 *
 * Exposes testing and debugging utilities on the window object
 * for easy access in browser console.
 */

import { runSmokeTest, runAllTests } from './services/optimisticUITest';
import {
  enable,
  disable,
  isEnabled,
  getSystemStats,
  applyPreset,
  resetToDefaults,
} from './services/optimisticUIConfig';
import {
  getOptimisticUIStats,
  clearOptimisticUIState,
} from './services/optimisticUIIntegration';
import { changeTracker } from './services/changeTracker';
import { optimisticUI } from './services/optimisticUI';
import { getEchoFilterStats, resetEchoFilterStats } from './utils/echoFilter';

// Define the type for our dev tools
export interface NavigatorDevTools {
  // Testing
  runSmokeTest: () => Promise<boolean>;
  runAllTests: () => Promise<void>;

  // Enable/Disable
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  isEnabled: () => boolean;

  // Stats
  getStats: () => Promise<any>;
  getOptimisticStats: () => any;
  getEchoStats: () => any;

  // Configuration
  applyPreset: (preset: 'conservative' | 'aggressive' | 'balanced') => Promise<void>;
  resetToDefaults: () => Promise<void>;

  // Direct access to services
  changeTracker: typeof changeTracker;
  optimisticUI: typeof optimisticUI;

  // Utilities
  clearAll: () => Promise<void>;
  resetEchoStats: () => void;

  // Help
  help: () => void;
}

/**
 * Help text
 */
function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Navigator Web - Optimistic UI Dev Tools              ║
╚═══════════════════════════════════════════════════════════════╝

🧪 TESTING:
  NavDev.runSmokeTest()    - Quick test (30 seconds)
  NavDev.runAllTests()     - Full test suite (2-3 minutes)

⚙️  ENABLE/DISABLE:
  NavDev.enable()          - Enable Optimistic UI
  NavDev.disable()         - Disable Optimistic UI
  NavDev.isEnabled()       - Check if enabled

📊 STATISTICS:
  NavDev.getStats()        - Get system stats
  NavDev.getOptimisticStats() - Get optimistic UI stats
  NavDev.getEchoStats()    - Get echo filter stats

🎛️  CONFIGURATION:
  NavDev.applyPreset('conservative')  - Apply preset
  NavDev.applyPreset('aggressive')
  NavDev.applyPreset('balanced')
  NavDev.resetToDefaults() - Reset to defaults

🔧 DIRECT ACCESS:
  NavDev.changeTracker     - Change tracker service
  NavDev.optimisticUI      - Optimistic UI manager

🧹 UTILITIES:
  NavDev.clearAll()        - Clear all optimistic state
  NavDev.resetEchoStats()  - Reset echo filter stats

📖 DOCUMENTATION:
  See OPTIMISTIC_UI_GUIDE.md for complete guide

Example usage:
  await NavDev.runSmokeTest();
  await NavDev.enable();
  await NavDev.getStats();
`);
}

/**
 * Create the dev tools object
 */
export const devTools: NavigatorDevTools = {
  // Testing
  runSmokeTest,
  runAllTests,

  // Enable/Disable
  enable,
  disable,
  isEnabled,

  // Stats
  getStats: getSystemStats,
  getOptimisticStats: getOptimisticUIStats,
  getEchoStats: getEchoFilterStats,

  // Configuration
  applyPreset,
  resetToDefaults,

  // Direct access
  changeTracker,
  optimisticUI,

  // Utilities
  clearAll: clearOptimisticUIState,
  resetEchoStats: resetEchoFilterStats,

  // Help
  help: showHelp,
};

/**
 * Install dev tools on window object
 */
export function installDevTools() {
  if (typeof window !== 'undefined') {
    (window as any).NavDev = devTools;
    console.log('✅ Navigator Dev Tools installed - Type "NavDev.help()" for commands');
  }
}

// Auto-install in development mode
if (import.meta.env.DEV) {
  installDevTools();
}
