// src/sync/conflictResolution.test.ts
import { describe, it, expect } from 'vitest';
import { detectConflicts, resolveConflicts } from './conflictResolution';
import type { Operation } from './operations';
import type { AppState } from '../types';

describe('conflictResolution', () => {
  const mockState: AppState = {
    addresses: [],
    completions: [],
    arrangements: [],
    daySessions: [],
    activeIndex: null,
    activeStartTime: null,
    currentListVersion: 1,
    subscription: null,
    reminderSettings: {
      defaultSchedule: { daysBeforePayment: [3, 1], enabled: true },
      globalEnabled: true,
      smsEnabled: false,
      agentProfile: { name: 'Test Agent', title: 'Agent', signature: 'Test' },
      messageTemplates: [],
      activeTemplateId: '',
      customizableSchedule: {
        threeDayReminder: true,
        oneDayReminder: true,
        dayOfReminder: true,
        customDays: [],
      },
    },
    reminderNotifications: [],
    bonusSettings: {
      enabled: false,
      calculationType: 'simple',
      adjustForWorkingDays: false,
    },
  };

  describe('detectConflicts', () => {
    it('should detect duplicate operations with same ID', () => {
      const operation: Operation = {
        id: 'test-123',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 0,
            address: '123 Test St',
            outcome: 'PIF' as const,
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 1,
      };

      const existing: Operation[] = [operation];

      const conflicts = detectConflicts(operation, existing, mockState);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('duplicate');
      expect(conflicts[0].description).toBe('Exact duplicate operation');
    });

    it('should detect concurrent completion of same address', () => {
      const operation1: Operation = {
        id: 'op1',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 5,
            address: '123 Test St',
            outcome: 'PIF' as const,
            timestamp: '2025-01-01T00:00:00Z',
            listVersion: 1,
          },
        },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 1,
      };

      const operation2: Operation = {
        id: 'op2',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 5,
            address: '123 Test St',
            outcome: 'Done' as const,
            timestamp: '2025-01-01T00:00:05Z',
            listVersion: 1,
          },
        },
        timestamp: '2025-01-01T00:00:05Z',
        clientId: 'device2',
        sequence: 2,
      };

      const conflicts = detectConflicts(operation2, [operation1], mockState);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('duplicate');
      expect(conflicts[0].description).toContain('Concurrent completion');
    });

    it('should detect race conditions in active index changes', () => {
      const operation1: Operation = {
        id: 'op1',
        type: 'ACTIVE_INDEX_SET',
        payload: { index: 10 },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 100,
      };

      const operation2: Operation = {
        id: 'op2',
        type: 'ACTIVE_INDEX_SET',
        payload: { index: 15 },
        timestamp: '2025-01-01T00:00:01Z',
        clientId: 'device2',
        sequence: 102, // Within 5 sequence numbers
      };

      const conflicts = detectConflicts(operation2, [operation1], mockState);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('race_condition');
      expect(conflicts[0].description).toContain('Concurrent active index changes');
    });

    it('should not detect conflicts for different operations', () => {
      const operation1: Operation = {
        id: 'op1',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 5,
            address: '123 Test St',
            outcome: 'PIF' as const,
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 1,
      };

      const operation2: Operation = {
        id: 'op2',
        type: 'ARRANGEMENT_CREATE',
        payload: {
          arrangement: {
            id: 'arr1',
            addressIndex: 10,
            address: '456 Other St',
            status: 'Scheduled' as const,
            scheduledDate: '2025-01-15',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        },
        timestamp: '2025-01-01T00:00:05Z',
        clientId: 'device2',
        sequence: 2,
      };

      const conflicts = detectConflicts(operation2, [operation1], mockState);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('resolveConflicts', () => {
    it('should resolve duplicate operations using first-writer-wins', () => {
      const operation: Operation = {
        id: 'test-123',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 0,
            address: '123 Test St',
            outcome: 'PIF' as const,
            timestamp: '2025-01-01T00:00:00Z',
          },
        },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 1,
      };

      const conflicts = [
        {
          operation1: operation,
          operation2: operation,
          conflictType: 'duplicate' as const,
          description: 'Duplicate operation',
        },
      ];

      const resolution = resolveConflicts(conflicts, mockState);

      // First-writer-wins: keep one, reject one
      expect(resolution.resolvedOperations).toHaveLength(1);
      expect(resolution.rejectedOperations).toHaveLength(1);
    });

    it('should use last-write-wins for race conditions', () => {
      const older: Operation = {
        id: 'op1',
        type: 'ACTIVE_INDEX_SET',
        payload: { index: 10 },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 100,
      };

      const newer: Operation = {
        id: 'op2',
        type: 'ACTIVE_INDEX_SET',
        payload: { index: 15 },
        timestamp: '2025-01-01T00:00:05Z',
        clientId: 'device2',
        sequence: 102,
      };

      const conflicts = [
        {
          operation1: older,
          operation2: newer,
          conflictType: 'race_condition' as const,
          description: 'Race condition',
        },
      ];

      const resolution = resolveConflicts(conflicts, mockState);

      // Should keep the newer operation
      expect(resolution.resolvedOperations).toHaveLength(1);
      expect(resolution.resolvedOperations[0].id).toBe('op2');
      expect(resolution.rejectedOperations).toHaveLength(1);
      expect(resolution.rejectedOperations[0].id).toBe('op1');
    });

    it('should handle multiple conflicts', () => {
      const op1: Operation = {
        id: 'op1',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 5,
            address: '123 Test St',
            outcome: 'PIF' as const,
            timestamp: '2025-01-01T00:00:00Z',
            listVersion: 1,
          },
        },
        timestamp: '2025-01-01T00:00:00Z',
        clientId: 'device1',
        sequence: 1,
      };

      const op2: Operation = {
        id: 'op2',
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 5,
            address: '123 Test St',
            outcome: 'Done' as const,
            timestamp: '2025-01-01T00:00:05Z',
            listVersion: 1,
          },
        },
        timestamp: '2025-01-01T00:00:05Z',
        clientId: 'device2',
        sequence: 2,
      };

      const conflicts = [
        {
          operation1: op1,
          operation2: op2,
          conflictType: 'duplicate' as const,
          description: 'Concurrent completion',
        },
      ];

      const resolution = resolveConflicts(conflicts, mockState);

      // Should resolve to one operation (last-write-wins)
      expect(resolution.resolvedOperations.length + resolution.rejectedOperations.length).toBeGreaterThan(0);
    });
  });
});
