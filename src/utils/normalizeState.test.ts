// src/utils/normalizeState.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeState, normalizeBackupData } from './normalizeState';
import type { AppState } from '../types';

describe('normalizeState', () => {
  it('should handle valid state without modification', () => {
    const validState: AppState = {
      addresses: [{ address: '123 Test St' }],
      completions: [{
        index: 0,
        address: '123 Test St',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      }],
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
        agentProfile: { name: 'Test', title: 'Agent', signature: 'Test' },
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

    const normalized = normalizeState(validState);

    expect(normalized.addresses).toEqual(validState.addresses);
    expect(normalized.completions).toEqual(validState.completions);
    expect(normalized.currentListVersion).toBe(1);
  });

  it('should provide defaults for missing fields', () => {
    const partialState: any = {
      addresses: [{ address: '123 Test St' }],
      completions: [],
    };

    const normalized = normalizeState(partialState);

    expect(normalized.addresses).toBeDefined();
    expect(normalized.completions).toBeDefined();
    expect(normalized.arrangements).toBeDefined();
    expect(normalized.daySessions).toBeDefined();
    expect(normalized.currentListVersion).toBeDefined();
    // normalizeState uses spread operator, so existing fields are preserved
    expect(normalized.arrangements).toEqual([]);
    expect(normalized.daySessions).toEqual([]);
    expect(normalized.currentListVersion).toBe(1);
  });

  it('should preserve completions as-is (no validation)', () => {
    const stateWithInvalid: any = {
      addresses: [],
      completions: [
        {
          index: 0,
          address: '123 Test St',
          outcome: 'PIF',
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          index: 1,
          address: '456 Oak Ave',
          outcome: 'INVALID_OUTCOME', // Invalid outcome (but normalizeState doesn't validate)
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          // Missing required fields (but normalizeState doesn't validate)
          address: '789 Main St',
        },
      ],
      arrangements: [],
      daySessions: [],
      activeIndex: null,
      currentListVersion: 1,
    };

    const normalized = normalizeState(stateWithInvalid);

    // normalizeState doesn't validate content, just ensures it's an array
    expect(normalized.completions).toEqual(stateWithInvalid.completions);
    expect(normalized.completions).toHaveLength(3);
  });

  it('should set default currentListVersion when missing', () => {
    const stateWithoutVersion: any = {
      addresses: [],
      completions: [
        {
          index: 0,
          address: '123 Test St',
          outcome: 'PIF',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
      arrangements: [],
      daySessions: [],
      activeIndex: null,
      // currentListVersion is missing
    };

    const normalized = normalizeState(stateWithoutVersion);

    // Should default currentListVersion to 1
    expect(normalized.currentListVersion).toBe(1);
  });

  it('should handle empty state', () => {
    const emptyState: any = {};

    const normalized = normalizeState(emptyState);

    expect(Array.isArray(normalized.addresses)).toBe(true);
    expect(Array.isArray(normalized.completions)).toBe(true);
    expect(Array.isArray(normalized.arrangements)).toBe(true);
    expect(Array.isArray(normalized.daySessions)).toBe(true);
    expect(normalized.addresses).toHaveLength(0);
  });

  it('should handle null/undefined state', () => {
    const normalized1 = normalizeState(null as any);
    const normalized2 = normalizeState(undefined as any);

    expect(normalized1).toBeDefined();
    expect(normalized2).toBeDefined();
    expect(Array.isArray(normalized1.addresses)).toBe(true);
    expect(Array.isArray(normalized2.addresses)).toBe(true);
  });

  it('should preserve valid nested data', () => {
    const stateWithArrangements: any = {
      addresses: [],
      completions: [],
      arrangements: [
        {
          id: 'arr1',
          addressIndex: 0,
          address: '123 Test St',
          status: 'Scheduled',
          scheduledDate: '2025-01-15',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
      daySessions: [
        {
          date: '2025-01-01',
          start: '2025-01-01T09:00:00Z',
          end: '2025-01-01T17:00:00Z',
          durationSeconds: 28800,
        },
      ],
      activeIndex: null,
      currentListVersion: 1,
    };

    const normalized = normalizeState(stateWithArrangements);

    expect(normalized.arrangements).toHaveLength(1);
    expect(normalized.arrangements[0].id).toBe('arr1');
    expect(normalized.daySessions).toHaveLength(1);
    expect(normalized.daySessions[0].date).toBe('2025-01-01');
  });
});

describe('normalizeBackupData', () => {
  it('should normalize backup data structure', () => {
    const backupData = {
      addresses: [{ address: '123 Test St' }],
      completions: [],
      arrangements: [],
      activeIndex: null,
      currentListVersion: 1,
    };

    const normalized = normalizeBackupData(backupData);

    expect(normalized).toBeDefined();
    expect(normalized.addresses).toEqual(backupData.addresses);
    // daySessions are deliberately excluded from backups
    expect(normalized).not.toHaveProperty('daySessions');
  });

  it('should handle backup without data field', () => {
    const backupData: any = {
      addresses: [{ address: '123 Test St' }],
      completions: [],
    };

    const normalized = normalizeBackupData(backupData);

    expect(normalized).toBeDefined();
    expect(normalized.addresses).toBeDefined();
  });

  it('should handle invalid backup data', () => {
    const normalized = normalizeBackupData(null as any);

    expect(normalized).toBeDefined();
    expect(Array.isArray(normalized.addresses)).toBe(true);
  });
});
