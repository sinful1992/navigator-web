#!/usr/bin/env node

/**
 * MCP Server for Testing Navigator Race Condition Fixes
 *
 * This server provides tools to:
 * 1. Test protection flag timeouts (finite vs infinite)
 * 2. Test abort controller functionality
 * 3. Test atomic operations with rollback
 * 4. Test duplicate detection (5-second window)
 * 5. Test merge mutex (concurrent merge prevention)
 * 6. Test sync lock (simultaneous sync prevention)
 * 7. Test monotonic timestamps (clock skew immunity)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Simulated localStorage for testing
const mockLocalStorage = new Map();

// Simulated operation log
const mockOperationLog = [];

// Test state
let testResults = {
  protectionFlags: [],
  abortController: [],
  atomicOperations: [],
  duplicateDetection: [],
  mergeMutex: [],
  syncLock: [],
  monotonicTimestamps: []
};

/**
 * Helper: Read source file
 */
async function readSourceFile(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  return await fs.readFile(fullPath, 'utf-8');
}

/**
 * Helper: Check if code contains pattern
 */
function codeContains(code, pattern) {
  return new RegExp(pattern).test(code);
}

/**
 * TEST 1: Protection Flag Timeouts
 */
async function testProtectionFlagTimeouts() {
  const code = await readSourceFile('src/utils/protectionFlags.ts');

  const results = [];

  // Check for finite timeouts (not Infinity)
  const activeProtectionMatch = code.match(/'navigator_active_protection':\s*(\d+\s*\*\s*\d+\s*\*\s*\d+|Infinity)/);
  const sessionProtectionMatch = code.match(/'navigator_session_protection':\s*(\d+\s*\*\s*\d+|Infinity)/);

  if (activeProtectionMatch) {
    const value = activeProtectionMatch[1];
    const isFinite = value !== 'Infinity';
    results.push({
      test: 'navigator_active_protection timeout',
      expected: 'Finite value (5 minutes)',
      actual: value,
      passed: isFinite && value.includes('5') && value.includes('60'),
      critical: true
    });
  }

  if (sessionProtectionMatch) {
    const value = sessionProtectionMatch[1];
    const isFinite = value !== 'Infinity';
    results.push({
      test: 'navigator_session_protection timeout',
      expected: 'Finite value (1 minute)',
      actual: value,
      passed: isFinite && value.includes('60'),
      critical: true
    });
  }

  // Check for monotonic timestamp implementation
  const hasMonotonic = codeContains(code, /setTime.*timeout/i) &&
                       codeContains(code, /JSON\.stringify.*setTime.*timeout/i);

  results.push({
    test: 'Monotonic timestamp format',
    expected: 'JSON format with {setTime, timeout}',
    actual: hasMonotonic ? 'Implemented' : 'Missing',
    passed: hasMonotonic,
    critical: true
  });

  // Check for clock skew detection
  const hasClockSkewDetection = codeContains(code, /elapsed\s*<\s*0/) &&
                                 codeContains(code, /Clock skew detected/i);

  results.push({
    test: 'Clock skew detection',
    expected: 'Detect negative elapsed time',
    actual: hasClockSkewDetection ? 'Implemented' : 'Missing',
    passed: hasClockSkewDetection,
    critical: true
  });

  testResults.protectionFlags = results;
  return results;
}

/**
 * TEST 2: Abort Controller
 */
async function testAbortController() {
  const code = await readSourceFile('src/hooks/useTimeTracking.ts');

  const results = [];

  // Check for AbortController creation
  const hasAbortController = codeContains(code, /new AbortController\(\)/i);
  results.push({
    test: 'AbortController instantiation',
    expected: 'new AbortController()',
    actual: hasAbortController ? 'Found' : 'Missing',
    passed: hasAbortController,
    critical: true
  });

  // Check for timeout with abort
  const hasTimeoutMatch = code.match(/setTimeout.*\{[\s\S]*?abortController\.abort\(\)/i);
  const has15Second = codeContains(code, /15000|15\s*second/i);
  const hasTimeout = hasTimeoutMatch && has15Second;

  results.push({
    test: 'Abort timeout (15 seconds)',
    expected: '15000ms timeout',
    actual: hasTimeout ? 'Implemented' : 'Missing',
    passed: hasTimeout,
    critical: true
  });

  // Check for signal passing
  const hasSignal = codeContains(code, /signal:\s*abortController\.signal/i);
  results.push({
    test: 'AbortSignal passed to request',
    expected: 'signal: abortController.signal',
    actual: hasSignal ? 'Found' : 'Missing',
    passed: hasSignal,
    critical: true
  });

  // Check for protection flag clearing on timeout
  const hasFlagClear = codeContains(code, /clearProtectionFlag.*navigator_active_protection/);
  results.push({
    test: 'Protection flag cleared on abort',
    expected: 'clearProtectionFlag called on timeout',
    actual: hasFlagClear ? 'Implemented' : 'Missing',
    passed: hasFlagClear,
    critical: true
  });

  testResults.abortController = results;
  return results;
}

/**
 * TEST 3: Atomic Operations
 */
async function testAtomicOperations() {
  const results = [];

  // Check if AtomicOperationService exists
  try {
    const serviceCode = await readSourceFile('src/services/AtomicOperationService.ts');

    results.push({
      test: 'AtomicOperationService file exists',
      expected: 'File created',
      actual: 'Found',
      passed: true,
      critical: true
    });

    // Check for execute method
    const hasExecute = codeContains(serviceCode, /async execute.*stateMutator.*operation/s);
    results.push({
      test: 'execute() method with rollback',
      expected: 'Method with stateMutator and operation params',
      actual: hasExecute ? 'Implemented' : 'Missing',
      passed: hasExecute,
      critical: true
    });

    // Check for rollback logic
    const hasRollback = codeContains(serviceCode, /rollbackOnFailure/) &&
                        codeContains(serviceCode, /previousState/);

    results.push({
      test: 'Rollback on failure',
      expected: 'State rollback when operation fails',
      actual: hasRollback ? 'Implemented' : 'Missing',
      passed: hasRollback,
      critical: true
    });

    // Check for try/catch with state capture
    const hasTryCatch = codeContains(serviceCode, /try\s*\{[\s\S]*previousState[\s\S]*catch/);
    results.push({
      test: 'Try/catch with state capture',
      expected: 'Previous state captured before mutation',
      actual: hasTryCatch ? 'Implemented' : 'Missing',
      passed: hasTryCatch,
      critical: true
    });

    // Check integration in useCompletionState
    const hookCode = await readSourceFile('src/hooks/useCompletionState.ts');
    const hasIntegration = codeContains(hookCode, /AtomicOperationService/i) &&
                          codeContains(hookCode, /atomicService\.execute/);

    results.push({
      test: 'Integration in useCompletionState',
      expected: 'AtomicOperationService used in complete()',
      actual: hasIntegration ? 'Integrated' : 'Not integrated',
      passed: hasIntegration,
      critical: true
    });

  } catch (error) {
    results.push({
      test: 'AtomicOperationService file exists',
      expected: 'File created',
      actual: `Error: ${error.message}`,
      passed: false,
      critical: true
    });
  }

  testResults.atomicOperations = results;
  return results;
}

/**
 * TEST 4: Duplicate Detection
 */
async function testDuplicateDetection() {
  const code = await readSourceFile('src/hooks/useCompletionState.ts');

  const results = [];

  // Check for 5-second window
  const has5SecondWindow = codeContains(code, /5000/) &&
                           codeContains(code, /5 second/i);

  results.push({
    test: '5-second duplicate window',
    expected: '5000ms duplicate detection',
    actual: has5SecondWindow ? '5 seconds' : 'Different value',
    passed: has5SecondWindow,
    critical: true
  });

  // Check for timestamp-based comparison
  const hasTimestampCheck = codeContains(code, /existingTime.*getTime/) &&
                            codeContains(code, /timeDiff/);

  results.push({
    test: 'Timestamp-based duplicate detection',
    expected: 'Compare timestamps with timeDiff',
    actual: hasTimestampCheck ? 'Implemented' : 'Missing',
    passed: hasTimestampCheck,
    critical: true
  });

  // Check conflict resolution
  const conflictCode = await readSourceFile('src/sync/conflictResolution.ts');
  const hasConflictDetection = codeContains(conflictCode, /5000/) &&
                                codeContains(conflictCode, /COMPLETION_CREATE/);

  results.push({
    test: 'Conflict detection for COMPLETION_CREATE',
    expected: '5-second window in conflictResolution.ts',
    actual: hasConflictDetection ? 'Implemented' : 'Missing',
    passed: hasConflictDetection,
    critical: false // Already existed
  });

  testResults.duplicateDetection = results;
  return results;
}

/**
 * TEST 5: Merge Mutex
 */
async function testMergeMutex() {
  const code = await readSourceFile('src/sync/operationSync.ts');

  const results = [];

  // Check for mergeMutex ref
  const hasMutexRef = codeContains(code, /mergeMutex.*useRef.*Promise/);
  results.push({
    test: 'mergeMutex ref declaration',
    expected: 'useRef<Promise<any> | null>(null)',
    actual: hasMutexRef ? 'Found' : 'Missing',
    passed: hasMutexRef,
    critical: true
  });

  // Check for mergeWithMutex function
  const hasMergeFunction = codeContains(code, /mergeWithMutex.*async.*operations.*Operation/s);
  results.push({
    test: 'mergeWithMutex() function',
    expected: 'Wrapper function for mutex-protected merge',
    actual: hasMergeFunction ? 'Implemented' : 'Missing',
    passed: hasMergeFunction,
    critical: true
  });

  // Check for mutex wait logic
  const hasWaitLogic = codeContains(code, /if.*mergeMutex\.current/i) &&
                       codeContains(code, /await mergeMutex\.current/);

  results.push({
    test: 'Mutex wait logic',
    expected: 'Wait for ongoing merge to complete',
    actual: hasWaitLogic ? 'Implemented' : 'Missing',
    passed: hasWaitLogic,
    critical: true
  });

  // Check for usage in fetchOperationsFromCloud
  const usedInFetch = codeContains(code, /mergeWithMutex.*remoteOperations/);
  results.push({
    test: 'Used in fetchOperationsFromCloud',
    expected: 'mergeWithMutex(remoteOperations)',
    actual: usedInFetch ? 'Used' : 'Not used',
    passed: usedInFetch,
    critical: true
  });

  // Check for usage in subscribeToOperations
  const usedInSubscribe = code.match(/mergeWithMutex/g)?.length >= 2;
  results.push({
    test: 'Used in subscribeToOperations',
    expected: 'Multiple uses of mergeWithMutex',
    actual: usedInSubscribe ? 'Used' : 'Not used',
    passed: usedInSubscribe,
    critical: true
  });

  testResults.mergeMutex = results;
  return results;
}

/**
 * TEST 6: Sync Lock
 */
async function testSyncLock() {
  const code = await readSourceFile('src/sync/operationSync.ts');

  const results = [];

  // Check for syncLock ref
  const hasSyncLockRef = codeContains(code, /syncLock.*useRef.*Promise.*void/);
  results.push({
    test: 'syncLock ref declaration',
    expected: 'useRef<Promise<void> | null>(null)',
    actual: hasSyncLockRef ? 'Found' : 'Missing',
    passed: hasSyncLockRef,
    critical: true
  });

  // Check for lock check at start of sync
  const hasLockCheck = codeContains(code, /if.*syncLock\.current/) &&
                       codeContains(code, /return syncLock\.current/);

  results.push({
    test: 'Sync lock check',
    expected: 'Return existing promise if sync running',
    actual: hasLockCheck ? 'Implemented' : 'Missing',
    passed: hasLockCheck,
    critical: true
  });

  // Check for lock storage
  const hasLockStorage = codeContains(code, /syncLock\.current\s*=\s*syncPromise/);
  results.push({
    test: 'Lock storage',
    expected: 'syncLock.current = syncPromise',
    actual: hasLockStorage ? 'Implemented' : 'Missing',
    passed: hasLockStorage,
    critical: true
  });

  // Check for lock clearing in finally
  const hasLockClear = codeContains(code, /finally[\s\S]*syncLock\.current.*===.*syncPromise[\s\S]*syncLock\.current\s*=\s*null/);

  results.push({
    test: 'Lock cleared in finally',
    expected: 'Clear lock only if still current sync',
    actual: hasLockClear ? 'Implemented' : 'Missing',
    passed: hasLockClear,
    critical: true
  });

  testResults.syncLock = results;
  return results;
}

/**
 * TEST 7: Enhanced Logging
 */
async function testEnhancedLogging() {
  const code = await readSourceFile('src/sync/operationSync.ts');

  const results = [];

  // Check for state snapshot logging
  const hasStateLogging = codeContains(code, /stateBeforeOp/) &&
                          (codeContains(code, /completionsBefore/) || codeContains(code, /completionsAfter/));

  results.push({
    test: 'State snapshot logging',
    expected: 'Log state before/after operation',
    actual: hasStateLogging ? 'Implemented' : 'Missing',
    passed: hasStateLogging,
    critical: false
  });

  // Check for timing information
  const hasTiming = codeContains(code, /startTime.*Date\.now/) &&
                    codeContains(code, /duration.*Date\.now.*startTime/);

  results.push({
    test: 'Operation timing',
    expected: 'Measure and log operation duration',
    actual: hasTiming ? 'Implemented' : 'Missing',
    passed: hasTiming,
    critical: false
  });

  // Check for enhanced error context
  const hasErrorContext = (codeContains(code, /operationId/) && codeContains(code, /sequence/) &&
                           codeContains(code, /timestamp/) && codeContains(code, /entity/)) &&
                          (codeContains(code, /errorCode/) || codeContains(code, /errorStatus/) ||
                           codeContains(code, /errorDetails/));

  results.push({
    test: 'Enhanced error context',
    expected: 'Log full error context with operation details',
    actual: hasErrorContext ? 'Implemented' : 'Missing',
    passed: hasErrorContext,
    critical: false
  });

  testResults.monotonicTimestamps.push(...results);
  return results;
}

/**
 * TEST 8: Active State Clearing
 */
async function testActiveStateClearing() {
  const code = await readSourceFile('src/sync/reducer.ts');

  const results = [];

  // Check for clearing both activeIndex and activeStartTime
  const clearsBoth = codeContains(code, /activeIndex:.*null/) &&
                     codeContains(code, /activeStartTime:.*null/);

  results.push({
    test: 'Clear both activeIndex and activeStartTime',
    expected: 'Both set to null on completion',
    actual: clearsBoth ? 'Both cleared' : 'Only one cleared',
    passed: clearsBoth,
    critical: true
  });

  // Check in COMPLETION_CREATE case
  const completionCreateBlock = code.match(/case\s+'COMPLETION_CREATE'[\s\S]{0,1500}\}/);
  const hasActiveStartTimeInBlock = completionCreateBlock &&
                                    completionCreateBlock[0].includes('activeStartTime') &&
                                    completionCreateBlock[0].includes('null');

  results.push({
    test: 'Cleared in COMPLETION_CREATE reducer',
    expected: 'activeStartTime cleared when completion created',
    actual: hasActiveStartTimeInBlock ? 'Found' : 'Missing',
    passed: hasActiveStartTimeInBlock,
    critical: true
  });

  testResults.protectionFlags.push(...results);
  return results;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.error('🧪 Running race condition and data persistence tests...\n');

  const allResults = [];

  try {
    allResults.push(...await testProtectionFlagTimeouts());
    allResults.push(...await testAbortController());
    allResults.push(...await testAtomicOperations());
    allResults.push(...await testDuplicateDetection());
    allResults.push(...await testMergeMutex());
    allResults.push(...await testSyncLock());
    allResults.push(...await testEnhancedLogging());
    allResults.push(...await testActiveStateClearing());
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    return {
      success: false,
      error: error.message,
      results: allResults
    };
  }

  const criticalTests = allResults.filter(r => r.critical);
  const passedCritical = criticalTests.filter(r => r.passed).length;
  const totalCritical = criticalTests.length;

  const allTests = allResults.length;
  const passedAll = allResults.filter(r => r.passed).length;

  const success = passedCritical === totalCritical;

  return {
    success,
    summary: {
      total: allTests,
      passed: passedAll,
      failed: allTests - passedAll,
      criticalTotal: totalCritical,
      criticalPassed: passedCritical,
      criticalFailed: totalCritical - passedCritical
    },
    results: allResults,
    testResults
  };
}

/**
 * Format test results as readable text
 */
function formatResults(testData) {
  let output = '\n═══════════════════════════════════════════════════════════\n';
  output += '           RACE CONDITION FIX VERIFICATION REPORT\n';
  output += '═══════════════════════════════════════════════════════════\n\n';

  if (!testData.success) {
    output += `❌ TESTS FAILED\n\n`;
    if (testData.error) {
      output += `Error: ${testData.error}\n\n`;
    }
  } else {
    output += `✅ ALL CRITICAL TESTS PASSED\n\n`;
  }

  output += `📊 Summary:\n`;
  output += `   Total Tests: ${testData.summary.total}\n`;
  output += `   Passed: ${testData.summary.passed}\n`;
  output += `   Failed: ${testData.summary.failed}\n`;
  output += `   Critical Passed: ${testData.summary.criticalPassed}/${testData.summary.criticalTotal}\n\n`;

  output += '───────────────────────────────────────────────────────────\n\n';

  // Group results by category
  const categories = [
    { name: 'Protection Flags & Timeouts', key: 'protectionFlags' },
    { name: 'Abort Controller', key: 'abortController' },
    { name: 'Atomic Operations', key: 'atomicOperations' },
    { name: 'Duplicate Detection', key: 'duplicateDetection' },
    { name: 'Merge Mutex', key: 'mergeMutex' },
    { name: 'Sync Lock', key: 'syncLock' },
    { name: 'Enhanced Logging', key: 'monotonicTimestamps' }
  ];

  for (const category of categories) {
    const categoryResults = testData.testResults[category.key];
    if (!categoryResults || categoryResults.length === 0) continue;

    output += `📋 ${category.name}\n`;
    output += `${'─'.repeat(category.name.length + 3)}\n`;

    for (const result of categoryResults) {
      const icon = result.passed ? '✅' : '❌';
      const critical = result.critical ? ' [CRITICAL]' : '';
      output += `${icon} ${result.test}${critical}\n`;
      output += `   Expected: ${result.expected}\n`;
      output += `   Actual: ${result.actual}\n`;
      if (!result.passed) {
        output += `   ⚠️  FIX REQUIRED\n`;
      }
      output += '\n';
    }
  }

  output += '═══════════════════════════════════════════════════════════\n';

  if (testData.success) {
    output += '✅ VERIFICATION COMPLETE - All critical fixes implemented!\n';
  } else {
    output += '❌ VERIFICATION FAILED - Some fixes need attention\n';
  }

  output += '═══════════════════════════════════════════════════════════\n';

  return output;
}

/**
 * Create MCP Server
 */
const server = new Server(
  {
    name: 'navigator-race-condition-tester',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'run_all_tests',
        description: 'Run all race condition and data persistence tests',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_protection_flags',
        description: 'Test protection flag timeouts (finite vs Infinity)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_abort_controller',
        description: 'Test abort controller implementation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_atomic_operations',
        description: 'Test atomic operation service with rollback',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_duplicate_detection',
        description: 'Test 5-second duplicate window',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_merge_mutex',
        description: 'Test merge mutex implementation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'test_sync_lock',
        description: 'Test global sync lock',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    let results;

    switch (name) {
      case 'run_all_tests':
        results = await runAllTests();
        return {
          content: [
            {
              type: 'text',
              text: formatResults(results),
            },
          ],
        };

      case 'test_protection_flags':
        results = await testProtectionFlagTimeouts();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };

      case 'test_abort_controller':
        results = await testAbortController();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };

      case 'test_atomic_operations':
        results = await testAtomicOperations();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };

      case 'test_duplicate_detection':
        results = await testDuplicateDetection();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };

      case 'test_merge_mutex':
        results = await testMergeMutex();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };

      case 'test_sync_lock':
        results = await testSyncLock();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Navigator Race Condition Tester MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
