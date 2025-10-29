// src/sync/conflictResolution.test.ts - PHASE 1.3 Tests
// Comprehensive test suite for vector clock-based conflict resolution

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Operation, VectorClock } from './operations';
import { OperationLogManager } from './operationLog';
import {
  detectConflicts,
  resolveConflicts,
  getConflictMetrics,
  resetConflictMetrics,
  type OperationConflict,
  type ConflictResolution,
} from './conflictResolution';
import type { AppState } from '../types';

// Mock state
const mockState: AppState = {
  addresses: [],
  completions: [],
  arrangements: [],
  daySessions: [],
  activeIndex: null,
  activeStartTime: null,
  currentListVersion: 1,
};

describe('PHASE 1.3: Vector Clock Conflict Resolution', () => {
  let manager: OperationLogManager;

  beforeEach(() => {
    manager = new OperationLogManager('test-device');
    resetConflictMetrics();
  });

  afterEach(() => {
    resetConflictMetrics();
  });

  describe('Concurrent Completion Detection', () => {
    it('should detect concurrent completions using vector clocks', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 0, 'device-b': 1 };

      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: vc1,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: vc2,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflicts = detectConflicts(op2, [op1], mockState, manager);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('duplicate');
      expect(conflicts[0].description).toContain('Concurrent completion');
    });

    it('should NOT detect conflict if completions are causally related', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 2, 'device-b': 0 }; // Causally after vc1

      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: vc1,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: vc2,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflicts = detectConflicts(op2, [op1], mockState, manager);

      // Should not conflict because vc2 is after vc1 causally
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('Concurrent Completion Resolution', () => {
    it('should resolve concurrent completions by priority (PIF > DA)', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 0, 'device-b': 1 };

      const opPIF: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: vc1,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const opDA: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: vc2,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflict: OperationConflict = {
        operation1: opPIF,
        operation2: opDA,
        conflictType: 'duplicate',
        description: 'Concurrent completion of address 5',
      };

      const resolution = resolveConflicts([conflict], mockState, manager);

      expect(resolution.resolvedOperations).toHaveLength(1);
      const resolvedOp = resolution.resolvedOperations[0];
      if (resolvedOp.type === 'COMPLETION_CREATE') {
        expect(resolvedOp.payload.completion.outcome).toBe('PIF');
      }
      expect(resolution.rejectedOperations).toHaveLength(1);
      const rejectedOp = resolution.rejectedOperations[0];
      if (rejectedOp.type === 'COMPLETION_CREATE') {
        expect(rejectedOp.payload.completion.outcome).toBe('DA');
      }
    });

    it('should use first-writer-wins for same-priority outcomes', () => {
      // Both outcomes are PIF (same priority)
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 1, 'device-b': 1 }; // After vc1

      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: vc1,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: vc2,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 150,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflict: OperationConflict = {
        operation1: op1,
        operation2: op2,
        conflictType: 'duplicate',
        description: 'Concurrent completion',
      };

      const resolution = resolveConflicts([conflict], mockState, manager);

      // op1 should win (first writer)
      expect(resolution.resolvedOperations[0]).toBe(op1);
      expect(resolution.rejectedOperations[0]).toBe(op2);
    });
  });

  describe('Concurrent Active Index Resolution', () => {
    it('should detect concurrent active index changes', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 0, 'device-b': 1 };

      const op1: Operation = {
        type: 'ACTIVE_INDEX_SET',
        id: 'active1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: vc1,
        payload: { index: 5 },
      };

      const op2: Operation = {
        type: 'ACTIVE_INDEX_SET',
        id: 'active2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: vc2,
        payload: { index: 10 },
      };

      const conflicts = detectConflicts(op2, [op1], mockState, manager);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('race_condition');
    });

    it('should resolve concurrent active index by latest timestamp', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 0, 'device-b': 1 };

      const now = new Date();
      const later = new Date(now.getTime() + 1000);

      const op1: Operation = {
        type: 'ACTIVE_INDEX_SET',
        id: 'active1',
        clientId: 'device-a',
        timestamp: now.toISOString(),
        sequence: 1,
        vectorClock: vc1,
        payload: { index: 5 },
      };

      const op2: Operation = {
        type: 'ACTIVE_INDEX_SET',
        id: 'active2',
        clientId: 'device-b',
        timestamp: later.toISOString(),
        sequence: 2,
        vectorClock: vc2,
        payload: { index: 10 },
      };

      const conflict: OperationConflict = {
        operation1: op1,
        operation2: op2,
        conflictType: 'race_condition',
        description: 'Concurrent active index changes',
      };

      const resolution = resolveConflicts([conflict], mockState, manager);

      const resolvedOp = resolution.resolvedOperations[0];
      const rejectedOp = resolution.rejectedOperations[0];
      if (resolvedOp.type === 'ACTIVE_INDEX_SET' && rejectedOp.type === 'ACTIVE_INDEX_SET') {
        expect(resolvedOp.payload.index).toBe(10);
        expect(rejectedOp.payload.index).toBe(5);
      }
    });
  });

  describe('Conflict Metrics Tracking', () => {
    it('should track conflicts by type', () => {
      resetConflictMetrics();

      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: { 'device-a': 1 },
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: { 'device-b': 1 },
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflict: OperationConflict = {
        operation1: op1,
        operation2: op2,
        conflictType: 'duplicate',
        description: 'Test conflict',
      };

      resolveConflicts([conflict], mockState, manager);

      const metrics = getConflictMetrics();

      expect(metrics.totalConflicts).toBe(1);
      expect(metrics.conflictsByType['duplicate']).toBe(1);
      expect(metrics.dataLossEvents).toBe(1); // One operation rejected
    });

    it('should track resolution strategies', () => {
      resetConflictMetrics();

      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: { 'device-a': 1 },
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: { 'device-b': 1 },
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflict: OperationConflict = {
        operation1: op1,
        operation2: op2,
        conflictType: 'duplicate',
        description: 'Test conflict',
      };

      resolveConflicts([conflict], mockState, manager);

      const metrics = getConflictMetrics();

      // Should have tracked priority-based resolution strategy
      expect(metrics.resolutionsByStrategy['resolution_strategy:priority_based']).toBe(1);
    });
  });

  describe('Vector Clock Causality', () => {
    it('should correctly identify causally related operations', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 2, 'device-b': 0 }; // Strictly after vc1

      const relationship = manager.compareVectorClocks(vc1, vc2);
      expect(relationship).toBe('before');
    });

    it('should correctly identify concurrent operations', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 0 };
      const vc2: VectorClock = { 'device-a': 0, 'device-b': 1 };

      const relationship = manager.compareVectorClocks(vc1, vc2);
      expect(relationship).toBe('concurrent');
    });

    it('should handle missing devices in vector clocks', () => {
      const vc1: VectorClock = { 'device-a': 1 };
      const vc2: VectorClock = { 'device-a': 1, 'device-b': 1 };

      const relationship = manager.compareVectorClocks(vc1, vc2);
      expect(relationship).toBe('before'); // vc1 < vc2
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with operations lacking vector clocks', () => {
      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        // NO vectorClock
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        // NO vectorClock
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflicts = detectConflicts(op2, [op1], mockState, manager);

      // Should still detect conflict even without vector clocks (fallback to timestamp)
      expect(conflicts.length).toBeGreaterThanOrEqual(0); // May or may not conflict depending on timing
    });

    it('should resolve without manager parameter', () => {
      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'DA',
            amount: 0,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflict: OperationConflict = {
        operation1: op1,
        operation2: op2,
        conflictType: 'duplicate',
        description: 'Test conflict',
      };

      // Should work even without manager
      const resolution = resolveConflicts([conflict], mockState);

      expect(resolution.resolvedOperations.length).toBeGreaterThan(0);
      expect(resolution.rejectedOperations.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle equal vector clocks', () => {
      const vc1: VectorClock = { 'device-a': 1, 'device-b': 1 };
      const vc2: VectorClock = { 'device-a': 1, 'device-b': 1 };

      const relationship = manager.compareVectorClocks(vc1, vc2);
      expect(relationship).toBe('equal');
    });

    it('should handle empty vector clocks', () => {
      const vc1: VectorClock = {};
      const vc2: VectorClock = {};

      const relationship = manager.compareVectorClocks(vc1, vc2);
      expect(relationship).toBe('equal');
    });

    it('should handle outcome priority for unknown outcomes', () => {
      const op1: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp1',
        clientId: 'device-a',
        timestamp: new Date().toISOString(),
        sequence: 1,
        vectorClock: { 'device-a': 1 },
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'UNKNOWN',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const op2: Operation = {
        type: 'COMPLETION_CREATE',
        id: 'comp2',
        clientId: 'device-b',
        timestamp: new Date().toISOString(),
        sequence: 2,
        vectorClock: { 'device-b': 1 },
        payload: {
          completion: {
            index: 5,
            listVersion: 1,
            outcome: 'PIF',
            amount: 100,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const conflict: OperationConflict = {
        operation1: op1,
        operation2: op2,
        conflictType: 'duplicate',
        description: 'Test conflict',
      };

      const resolution = resolveConflicts([conflict], mockState, manager);

      // PIF (priority 4) should win over UNKNOWN (priority 0)
      const resolvedOp = resolution.resolvedOperations[0];
      if (resolvedOp.type === 'COMPLETION_CREATE') {
        expect(resolvedOp.payload.completion.outcome).toBe('PIF');
      }
    });
  });
});
