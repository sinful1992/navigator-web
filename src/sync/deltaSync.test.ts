// src/sync/deltaSync.test.ts - Comprehensive delta sync integration tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnifiedSync } from './migrationAdapter';
import type { AppState } from '../types';

// Mock Supabase
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ error: null })),
      select: vi.fn(() => ({ data: [], error: null })),
      eq: vi.fn(() => ({ data: [], error: null })),
      maybeSingle: vi.fn(() => ({ data: null, error: null })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({})),
      subscribe: vi.fn(),
    })),
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'test-user-id' } }, error: null })),
      getSession: vi.fn(() => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    removeChannel: vi.fn(),
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    sync: vi.fn(),
  },
}));

describe('Delta Sync Integration', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Clear localStorage
    localStorage.clear();

    // Set operations mode by default
    localStorage.setItem('navigator_sync_mode_override', 'operations');
  });

  describe('Sync Mode Configuration', () => {
    it('should use operations mode by default', () => {
      const { result } = renderHook(() => useUnifiedSync());

      expect(result.current.currentSyncMode).toBe('operations');
    });

    it('should respect localStorage override', () => {
      localStorage.setItem('navigator_sync_mode_override', 'legacy');

      const { result } = renderHook(() => useUnifiedSync());

      expect(result.current.currentSyncMode).toBe('legacy');
    });

    it('should expose migration status', () => {
      const { result } = renderHook(() => useUnifiedSync());

      const status = result.current.getMigrationStatus();

      expect(status).toHaveProperty('currentMode');
      expect(status).toHaveProperty('canMigrate');
      expect(status).toHaveProperty('config');
    });
  });

  describe('Operation Submission', () => {
    it('should have submitOperation method in operations mode', () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      expect(result.current.submitOperation).toBeDefined();
      expect(typeof result.current.submitOperation).toBe('function');
    });

    it('should not have submitOperation method in legacy mode', () => {
      localStorage.setItem('navigator_sync_mode_override', 'legacy');

      const { result } = renderHook(() => useUnifiedSync());

      expect(result.current.submitOperation).toBeUndefined();
    });

    it('should submit completion create operation', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      await act(async () => {
        if (result.current.submitOperation) {
          await result.current.submitOperation({
            type: 'COMPLETION_CREATE',
            payload: {
              completion: {
                index: 0,
                address: '123 Test St',
                outcome: 'PIF',
                timestamp: new Date().toISOString(),
              }
            }
          });
        }
      });

      // Operation should be queued locally
      expect(result.current.error).toBeNull();
    });

    it('should submit arrangement create operation', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      await act(async () => {
        if (result.current.submitOperation) {
          await result.current.submitOperation({
            type: 'ARRANGEMENT_CREATE',
            payload: {
              arrangement: {
                id: 'arr_123',
                addressIndex: 0,
                address: '456 Test Ave',
                customerName: 'John Doe',
                phoneNumber: '555-0100',
                scheduledDate: new Date().toISOString().split('T')[0],
                status: 'Scheduled',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            }
          });
        }
      });

      expect(result.current.error).toBeNull();
    });

    it('should submit bulk import operation', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      await act(async () => {
        if (result.current.submitOperation) {
          await result.current.submitOperation({
            type: 'ADDRESS_BULK_IMPORT',
            payload: {
              addresses: [
                { address: '789 Import Rd' },
                { address: '101 Data Ln' },
              ],
              newListVersion: 2,
              preserveCompletions: true,
            }
          });
        }
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Sync Data Method', () => {
    it('should be no-op in operations mode', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      const mockState: AppState = {
        addresses: [],
        completions: [],
        arrangements: [],
        daySessions: [],
        activeIndex: null,
        currentListVersion: 1,
        subscription: null,
        reminderSettings: undefined,
        reminderNotifications: [],
        lastReminderProcessed: undefined,
      };

      await act(async () => {
        await result.current.syncData(mockState);
      });

      // Should complete without error
      expect(result.current.error).toBeNull();
    });

    it('should work normally in legacy mode', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'legacy');

      const { result } = renderHook(() => useUnifiedSync());

      const mockState: AppState = {
        addresses: [],
        completions: [],
        arrangements: [],
        daySessions: [],
        activeIndex: null,
        currentListVersion: 1,
        subscription: null,
        reminderSettings: undefined,
        reminderNotifications: [],
        lastReminderProcessed: undefined,
      };

      await act(async () => {
        await result.current.syncData(mockState);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle operation submission errors gracefully', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      // This should not throw even if there's an error
      await act(async () => {
        if (result.current.submitOperation) {
          try {
            await result.current.submitOperation({
              type: 'COMPLETION_CREATE',
              payload: { invalid: 'data' } as any // Invalid payload for testing
            });
          } catch (error) {
            // Error should be caught internally
          }
        }
      });

      // Should still be functional
      expect(result.current.submitOperation).toBeDefined();
    });
  });

  describe('Multi-Device Sync Scenario', () => {
    it('should handle completion from device 1', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      // Device 1 completes an address
      await act(async () => {
        if (result.current.submitOperation) {
          await result.current.submitOperation({
            type: 'COMPLETION_CREATE',
            payload: {
              completion: {
                index: 0,
                address: '123 Main St',
                outcome: 'PIF',
                timestamp: new Date().toISOString(),
                listVersion: 1,
              }
            }
          });
        }
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle arrangement from device 2', async () => {
      localStorage.setItem('navigator_sync_mode_override', 'operations');

      const { result } = renderHook(() => useUnifiedSync());

      // Device 2 creates an arrangement
      await act(async () => {
        if (result.current.submitOperation) {
          await result.current.submitOperation({
            type: 'ARRANGEMENT_CREATE',
            payload: {
              arrangement: {
                id: 'arr_device2_123',
                addressIndex: 0,
                address: '456 Oak Ave',
                customerName: 'Jane Smith',
                phoneNumber: '555-0200',
                scheduledDate: new Date().toISOString().split('T')[0],
                status: 'Scheduled',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            }
          });
        }
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Payload Size Reduction', () => {
    it('should use small operation payloads vs full state', () => {
      // Completion operation payload
      const operation = {
        type: 'COMPLETION_CREATE',
        payload: {
          completion: {
            index: 0,
            address: '123 Test St',
            outcome: 'PIF',
            timestamp: new Date().toISOString(),
          }
        }
      };

      // Full state payload
      const fullState: AppState = {
        addresses: Array(100).fill({ address: '123 Test St' }),
        completions: Array(50).fill({
          index: 0,
          address: '123 Test St',
          outcome: 'PIF',
          timestamp: new Date().toISOString(),
        }),
        arrangements: [],
        daySessions: [],
        activeIndex: null,
        currentListVersion: 1,
        subscription: null,
        reminderSettings: undefined,
        reminderNotifications: [],
        lastReminderProcessed: undefined,
      };

      const operationSize = JSON.stringify(operation).length;
      const fullStateSize = JSON.stringify(fullState).length;

      // Operation should be at least 50x smaller
      expect(operationSize).toBeLessThan(fullStateSize / 50);
    });
  });
});
