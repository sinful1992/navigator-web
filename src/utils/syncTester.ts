// src/utils/syncTester.ts - Race condition testing utilities
import type { AppState } from '../types';
import { logger } from './logger';

/**
 * Test utilities for verifying race condition fixes
 */
export class SyncTester {
  private testResults: Array<{ test: string; passed: boolean; details: string }> = [];

  /**
   * Simulate the original race condition scenario
   */
  async simulateRaceCondition(
    complete: (index: number, outcome: any) => Promise<string>,
    getCurrentState: () => AppState
  ): Promise<boolean> {
    this.testResults = [];

    try {
      // Test 1: Rapid completion during "startup"
      logger.info('🧪 Testing rapid completion during startup simulation...');

      const initialState = getCurrentState();
      if (initialState.addresses.length === 0) {
        this.logTestResult('Setup', false, 'No addresses available for testing');
        return false;
      }

      // Simulate completion immediately after "app start"
      const testIndex = 0;
      const startTime = Date.now();

      try {
        await complete(testIndex, 'PIF');
        const endTime = Date.now();

        // Wait a moment for any race conditions to manifest
        await new Promise(resolve => setTimeout(resolve, 100));

        const finalState = getCurrentState();
        const completionExists = finalState.completions.some(c =>
          c.index === testIndex && c.outcome === 'PIF'
        );

        this.logTestResult(
          'Rapid Completion',
          completionExists,
          completionExists
            ? `Completion persisted (${endTime - startTime}ms)`
            : 'Completion was lost - race condition detected!'
        );

        return completionExists;
      } catch (error) {
        this.logTestResult('Rapid Completion', false, `Error: ${error}`);
        return false;
      }
    } catch (error) {
      logger.error('Race condition test failed:', error);
      return false;
    }
  }

  /**
   * Test concurrent completions (simulates multiple devices)
   */
  async testConcurrentCompletions(
    complete: (index: number, outcome: any) => Promise<string>,
    getCurrentState: () => AppState
  ): Promise<boolean> {
    logger.info('🧪 Testing concurrent completions...');

    const state = getCurrentState();
    if (state.addresses.length < 3) {
      this.logTestResult('Concurrent Setup', false, 'Need at least 3 addresses');
      return false;
    }

    try {
      // Simulate multiple rapid completions
      const completionPromises = [
        complete(0, 'PIF'),
        complete(1, 'DA'),
        complete(2, 'Done'),
      ];

      const results = await Promise.allSettled(completionPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalState = getCurrentState();
      const actualCompletions = finalState.completions.length;

      this.logTestResult(
        'Concurrent Completions',
        successful === actualCompletions && successful >= 3,
        `Expected 3+, got ${successful} submitted, ${actualCompletions} persisted`
      );

      return successful === actualCompletions;
    } catch (error) {
      this.logTestResult('Concurrent Completions', false, `Error: ${error}`);
      return false;
    }
  }

  /**
   * Test active index race condition
   */
  async testActiveIndexRace(
    setActive: (index: number) => Promise<void>,
    cancelActive: () => Promise<void>,
    getCurrentState: () => AppState
  ): Promise<boolean> {
    logger.info('🧪 Testing active index race condition...');

    try {
      // Rapid active index changes
      await setActive(1);
      await setActive(2);
      await cancelActive();
      await setActive(3);

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalState = getCurrentState();
      const finalActiveIndex = finalState.activeIndex;

      this.logTestResult(
        'Active Index Race',
        finalActiveIndex === 3,
        `Final active index: ${finalActiveIndex} (expected: 3)`
      );

      return finalActiveIndex === 3;
    } catch (error) {
      this.logTestResult('Active Index Race', false, `Error: ${error}`);
      return false;
    }
  }

  /**
   * Test sync recovery after offline period
   */
  async testOfflineRecovery(
    complete: (index: number, outcome: any) => Promise<string>,
    getCurrentState: () => AppState
  ): Promise<boolean> {
    logger.info('🧪 Testing offline recovery...');

    try {
      // Simulate going offline by intercepting network
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

      // Make completions while "offline"
      const offlineCompletions: string[] = [];
      for (let i = 0; i < 3; i++) {
        if (getCurrentState().addresses[i]) {
          try {
            const id = await complete(i, 'PIF');
            offlineCompletions.push(id);
          } catch {
            // Expected to fail or queue while offline
          }
        }
      }

      // Come back "online"
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      window.dispatchEvent(new Event('online'));

      // Wait for sync recovery
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalState = getCurrentState();
      const recoveredCompletions = finalState.completions.filter(c =>
        c.outcome === 'PIF' && offlineCompletions.includes(c.timestamp)
      ).length;

      // Restore original online status
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true });

      this.logTestResult(
        'Offline Recovery',
        recoveredCompletions > 0,
        `Recovered ${recoveredCompletions}/${offlineCompletions.length} offline completions`
      );

      return recoveredCompletions > 0;
    } catch (error) {
      this.logTestResult('Offline Recovery', false, `Error: ${error}`);
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(appState: {
    complete: (index: number, outcome: any) => Promise<string>;
    setActive: (index: number) => Promise<void>;
    cancelActive: () => Promise<void>;
    state: AppState;
  }): Promise<{ passed: number; failed: number; results: Array<{ test: string; passed: boolean; details: string }> }> {
    logger.info('🧪 Running sync race condition tests...');
    this.testResults = [];

    const getCurrentState = () => appState.state;

    // Run all tests
    await this.simulateRaceCondition(appState.complete, getCurrentState);
    await this.testConcurrentCompletions(appState.complete, getCurrentState);
    await this.testActiveIndexRace(appState.setActive, appState.cancelActive, getCurrentState);
    await this.testOfflineRecovery(appState.complete, getCurrentState);

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;

    logger.info(`🧪 Test results: ${passed} passed, ${failed} failed`);
    this.testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      logger.info(`${icon} ${result.test}: ${result.details}`);
    });

    return {
      passed,
      failed,
      results: [...this.testResults]
    };
  }

  private logTestResult(test: string, passed: boolean, details: string) {
    this.testResults.push({ test, passed, details });
  }

  /**
   * Performance test - measure completion latency
   */
  async measureCompletionLatency(
    complete: (index: number, outcome: any) => Promise<string>,
    iterations: number = 10
  ): Promise<{ average: number; min: number; max: number }> {
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await complete(0, 'PIF');
        const end = performance.now();
        latencies.push(end - start);
      } catch (error) {
        logger.warn(`Completion ${i} failed:`, error);
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const average = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);

    logger.info(`📊 Completion latency: avg=${average.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms`);

    return { average, min, max };
  }
}

// Singleton instance for easy use
export const syncTester = new SyncTester();

/**
 * Quick test function for development console
 */
export function runQuickSyncTest(appState: any) {
  return syncTester.runAllTests(appState);
}

// Make it available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).runQuickSyncTest = runQuickSyncTest;
  (window as any).syncTester = syncTester;
}