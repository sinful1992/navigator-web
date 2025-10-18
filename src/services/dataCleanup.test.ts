// src/services/dataCleanup.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  performDataCleanup,
  applyDataCleanup,
  shouldRunCleanup,
} from './dataCleanup';
import type { AppState } from '../types';

describe('dataCleanup', () => {
  const CLEANUP_KEY = 'navigator_last_cleanup';

  // Helper to create mock state
  const createMockState = (): AppState => ({
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
    },
  });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('shouldRunCleanup', () => {
    it('should return true when no cleanup has been performed', () => {
      expect(shouldRunCleanup()).toBe(true);
    });

    it('should return false when cleanup ran recently (< 24 hours)', () => {
      const recentTime = Date.now() - 12 * 60 * 60 * 1000; // 12 hours ago
      localStorage.setItem(CLEANUP_KEY, recentTime.toString());

      expect(shouldRunCleanup()).toBe(false);
    });

    it('should return true when cleanup ran 24+ hours ago', () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      localStorage.setItem(CLEANUP_KEY, oldTime.toString());

      expect(shouldRunCleanup()).toBe(true);
    });

    it('should return true when localStorage value is invalid', () => {
      localStorage.setItem(CLEANUP_KEY, 'invalid-timestamp');

      expect(shouldRunCleanup()).toBe(true);
    });

    it('should return true when localStorage value is NaN', () => {
      localStorage.setItem(CLEANUP_KEY, 'NaN');

      expect(shouldRunCleanup()).toBe(true);
    });

    it('should handle edge case of exactly 24 hours', () => {
      const exactlyOneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      localStorage.setItem(CLEANUP_KEY, exactlyOneDayAgo.toString());

      expect(shouldRunCleanup()).toBe(true);
    });
  });

  describe('performDataCleanup', () => {
    it('should return null if cleanup already ran today', async () => {
      const recentTime = Date.now() - 12 * 60 * 60 * 1000; // 12 hours ago
      localStorage.setItem(CLEANUP_KEY, recentTime.toString());

      const state = createMockState();
      const result = await performDataCleanup(state, 3);

      expect(result).toBeNull();
    });

    it('should return zeros if keepDataForMonths is 0 (forever)', async () => {
      const state = createMockState();
      const result = await performDataCleanup(state, 0);

      expect(result).toEqual({
        deletedCompletions: 0,
        deletedArrangements: 0,
        deletedSessions: 0,
      });
    });

    it('should update localStorage timestamp when keepDataForMonths is 0', async () => {
      const beforeTime = Date.now();
      const state = createMockState();
      await performDataCleanup(state, 0);
      const afterTime = Date.now();

      const storedTime = parseInt(localStorage.getItem(CLEANUP_KEY)!, 10);
      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it('should count old completions (3 months)', async () => {
      const state = createMockState();
      const now = new Date();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(now.getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
        {
          index: 1,
          address: 'Recent',
          outcome: 'PIF' as const,
          timestamp: now.toISOString(),
        },
      ];

      const result = await performDataCleanup(state, 3);

      expect(result?.deletedCompletions).toBe(1);
      expect(result?.deletedArrangements).toBe(0);
      expect(result?.deletedSessions).toBe(0);
    });

    it('should count old arrangements (6 months)', async () => {
      const state = createMockState();
      const now = new Date();
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(now.getMonth() - 7);
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(now.getMonth() - 2);

      state.arrangements = [
        {
          id: 'arr1',
          addressIndex: 0,
          address: 'Old',
          status: 'Scheduled' as const,
          scheduledDate: '2025-01-01',
          createdAt: sevenMonthsAgo.toISOString(),
          updatedAt: sevenMonthsAgo.toISOString(),
        },
        {
          id: 'arr2',
          addressIndex: 1,
          address: 'Recent',
          status: 'Scheduled' as const,
          scheduledDate: '2025-01-01',
          createdAt: twoMonthsAgo.toISOString(),
          updatedAt: twoMonthsAgo.toISOString(),
        },
      ];

      const result = await performDataCleanup(state, 6);

      expect(result?.deletedCompletions).toBe(0);
      expect(result?.deletedArrangements).toBe(1);
      expect(result?.deletedSessions).toBe(0);
    });

    it('should count old day sessions (12 months)', async () => {
      const state = createMockState();
      const now = new Date();
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(now.getMonth() - 13);

      state.daySessions = [
        {
          date: thirteenMonthsAgo.toISOString().split('T')[0],
          start: thirteenMonthsAgo.toISOString(),
          end: thirteenMonthsAgo.toISOString(),
          durationSeconds: 28800,
        },
        {
          date: now.toISOString().split('T')[0],
          start: now.toISOString(),
          end: now.toISOString(),
          durationSeconds: 28800,
        },
      ];

      const result = await performDataCleanup(state, 12);

      expect(result?.deletedCompletions).toBe(0);
      expect(result?.deletedArrangements).toBe(0);
      expect(result?.deletedSessions).toBe(1);
    });

    it('should not count items without timestamps', async () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'No timestamp',
          outcome: 'PIF' as const,
          timestamp: undefined as any,
        },
        {
          index: 1,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
      ];

      const result = await performDataCleanup(state, 3);

      // Should only count the one with timestamp that's old
      expect(result?.deletedCompletions).toBe(1);
    });

    it('should update localStorage with current timestamp', async () => {
      const beforeTime = Date.now();
      const state = createMockState();
      await performDataCleanup(state, 3);
      const afterTime = Date.now();

      const storedTime = parseInt(localStorage.getItem(CLEANUP_KEY)!, 10);
      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it('should count multiple types of old items', async () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
        {
          index: 1,
          address: 'Old2',
          outcome: 'Done' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
      ];

      state.arrangements = [
        {
          id: 'arr1',
          addressIndex: 0,
          address: 'Old',
          status: 'Scheduled' as const,
          scheduledDate: '2025-01-01',
          createdAt: fourMonthsAgo.toISOString(),
          updatedAt: fourMonthsAgo.toISOString(),
        },
      ];

      state.daySessions = [
        {
          date: fourMonthsAgo.toISOString().split('T')[0],
          start: fourMonthsAgo.toISOString(),
          end: fourMonthsAgo.toISOString(),
          durationSeconds: 28800,
        },
      ];

      const result = await performDataCleanup(state, 3);

      expect(result?.deletedCompletions).toBe(2);
      expect(result?.deletedArrangements).toBe(1);
      expect(result?.deletedSessions).toBe(1);
    });
  });

  describe('applyDataCleanup', () => {
    it('should return unchanged state if keepDataForMonths is 0', () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 0);

      expect(result).toBe(state);
      expect(result.completions).toHaveLength(1);
    });

    it('should remove old completions (3 months)', () => {
      const state = createMockState();
      const now = new Date();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(now.getMonth() - 4);
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(now.getMonth() - 2);

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
        {
          index: 1,
          address: 'Recent',
          outcome: 'Done' as const,
          timestamp: twoMonthsAgo.toISOString(),
        },
        {
          index: 2,
          address: 'Today',
          outcome: 'PIF' as const,
          timestamp: now.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 3);

      expect(result.completions).toHaveLength(2);
      expect(result.completions[0].address).toBe('Recent');
      expect(result.completions[1].address).toBe('Today');
    });

    it('should remove old arrangements (6 months)', () => {
      const state = createMockState();
      const now = new Date();
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(now.getMonth() - 7);
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(now.getMonth() - 4);

      state.arrangements = [
        {
          id: 'arr1',
          addressIndex: 0,
          address: 'Old',
          status: 'Scheduled' as const,
          scheduledDate: '2025-01-01',
          createdAt: sevenMonthsAgo.toISOString(),
          updatedAt: sevenMonthsAgo.toISOString(),
        },
        {
          id: 'arr2',
          addressIndex: 1,
          address: 'Recent',
          status: 'Scheduled' as const,
          scheduledDate: '2025-01-01',
          createdAt: fourMonthsAgo.toISOString(),
          updatedAt: fourMonthsAgo.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 6);

      expect(result.arrangements).toHaveLength(1);
      expect(result.arrangements[0].id).toBe('arr2');
    });

    it('should remove old day sessions (12 months)', () => {
      const state = createMockState();
      const now = new Date();
      const thirteenMonthsAgo = new Date();
      thirteenMonthsAgo.setMonth(now.getMonth() - 13);
      const elevenMonthsAgo = new Date();
      elevenMonthsAgo.setMonth(now.getMonth() - 11);

      state.daySessions = [
        {
          date: thirteenMonthsAgo.toISOString().split('T')[0],
          start: thirteenMonthsAgo.toISOString(),
          end: thirteenMonthsAgo.toISOString(),
          durationSeconds: 28800,
        },
        {
          date: elevenMonthsAgo.toISOString().split('T')[0],
          start: elevenMonthsAgo.toISOString(),
          end: elevenMonthsAgo.toISOString(),
          durationSeconds: 28800,
        },
      ];

      const result = applyDataCleanup(state, 12);

      expect(result.daySessions).toHaveLength(1);
      expect(result.daySessions[0].date).toBe(elevenMonthsAgo.toISOString().split('T')[0]);
    });

    it('should keep items without timestamps', () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'No timestamp',
          outcome: 'PIF' as const,
          timestamp: undefined as any,
        },
        {
          index: 1,
          address: 'Old',
          outcome: 'Done' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 3);

      // Should keep the one without timestamp, delete the old one
      expect(result.completions).toHaveLength(1);
      expect(result.completions[0].address).toBe('No timestamp');
    });

    it('should preserve other state fields', () => {
      const state = createMockState();
      state.addresses = [{ address: '123 Test St' }];
      state.activeIndex = 5;
      state.currentListVersion = 42;

      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 3);

      expect(result.addresses).toEqual(state.addresses);
      expect(result.activeIndex).toBe(5);
      expect(result.currentListVersion).toBe(42);
      expect(result.reminderSettings).toEqual(state.reminderSettings);
    });

    it('should handle empty arrays', () => {
      const state = createMockState();

      const result = applyDataCleanup(state, 3);

      expect(result.completions).toEqual([]);
      expect(result.arrangements).toEqual([]);
      expect(result.daySessions).toEqual([]);
    });

    it('should handle all items being recent', () => {
      const state = createMockState();
      const now = new Date();
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);

      state.completions = [
        {
          index: 0,
          address: 'Recent',
          outcome: 'PIF' as const,
          timestamp: yesterday.toISOString(),
        },
        {
          index: 1,
          address: 'Today',
          outcome: 'Done' as const,
          timestamp: now.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 3);

      expect(result.completions).toHaveLength(2);
    });

    it('should handle all items being old', () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);
      const fiveMonthsAgo = new Date();
      fiveMonthsAgo.setMonth(new Date().getMonth() - 5);

      state.completions = [
        {
          index: 0,
          address: 'Old1',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
        {
          index: 1,
          address: 'Old2',
          outcome: 'Done' as const,
          timestamp: fiveMonthsAgo.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 3);

      expect(result.completions).toHaveLength(0);
    });

    it('should handle edge case of exactly threshold date', () => {
      const state = createMockState();
      const exactlyThreeMonthsAgo = new Date();
      exactlyThreeMonthsAgo.setMonth(new Date().getMonth() - 3);

      state.completions = [
        {
          index: 0,
          address: 'Exactly 3 months',
          outcome: 'PIF' as const,
          timestamp: exactlyThreeMonthsAgo.toISOString(),
        },
      ];

      const result = applyDataCleanup(state, 3);

      // Should keep items from exactly threshold date (>= comparison)
      expect(result.completions).toHaveLength(1);
    });
  });

  describe('integration scenarios', () => {
    it('should work with performDataCleanup and applyDataCleanup together', async () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);
      const now = new Date();

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
        {
          index: 1,
          address: 'Recent',
          outcome: 'Done' as const,
          timestamp: now.toISOString(),
        },
      ];

      // First, check what would be deleted
      const cleanupResult = await performDataCleanup(state, 3);
      expect(cleanupResult?.deletedCompletions).toBe(1);

      // Then apply the cleanup
      const newState = applyDataCleanup(state, 3);
      expect(newState.completions).toHaveLength(1);
      expect(newState.completions[0].address).toBe('Recent');
    });

    it('should respect different retention periods', async () => {
      const state = createMockState();
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(new Date().getMonth() - 4);

      state.completions = [
        {
          index: 0,
          address: 'Old',
          outcome: 'PIF' as const,
          timestamp: fourMonthsAgo.toISOString(),
        },
      ];

      // Should delete with 3-month retention
      const result3 = applyDataCleanup(state, 3);
      expect(result3.completions).toHaveLength(0);

      // Should keep with 6-month retention
      const result6 = applyDataCleanup(state, 6);
      expect(result6.completions).toHaveLength(1);

      // Should keep with 12-month retention
      const result12 = applyDataCleanup(state, 12);
      expect(result12.completions).toHaveLength(1);

      // Should keep with forever retention
      const result0 = applyDataCleanup(state, 0);
      expect(result0.completions).toHaveLength(1);
    });
  });
});
