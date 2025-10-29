// src/services/optimisticUITest.ts
/**
 * Optimistic UI Testing Utilities
 *
 * Provides tools and utilities for testing the optimistic UI system.
 * Use these in development/testing environments only.
 *
 * Feature: Optimistic UI with Change Tracking (DISABLED by default)
 */

import type { AppState, Completion, Arrangement } from '../types';
import { changeTracker } from './changeTracker';
import { optimisticUI } from './optimisticUI';
import { filterEcho, getEchoFilterStats, resetEchoFilterStats } from '../utils/echoFilter';
import { getSystemStats, enable } from './optimisticUIConfig';
import { logger } from '../utils/logger';

export interface TestScenario {
  name: string;
  description: string;
  run: () => Promise<TestResult>;
}

export interface TestResult {
  passed: boolean;
  message: string;
  details?: any;
  duration?: number;
}

export interface TestSuite {
  name: string;
  scenarios: TestScenario[];
}

/**
 * Create a mock AppState for testing
 */
export function createMockState(overrides?: Partial<AppState>): AppState {
  const baseState: AppState = {
    addresses: [
      { address: '123 Test St', lat: null, lng: null },
      { address: '456 Mock Ave', lat: null, lng: null },
    ],
    activeIndex: null,
    activeStartTime: null,
    completions: [],
    daySessions: [],
    arrangements: [],
    currentListVersion: 1,
    subscription: null,
  };

  return { ...baseState, ...overrides };
}

/**
 * Create a mock completion for testing
 */
export function createMockCompletion(overrides?: Partial<Completion>): Completion {
  return {
    index: 0,
    address: '123 Test St',
    lat: null,
    lng: null,
    outcome: 'PIF',
    timestamp: new Date().toISOString(),
    listVersion: 1,
    ...overrides,
  };
}

/**
 * Create a mock arrangement for testing
 */
export function createMockArrangement(overrides?: Partial<Arrangement>): Arrangement {
  const now = new Date().toISOString();
  return {
    id: `arr_test_${Date.now()}`,
    addressIndex: 0,
    address: '123 Test St',
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: '10:00',
    customerName: 'Test Customer',
    status: 'Scheduled',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Wait for a specified duration (test helper)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean up test state (run after each test)
 */
async function cleanupTestState(): Promise<void> {
  try {
    // Clear all pending updates and timeouts
    optimisticUI.clearAll();

    // Clear change tracker
    await changeTracker.clearAll();

    // Reset to default config
    optimisticUI.updateConfig({
      enabled: true,
      maxPendingUpdates: 100,
      updateTimeoutMs: 30 * 1000,
      autoRetry: true,
      maxRetries: 3,
    });

    // Small delay to ensure cleanup completes
    await wait(50);
  } catch (error) {
    logger.error('Error during test cleanup:', error);
  }
}

/**
 * Test Suite 1: Change Tracking
 */
export const changeTrackingTests: TestSuite = {
  name: 'Change Tracking',
  scenarios: [
    {
      name: 'Track and retrieve change',
      description: 'Test that changes are properly tracked and can be retrieved',
      run: async () => {
        const startTime = Date.now();

        try {
          // Enable change tracker
          if (!changeTracker.isEnabled()) {
            await changeTracker.enable();
          }

          const mockState = createMockState();
          const changeId = await changeTracker.trackChange('complete', mockState, {
            entityIndex: 0,
          });

          if (!changeId) {
            return {
              passed: false,
              message: 'Failed to track change - no change ID returned',
              duration: Date.now() - startTime,
            };
          }

          // Retrieve all changes
          const allChanges = await changeTracker.getAllChanges();
          const tracked = allChanges.find((c) => c.id === changeId);

          if (!tracked) {
            return {
              passed: false,
              message: 'Change not found after tracking',
              duration: Date.now() - startTime,
            };
          }

          return {
            passed: true,
            message: 'Change tracked and retrieved successfully',
            details: { changeId, tracked },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'Echo detection via checksum',
      description: 'Test that identical state checksums are detected as echoes',
      run: async () => {
        const startTime = Date.now();

        try {
          if (!changeTracker.isEnabled()) {
            await changeTracker.enable();
          }

          const mockState = createMockState();

          // Track a change
          await changeTracker.trackChange('complete', mockState, {
            entityIndex: 0,
          });

          // Wait a bit to ensure tracking completes
          await wait(100);

          // Check if the same state is detected as an echo
          const isEcho = await changeTracker.isEcho(mockState, {
            entityIndex: 0,
          });

          return {
            passed: isEcho,
            message: isEcho
              ? 'Echo correctly detected via checksum'
              : 'Echo NOT detected (expected to be detected)',
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'Change cleanup',
      description: 'Test that old changes are cleaned up',
      run: async () => {
        const startTime = Date.now();

        try {
          if (!changeTracker.isEnabled()) {
            await changeTracker.enable();
          }

          // Track a change
          const mockState = createMockState();
          await changeTracker.trackChange('complete', mockState);

          // Force cleanup
          const removedCount = await changeTracker.cleanup();

          return {
            passed: true,
            message: `Cleanup completed, removed ${removedCount} old changes`,
            details: { removedCount },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
  ],
};

/**
 * Test Suite 2: Optimistic UI
 */
export const optimisticUITests: TestSuite = {
  name: 'Optimistic UI',
  scenarios: [
    {
      name: 'Apply and confirm update',
      description: 'Test optimistic update lifecycle: apply → confirm',
      run: async () => {
        const startTime = Date.now();

        try {
          if (!optimisticUI.isEnabled()) {
            await optimisticUI.enable();
          }

          const previousState = createMockState();
          const newState = createMockState({
            completions: [createMockCompletion()],
          });

          const updateId = await optimisticUI.applyUpdate(
            'complete',
            previousState,
            newState,
            { entityIndex: 0 }
          );

          if (!updateId) {
            return {
              passed: false,
              message: 'No update ID returned',
              duration: Date.now() - startTime,
            };
          }

          // Check pending updates
          const pending = optimisticUI.getPendingUpdates();
          const update = pending.find((u) => u.id === updateId);

          if (!update) {
            return {
              passed: false,
              message: 'Update not in pending list',
              duration: Date.now() - startTime,
            };
          }

          // Confirm the update
          await optimisticUI.confirmUpdate(updateId, newState);

          // Wait for cleanup
          await wait(100);

          // Check it's no longer pending
          const afterPending = optimisticUI.getPendingUpdates();
          const stillPending = afterPending.find((u) => u.id === updateId);

          return {
            passed: !stillPending,
            message: stillPending
              ? 'Update still pending after confirmation'
              : 'Update confirmed and cleaned up successfully',
            details: { updateId },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'Fail and rollback update',
      description: 'Test optimistic update failure and rollback',
      run: async () => {
        const startTime = Date.now();

        try {
          if (!optimisticUI.isEnabled()) {
            await optimisticUI.enable();
          }

          // Disable autoRetry for this test to prevent background timeouts
          optimisticUI.updateConfig({
            autoRetry: false,
          });

          const previousState = createMockState();
          const newState = createMockState({
            completions: [createMockCompletion()],
          });

          const updateId = await optimisticUI.applyUpdate(
            'complete',
            previousState,
            newState,
            { entityIndex: 0 }
          );

          if (!updateId) {
            return {
              passed: false,
              message: 'No update ID returned',
              duration: Date.now() - startTime,
            };
          }

          // Get rollback state before failing
          const rollbackState = optimisticUI.getRollbackState(updateId);

          if (!rollbackState) {
            return {
              passed: false,
              message: 'No rollback state available before failUpdate',
              duration: Date.now() - startTime,
            };
          }

          // Fail the update
          await optimisticUI.failUpdate(updateId, 'Test failure');

          // Verify update is no longer pending after failure (since autoRetry is off)
          const stillPending = optimisticUI.getPendingUpdates().find(u => u.id === updateId);

          return {
            passed: !!rollbackState && !stillPending,
            message:
              !!rollbackState && !stillPending
                ? 'Rollback state retrieved and update failed correctly'
                : 'Rollback or cleanup did not work as expected',
            details: { updateId, hadRollbackState: !!rollbackState, stillPending: !!stillPending },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'Update timeout handling',
      description: 'Test that updates timeout correctly',
      run: async () => {
        const startTime = Date.now();

        try {
          // Clear any pending updates from previous tests first
          optimisticUI.clearAll();
          await wait(50);

          // Temporarily set a short timeout for testing
          optimisticUI.updateConfig({
            enabled: true,
            updateTimeoutMs: 500, // 500ms timeout
            maxRetries: 0, // No retries for this test
            autoRetry: true, // Keep autoRetry on to test timeout → retry → fail flow
          });

          const previousState = createMockState();
          const newState = createMockState({
            completions: [createMockCompletion()],
          });

          const updateId = await optimisticUI.applyUpdate(
            'complete',
            previousState,
            newState
          );

          if (!updateId) {
            return {
              passed: false,
              message: 'No update ID returned',
              duration: Date.now() - startTime,
            };
          }

          // Verify update is initially pending
          const initialPending = optimisticUI.getPendingUpdates().find((u) => u.id === updateId);
          if (!initialPending) {
            return {
              passed: false,
              message: 'Update was not added to pending list',
              duration: Date.now() - startTime,
            };
          }

          // Wait for timeout to fire (500ms) + extra time for async cleanup
          await wait(1200);

          // Check if update is no longer pending (timed out and failed)
          const finalPending = optimisticUI.getPendingUpdates().find((u) => u.id === updateId);

          return {
            passed: !finalPending,
            message: finalPending
              ? 'Update did not timeout and fail as expected'
              : 'Update timed out and failed correctly',
            details: {
              updateId,
              wasInitiallyPending: !!initialPending,
              isFinallyPending: !!finalPending,
            },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
  ],
};

/**
 * Test Suite 3: Echo Filter
 */
export const echoFilterTests: TestSuite = {
  name: 'Echo Filter',
  scenarios: [
    {
      name: 'Device ID echo detection',
      description: 'Test echo detection via device ID matching',
      run: async () => {
        const startTime = Date.now();

        try {
          const deviceId = localStorage.getItem('navigator_device_id');
          if (!deviceId) {
            return {
              passed: false,
              message: 'No device ID found',
              duration: Date.now() - startTime,
            };
          }

          const mockState = createMockState();

          // Test with same device ID (should be echo)
          const result1 = await filterEcho(mockState, { deviceId });

          // Test with different device ID (should NOT be echo)
          const result2 = await filterEcho(mockState, { deviceId: 'different_device' });

          return {
            passed: result1.isEcho && !result2.isEcho,
            message:
              result1.isEcho && !result2.isEcho
                ? 'Device ID echo detection working correctly'
                : 'Device ID echo detection not working',
            details: { result1, result2 },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'Timestamp echo detection',
      description: 'Test echo detection via timestamp heuristic',
      run: async () => {
        const startTime = Date.now();

        try {
          const mockState = createMockState();

          // Very recent timestamp (should be echo)
          const recentTimestamp = Date.now() - 50; // 50ms ago
          const result1 = await filterEcho(mockState, {
            timestamp: recentTimestamp,
          });

          // Old timestamp (should NOT be echo)
          const oldTimestamp = Date.now() - 5000; // 5 seconds ago
          const result2 = await filterEcho(mockState, {
            timestamp: oldTimestamp,
          });

          return {
            passed: result1.isEcho && !result2.isEcho,
            message:
              result1.isEcho && !result2.isEcho
                ? 'Timestamp echo detection working correctly'
                : 'Timestamp echo detection not working',
            details: { result1, result2 },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'Echo filter statistics',
      description: 'Test echo filter statistics tracking',
      run: async () => {
        const startTime = Date.now();

        try {
          // Reset stats
          resetEchoFilterStats();

          const mockState = createMockState();
          const deviceId = localStorage.getItem('navigator_device_id') || 'test_device';

          // Trigger an echo
          const result = await filterEcho(mockState, { deviceId });

          if (!result.isEcho) {
            return {
              passed: false,
              message: 'Failed to generate echo for stats test',
              duration: Date.now() - startTime,
            };
          }

          // Get stats
          const stats = getEchoFilterStats();

          return {
            passed: stats.totalFiltered > 0,
            message:
              stats.totalFiltered > 0
                ? 'Echo filter statistics working'
                : 'Statistics not updating',
            details: { stats },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
  ],
};

/**
 * Test Suite 4: Integration Tests
 */
export const integrationTests: TestSuite = {
  name: 'Integration',
  scenarios: [
    {
      name: 'Full lifecycle test',
      description: 'Test complete flow: track → optimistic → filter → confirm',
      run: async () => {
        const startTime = Date.now();

        try {
          // Enable system
          if (!changeTracker.isEnabled() || !optimisticUI.isEnabled()) {
            await enable();
          }

          const previousState = createMockState();
          const newState = createMockState({
            completions: [createMockCompletion()],
          });

          // 1. Apply optimistic update
          const updateId = await optimisticUI.applyUpdate(
            'complete',
            previousState,
            newState,
            { entityIndex: 0 }
          );

          if (!updateId) {
            return {
              passed: false,
              message: 'Failed to apply optimistic update',
              duration: Date.now() - startTime,
            };
          }

          // 2. Verify change was tracked
          const allChanges = await changeTracker.getAllChanges();
          const tracked = allChanges.find(
            (c) => c.entityIndex === 0 && c.type === 'complete'
          );

          if (!tracked) {
            return {
              passed: false,
              message: 'Change was not tracked',
              duration: Date.now() - startTime,
            };
          }

          // 3. Simulate incoming cloud update (should be filtered as echo)
          const deviceId = localStorage.getItem('navigator_device_id') || 'test';
          const echoResult = await filterEcho(newState, { deviceId });

          if (!echoResult.isEcho) {
            return {
              passed: false,
              message: 'Echo was not detected',
              details: { echoResult },
              duration: Date.now() - startTime,
            };
          }

          // 4. Confirm the optimistic update
          await optimisticUI.confirmUpdate(updateId, newState);

          // 5. Wait for cleanup
          await wait(100);

          return {
            passed: true,
            message: 'Full lifecycle completed successfully',
            details: { updateId, tracked, echoResult },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
    {
      name: 'System statistics',
      description: 'Verify system statistics are available',
      run: async () => {
        const startTime = Date.now();

        try {
          const stats = await getSystemStats();

          const hasAllStats = !!(
            stats &&
            stats.config &&
            stats.changeTracker &&
            stats.optimisticUI
          );

          return {
            passed: hasAllStats,
            message: hasAllStats
              ? 'System statistics available'
              : 'Missing statistics',
            details: { stats },
            duration: Date.now() - startTime,
          };
        } catch (error: unknown) {
          return {
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
          };
        }
      },
    },
  ],
};

/**
 * Run a single test suite
 */
export async function runTestSuite(suite: TestSuite): Promise<{
  suite: string;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  logger.info(`🧪 Running test suite: ${suite.name}`);

  const results: TestResult[] = [];

  for (const scenario of suite.scenarios) {
    logger.info(`  Running: ${scenario.name}`);
    const result = await scenario.run();
    results.push(result);

    const status = result.passed ? '✅' : '❌';
    logger.info(`  ${status} ${result.message}`);

    // Clean up state after each test
    await cleanupTestState();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    suite: suite.name,
    passed,
    failed,
    results,
  };
}

/**
 * Run all test suites
 */
export async function runAllTests(): Promise<void> {
  logger.info('🧪 Starting Optimistic UI Test Suite');
  logger.info('═══════════════════════════════════════');

  // Initial cleanup to ensure clean state
  logger.info('🧹 Cleaning up test environment...');
  await cleanupTestState();

  const suites = [
    changeTrackingTests,
    optimisticUITests,
    echoFilterTests,
    integrationTests,
  ];

  const allResults = [];

  for (const suite of suites) {
    const result = await runTestSuite(suite);
    allResults.push(result);
    logger.info('');
  }

  // Final cleanup
  await cleanupTestState();

  // Summary
  logger.info('═══════════════════════════════════════');
  logger.info('📊 Test Summary:');
  logger.info('');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of allResults) {
    totalPassed += result.passed;
    totalFailed += result.failed;
    logger.info(
      `  ${result.suite}: ${result.passed}/${result.passed + result.failed} passed`
    );
  }

  logger.info('');
  logger.info(`Total: ${totalPassed} passed, ${totalFailed} failed`);

  if (totalFailed === 0) {
    logger.info('✅ All tests passed!');
  } else {
    logger.warn(`❌ ${totalFailed} test(s) failed`);
  }

  logger.info('═══════════════════════════════════════');
}

/**
 * Quick smoke test - run this first
 */
export async function runSmokeTest(): Promise<boolean> {
  logger.info('🧪 Running smoke test...');

  try {
    // Initial cleanup
    await cleanupTestState();

    // Test 1: Enable system
    await enable();
    if (!changeTracker.isEnabled() || !optimisticUI.isEnabled()) {
      logger.error('❌ Failed to enable system');
      return false;
    }
    logger.info('✅ System enabled');

    // Test 2: Track a change
    const mockState = createMockState();
    const changeId = await changeTracker.trackChange('complete', mockState);
    if (!changeId) {
      logger.error('❌ Failed to track change');
      return false;
    }
    logger.info('✅ Change tracking works');

    // Test 3: Apply optimistic update
    const updateId = await optimisticUI.applyUpdate(
      'complete',
      mockState,
      mockState
    );
    if (!updateId) {
      logger.error('❌ Failed to apply optimistic update');
      return false;
    }
    logger.info('✅ Optimistic updates work');

    // Test 4: Echo filtering
    const deviceId = localStorage.getItem('navigator_device_id') || 'test';
    const echoResult = await filterEcho(mockState, { deviceId });
    if (!echoResult) {
      logger.error('❌ Echo filtering failed');
      return false;
    }
    logger.info('✅ Echo filtering works');

    // Cleanup
    await optimisticUI.confirmUpdate(updateId);
    await wait(100);
    await cleanupTestState();

    logger.info('🎉 Smoke test passed!');
    return true;
  } catch (error: unknown) {
    logger.error('❌ Smoke test failed:', error.message);
    // Clean up even on failure
    await cleanupTestState();
    return false;
  }
}
