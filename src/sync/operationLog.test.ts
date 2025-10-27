/**
 * Tests for atomic operation log merge
 * Verifies that merge is all-or-nothing (atomicity)
 * Tests crash recovery and consistency validation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Operation } from './operations';
import { OperationLogManager, type OperationLog } from './operationLog';

// Mock storageManager
vi.mock('../utils/storageManager', () => ({
  storageManager: {
    queuedGet: vi.fn(),
    queuedSet: vi.fn(),
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock operations sequence
vi.mock('./operations', () => ({
  nextSequence: vi.fn(async () => {
    let counter = 0;
    return async () => ++counter;
  }),
  setSequence: vi.fn(),
}));

describe('OperationLogManager - Atomic Merge Tests', () => {
  let manager: OperationLogManager;
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    // Create a simple in-memory storage mock
    mockStorage = new Map();

    // Setup storage mock functions
    const { storageManager } = require('../utils/storageManager');
    storageManager.queuedGet.mockImplementation(async (key: string) => mockStorage.get(key) || null);
    storageManager.queuedSet.mockImplementation(async (key: string, value: any) => {
      if (value === null) {
        mockStorage.delete(key);
      } else {
        mockStorage.set(key, value);
      }
    });

    manager = new OperationLogManager('device-1');
  });

  describe('Atomic Merge: All-or-Nothing', () => {
    it('should merge all operations or none at all (not partial)', async () => {
      await manager.load();

      const remoteOps: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
        {
          id: 'op-2',
          type: 'COMPLETION_CREATE',
          sequence: 2,
          timestamp: '2025-01-01T00:00:01Z',
          clientId: 'device-2',
          payload: { completion: { id: '2', index: 1, outcome: 'ARR', timestamp: '2025-01-01T00:00:01Z' } },
        },
        {
          id: 'op-3',
          type: 'COMPLETION_CREATE',
          sequence: 3,
          timestamp: '2025-01-01T00:00:02Z',
          clientId: 'device-2',
          payload: { completion: { id: '3', index: 2, outcome: 'DONE', timestamp: '2025-01-01T00:00:02Z' } },
        },
      ];

      const result = await manager.mergeRemoteOperations(remoteOps);

      // All operations should be merged
      expect(result).toHaveLength(3);
      expect(manager.getAllOperations()).toHaveLength(3);

      // Verify transaction log is cleared (merge complete)
      const { storageManager } = require('../utils/storageManager');
      const txLog = mockStorage.get('navigator_transaction_log_v1');
      expect(txLog).toBeNull();
    });

    it('should skip duplicate operations (already in log)', async () => {
      await manager.load();

      // First merge
      const remoteOps1: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
      ];

      const result1 = await manager.mergeRemoteOperations(remoteOps1);
      expect(result1).toHaveLength(1);

      // Second merge with same operation
      const result2 = await manager.mergeRemoteOperations(remoteOps1);
      expect(result2).toHaveLength(0); // No new operations

      // Total should still be 1
      expect(manager.getAllOperations()).toHaveLength(1);
    });

    it('should skip operations from self (same clientId)', async () => {
      await manager.load();

      const remoteOps: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-1', // Same as manager deviceId
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
      ];

      const result = await manager.mergeRemoteOperations(remoteOps);

      // Should not merge self operations
      expect(result).toHaveLength(0);
      expect(manager.getAllOperations()).toHaveLength(0);
    });

    it('should maintain sequence order after merge', async () => {
      await manager.load();

      // Add some local operations first
      const localOp: Operation = {
        id: 'local-1',
        type: 'COMPLETION_CREATE',
        sequence: 5,
        timestamp: '2025-01-01T00:00:05Z',
        clientId: 'device-1',
        payload: { completion: { id: 'local', index: 10, outcome: 'PIF', timestamp: '2025-01-01T00:00:05Z' } },
      };

      // Manually add to log
      manager['log'].operations.push(localOp);
      manager['log'].lastSequence = 5;

      // Merge remote operations with lower sequences
      const remoteOps: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 2,
          timestamp: '2025-01-01T00:00:02Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:02Z' } },
        },
        {
          id: 'op-3',
          type: 'COMPLETION_CREATE',
          sequence: 4,
          timestamp: '2025-01-01T00:00:04Z',
          clientId: 'device-2',
          payload: { completion: { id: '3', index: 2, outcome: 'DONE', timestamp: '2025-01-01T00:00:04Z' } },
        },
      ];

      await manager.mergeRemoteOperations(remoteOps);

      // Verify operations are sorted by sequence
      const ops = manager.getAllOperations();
      expect(ops[0].sequence).toBe(2);
      expect(ops[1].sequence).toBe(4);
      expect(ops[2].sequence).toBe(5);
    });
  });

  describe('Crash Recovery: Transaction Log', () => {
    it('should recover from incomplete merge (checkpoint before crash)', async () => {
      const { storageManager } = require('../utils/storageManager');

      // Simulate incomplete transaction in storage
      const incompleteTransaction = {
        isInProgress: true,
        operationsBefore: [],
        operationsToMerge: [
          {
            id: 'op-1',
            type: 'COMPLETION_CREATE',
            sequence: 1,
            timestamp: '2025-01-01T00:00:00Z',
            clientId: 'device-2',
            payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
          },
        ],
        lastSequenceBefore: 0,
        lastSyncSequenceBefore: 0,
        checksumBefore: '0',
        timestamp: '2025-01-01T00:00:00Z',
      };

      mockStorage.set('navigator_transaction_log_v1', incompleteTransaction);

      // Load should recover from incomplete transaction
      await manager.load();

      // Transaction log should be cleared after recovery
      const txLog = mockStorage.get('navigator_transaction_log_v1');
      expect(txLog).toBeNull();

      const { logger } = require('../utils/logger');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('ATOMIC'));
    });

    it('should detect and fix state mismatch after partial merge', async () => {
      const { storageManager } = require('../utils/storageManager');

      // Simulate partial merge: transaction log and main log out of sync
      const beforeLog: OperationLog = {
        operations: [],
        lastSequence: 0,
        lastSyncSequence: 0,
        checksum: '0',
      };

      const partialLog: OperationLog = {
        operations: [
          {
            id: 'op-1',
            type: 'COMPLETION_CREATE',
            sequence: 1,
            timestamp: '2025-01-01T00:00:00Z',
            clientId: 'device-2',
            payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
          },
        ],
        lastSequence: 1,
        lastSyncSequence: 0,
        checksum: 'abc123',
      };

      const incompleteTransaction = {
        isInProgress: true,
        operationsBefore: beforeLog.operations,
        operationsToMerge: partialLog.operations,
        lastSequenceBefore: 0,
        lastSyncSequenceBefore: 0,
        checksumBefore: '0',
        timestamp: '2025-01-01T00:00:00Z',
      };

      mockStorage.set('navigator_operation_log_v1', partialLog);
      mockStorage.set('navigator_transaction_log_v1', incompleteTransaction);

      // Load should detect mismatch
      await manager.load();

      // Should restore to before-state
      const restored = mockStorage.get('navigator_operation_log_v1');
      expect(restored.operations).toHaveLength(0);
      expect(restored.checksum).toBe('0');

      // Transaction log should be cleared
      expect(mockStorage.get('navigator_transaction_log_v1')).toBeNull();
    });
  });

  describe('Sequence Continuity Validation', () => {
    it('should detect and log sequence gaps', async () => {
      await manager.load();

      // Create operations with gap in sequence
      const remoteOps: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
        {
          id: 'op-3',
          type: 'COMPLETION_CREATE',
          sequence: 5, // Gap: should be 2
          timestamp: '2025-01-01T00:00:05Z',
          clientId: 'device-2',
          payload: { completion: { id: '3', index: 2, outcome: 'DONE', timestamp: '2025-01-01T00:00:05Z' } },
        },
      ];

      await manager.mergeRemoteOperations(remoteOps);

      const { logger } = require('../utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Sequence gaps detected'),
        expect.objectContaining({
          gaps: expect.arrayContaining([{ from: 1, to: 5 }]),
        })
      );
    });

    it('should handle operations with non-consecutive sequences', async () => {
      await manager.load();

      const remoteOps: Operation[] = [
        {
          id: 'op-100',
          type: 'COMPLETION_CREATE',
          sequence: 100,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '100', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
        {
          id: 'op-200',
          type: 'COMPLETION_CREATE',
          sequence: 200,
          timestamp: '2025-01-01T00:00:01Z',
          clientId: 'device-2',
          payload: { completion: { id: '200', index: 1, outcome: 'ARR', timestamp: '2025-01-01T00:00:01Z' } },
        },
      ];

      const result = await manager.mergeRemoteOperations(remoteOps);

      // Should merge despite gap (might be from other devices)
      expect(result).toHaveLength(2);
      expect(manager.getLogState().lastSequence).toBe(200);
    });
  });

  describe('Checksum Validation', () => {
    it('should update checksum after successful merge', async () => {
      await manager.load();

      const beforeChecksum = manager.getLogState().checksum;

      const remoteOps: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
      ];

      await manager.mergeRemoteOperations(remoteOps);

      const afterChecksum = manager.getLogState().checksum;

      // Checksum should change after adding operations
      expect(beforeChecksum).not.toBe(afterChecksum);
      expect(beforeChecksum).toBe('0'); // Empty log checksum
      expect(afterChecksum).toBeTruthy();
    });

    it('should compute consistent checksum for same operations', async () => {
      await manager.load();

      const remoteOps: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
      ];

      await manager.mergeRemoteOperations(remoteOps);
      const checksum1 = manager.getLogState().checksum;

      // Get log state and manually verify
      const log1 = manager.getLogState();
      await manager.clear();
      await manager.mergeRemoteOperations(remoteOps);
      const checksum2 = manager.getLogState().checksum;

      // Same operations should produce same checksum
      expect(checksum1).toBe(checksum2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty remote operations list', async () => {
      await manager.load();

      const result = await manager.mergeRemoteOperations([]);

      expect(result).toHaveLength(0);
      expect(manager.getAllOperations()).toHaveLength(0);
    });

    it('should handle very large merge (1000+ operations)', async () => {
      await manager.load();

      const remoteOps: Operation[] = [];
      for (let i = 1; i <= 1000; i++) {
        remoteOps.push({
          id: `op-${i}`,
          type: 'COMPLETION_CREATE',
          sequence: i,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          clientId: 'device-2',
          payload: { completion: { id: `${i}`, index: i, outcome: 'PIF', timestamp: new Date(Date.now() + i * 1000).toISOString() } },
        });
      }

      const result = await manager.mergeRemoteOperations(remoteOps);

      expect(result).toHaveLength(1000);
      expect(manager.getAllOperations()).toHaveLength(1000);
      expect(manager.getLogState().lastSequence).toBe(1000);
    });

    it('should maintain consistency when merging mixed new and duplicate operations', async () => {
      await manager.load();

      const remoteOps1: Operation[] = [
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
        {
          id: 'op-2',
          type: 'COMPLETION_CREATE',
          sequence: 2,
          timestamp: '2025-01-01T00:00:01Z',
          clientId: 'device-2',
          payload: { completion: { id: '2', index: 1, outcome: 'ARR', timestamp: '2025-01-01T00:00:01Z' } },
        },
      ];

      const remoteOps2: Operation[] = [
        // Duplicate
        {
          id: 'op-1',
          type: 'COMPLETION_CREATE',
          sequence: 1,
          timestamp: '2025-01-01T00:00:00Z',
          clientId: 'device-2',
          payload: { completion: { id: '1', index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' } },
        },
        // New
        {
          id: 'op-3',
          type: 'COMPLETION_CREATE',
          sequence: 3,
          timestamp: '2025-01-01T00:00:02Z',
          clientId: 'device-2',
          payload: { completion: { id: '3', index: 2, outcome: 'DONE', timestamp: '2025-01-01T00:00:02Z' } },
        },
      ];

      const result1 = await manager.mergeRemoteOperations(remoteOps1);
      expect(result1).toHaveLength(2);

      const result2 = await manager.mergeRemoteOperations(remoteOps2);
      expect(result2).toHaveLength(1); // Only op-3 is new

      expect(manager.getAllOperations()).toHaveLength(3);
    });
  });
});
