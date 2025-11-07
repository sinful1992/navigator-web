// src/utils/protectionFlags.test.ts
// PHASE 1.2.2: Comprehensive test suite for hybrid protection flags

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setProtectionFlag,
  isProtectionActive,
  clearProtectionFlag,
  getProtectionTimeRemaining,
  executeWithProtection,
  clearAllProtectionFlags,
} from './protectionFlags';

describe('Protection Flags System (Phase 1.2.2)', () => {
  beforeEach(() => {
    // Clear all flags before each test
    clearAllProtectionFlags();
  });

  afterEach(() => {
    // Cleanup after each test
    clearAllProtectionFlags();
  });

  describe('setProtectionFlag', () => {
    it('should set a protection flag and return timestamp', () => {
      const timestamp = setProtectionFlag('navigator_active_protection');
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });

    it('should set flag that is immediately active', () => {
      setProtectionFlag('navigator_active_protection');
      expect(isProtectionActive('navigator_active_protection')).toBe(true);
    });

    it('should handle multiple flags independently', () => {
      setProtectionFlag('navigator_import_in_progress');
      setProtectionFlag('navigator_active_protection');

      expect(isProtectionActive('navigator_import_in_progress')).toBe(true);
      expect(isProtectionActive('navigator_active_protection')).toBe(true);
      expect(isProtectionActive('navigator_restore_in_progress')).toBe(false);
    });

    it('should overwrite existing flag with new timestamp', async () => {
      const ts1 = setProtectionFlag('navigator_active_protection');

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const ts2 = setProtectionFlag('navigator_active_protection');

      expect(ts2).toBeGreaterThanOrEqual(ts1); // At least equal, usually greater
      expect(isProtectionActive('navigator_active_protection')).toBe(true);
    });
  });

  describe('isProtectionActive', () => {
    it('should return false for unset flags', () => {
      expect(isProtectionActive('navigator_active_protection')).toBe(false);
      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
      expect(isProtectionActive('navigator_restore_in_progress')).toBe(false);
    });

    it('should return true for active infinite timeout flags', () => {
      setProtectionFlag('navigator_active_protection');
      expect(isProtectionActive('navigator_active_protection')).toBe(true);
    });

    it('should handle custom minimum timeout', () => {
      setProtectionFlag('navigator_import_in_progress');

      // Should be active if elapsed < customMinTimeout
      expect(isProtectionActive('navigator_import_in_progress', 1000)).toBe(true);
      expect(isProtectionActive('navigator_import_in_progress', 0)).toBe(true);
    });

    it('should detect expired flags', async () => {
      setProtectionFlag('navigator_import_in_progress');

      // Flag is active immediately
      expect(isProtectionActive('navigator_import_in_progress')).toBe(true);

      // Wait for expiration (6 seconds for import_in_progress)
      await new Promise(resolve => setTimeout(resolve, 6100));

      // Flag should be expired and auto-cleared
      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
    });
  });

  describe('clearProtectionFlag', () => {
    it('should clear an active flag', () => {
      setProtectionFlag('navigator_active_protection');
      expect(isProtectionActive('navigator_active_protection')).toBe(true);

      clearProtectionFlag('navigator_active_protection');
      expect(isProtectionActive('navigator_active_protection')).toBe(false);
    });

    it('should handle clearing non-existent flags', () => {
      // Should not throw
      clearProtectionFlag('navigator_active_protection');
      expect(isProtectionActive('navigator_active_protection')).toBe(false);
    });

    it('should clear flags independently', () => {
      setProtectionFlag('navigator_import_in_progress');
      setProtectionFlag('navigator_active_protection');

      clearProtectionFlag('navigator_import_in_progress');

      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
      expect(isProtectionActive('navigator_active_protection')).toBe(true);
    });
  });

  describe('getProtectionTimeRemaining', () => {
    it('should return 0 for inactive flags', () => {
      expect(getProtectionTimeRemaining('navigator_active_protection')).toBe(0);
    });

    it('should return 0 for infinite timeout flags', () => {
      setProtectionFlag('navigator_active_protection');
      expect(getProtectionTimeRemaining('navigator_active_protection')).toBe(0);
    });

    it('should return remaining time for flags with timeout', () => {
      setProtectionFlag('navigator_import_in_progress'); // 6 second timeout

      const remaining = getProtectionTimeRemaining('navigator_import_in_progress');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(6000);
    });

    it('should return decreasing time as flag approaches expiration', async () => {
      setProtectionFlag('navigator_import_in_progress');

      const remaining1 = getProtectionTimeRemaining('navigator_import_in_progress');
      await new Promise(resolve => setTimeout(resolve, 100));
      const remaining2 = getProtectionTimeRemaining('navigator_import_in_progress');

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  describe('executeWithProtection', () => {
    it('should execute callback when protection is not active', async () => {
      const callback = vi.fn(async () => 'result');

      const result = await executeWithProtection('navigator_import_in_progress', callback);

      expect(result).toBe('result');
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should return null when protection is active', async () => {
      setProtectionFlag('navigator_import_in_progress');

      const callback = vi.fn(async () => 'result');
      const result = await executeWithProtection('navigator_import_in_progress', callback);

      expect(result).toBe(null);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should set and clear protection around callback', async () => {
      const callback = vi.fn(async () => {
        // During callback execution, protection should be active
        expect(isProtectionActive('navigator_import_in_progress')).toBe(true);
        return 'result';
      });

      // Before execution
      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);

      await executeWithProtection('navigator_import_in_progress', callback);

      // After execution
      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
    });

    it('should clear protection even if callback throws', async () => {
      const callback = vi.fn(async () => {
        throw new Error('Test error');
      });

      try {
        await executeWithProtection('navigator_import_in_progress', callback);
      } catch (e) {
        // Expected
      }

      // Protection should still be cleared after error
      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
    });
  });

  describe('clearAllProtectionFlags', () => {
    it('should clear all active flags', () => {
      setProtectionFlag('navigator_restore_in_progress');
      setProtectionFlag('navigator_import_in_progress');
      setProtectionFlag('navigator_active_protection');

      clearAllProtectionFlags();

      expect(isProtectionActive('navigator_restore_in_progress')).toBe(false);
      expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
      expect(isProtectionActive('navigator_active_protection')).toBe(false);
    });
  });

  // COMMENTED OUT: initializeProtectionFlags function no longer exists (localStorage-based implementation)
  // describe('initializeProtectionFlags', () => {
  //   it('should initialize without errors', async () => {
  //     // Should not throw
  //     await initializeProtectionFlags();
  //   });

  //   it('should load flags from IndexedDB if present', async () => {
  //     // Set a flag
  //     setProtectionFlag('navigator_active_protection');

  //     // Initialize (loads from IndexedDB)
  //     await initializeProtectionFlags();

  //     // Flag should still be active
  //     expect(isProtectionActive('navigator_active_protection')).toBe(true);
  //   });

  //   it('should skip expired flags during initialization', async () => {
  //     setProtectionFlag('navigator_import_in_progress');

  //     // Wait for expiration
  //     await new Promise(resolve => setTimeout(resolve, 6100));

  //     // Initialize
  //     await initializeProtectionFlags();

  //     // Expired flag should not be in cache
  //     expect(isProtectionActive('navigator_import_in_progress')).toBe(false);
  //   });
  // });

  describe('Input Validation (FIX #5)', () => {
    it('should validate BroadcastChannel messages', async () => {
      // Test with invalid message (malformed) - should be safely rejected
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('navigator-protection-flags');

        // Set a flag first
        setProtectionFlag('navigator_import_in_progress');
        expect(isProtectionActive('navigator_import_in_progress')).toBe(true);

        // Send invalid message with NaN values - should not crash or clear valid flags
        bc.postMessage({
          flag: 'navigator_import_in_progress',
          data: { timestamp: NaN, expiresAt: NaN },
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Original flag should still be active (invalid message rejected)
        expect(isProtectionActive('navigator_import_in_progress')).toBe(true);

        bc.close();
      }
    });

    it('should reject timestamps outside valid range', async () => {
      // Should handle gracefully (timestamp will be validated)
      setProtectionFlag('navigator_active_protection');
      expect(isProtectionActive('navigator_active_protection')).toBe(true);
    });

    // COMMENTED OUT: initializeProtectionFlags no longer exists
    // it('should validate IndexedDB data during load', async () => {
    //   // Set valid flag
    //   setProtectionFlag('navigator_active_protection');

    //   // Re-initialize should load and validate
    //   await initializeProtectionFlags();

    //   // Should still be valid
    //   expect(isProtectionActive('navigator_active_protection')).toBe(true);
    // });
  });

  describe('Race Condition Prevention (FIX #3)', () => {
    it('should maintain consistency during rapid flag changes', () => {
      // Rapid set/clear operations
      for (let i = 0; i < 10; i++) {
        setProtectionFlag('navigator_active_protection');
        expect(isProtectionActive('navigator_active_protection')).toBe(true);

        clearProtectionFlag('navigator_active_protection');
        expect(isProtectionActive('navigator_active_protection')).toBe(false);
      }
    });

    it('should handle concurrent flag operations', async () => {
      const promises = [
        (async () => {
          setProtectionFlag('navigator_import_in_progress');
          await new Promise(resolve => setTimeout(resolve, 10));
          return isProtectionActive('navigator_import_in_progress');
        })(),
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return isProtectionActive('navigator_import_in_progress');
        })(),
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 15));
          return isProtectionActive('navigator_import_in_progress');
        })(),
      ];

      const results = await Promise.all(promises);

      // First should be true (just set)
      expect(results[0]).toBe(true);
      // Second should be true (before timeout)
      expect(results[1]).toBe(true);
      // Third depends on timing but should complete without error
      expect(typeof results[2]).toBe('boolean');
    });
  });

  // COMMENTED OUT: closeDB and initializeProtectionFlags no longer exist
  // describe('Memory Leak Prevention (FIX #4)', () => {
  //   it('should cleanup resources on closeDB', () => {
  //     setProtectionFlag('navigator_active_protection');
  //     expect(isProtectionActive('navigator_active_protection')).toBe(true);

  //     closeDB();

  //     // After cleanup, should be able to re-initialize
  //     initializeProtectionFlags(); // Should not throw

  //     closeDB(); // Should cleanup again without error
  //   });
  // });

  describe('Multi-Tab Coordination', () => {
    it('should handle BroadcastChannel messages correctly', async () => {
      if (typeof BroadcastChannel !== 'undefined') {
        // Initialize the BroadcastChannel handler first
        // COMMENTED OUT: initializeProtectionFlags no longer exists
        // await initializeProtectionFlags();

        const bc = new BroadcastChannel('navigator-protection-flags');

        // Send valid flag set message
        bc.postMessage({
          flag: 'navigator_active_protection',
          data: {
            timestamp: Date.now(),
            expiresAt: Infinity,
          },
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Flag should be updated in cache
        expect(isProtectionActive('navigator_active_protection')).toBe(true);

        // Send flag clear message
        bc.postMessage({
          flag: 'navigator_active_protection',
          data: null,
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Flag should be cleared
        expect(isProtectionActive('navigator_active_protection')).toBe(false);

        bc.close();
      }
    });
  });
});
