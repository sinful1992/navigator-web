// src/hooks/useUndo.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndo } from './useUndo';
import type { Completion, AddressRow, Arrangement, DaySession } from '../types';

// Helper function to create test Completion objects
const createTestCompletion = (index: number, address?: string): Completion => ({
  index,
  address: address || `Test Address ${index}`,
  outcome: 'PIF',
  timestamp: new Date(`2025-01-01T00:${String(index).padStart(2, '0')}:00Z`).toISOString(),
});

describe('useUndo', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear any mock timers
    vi.clearAllMocks();
  });

  describe('pushUndo', () => {
    it('should add an action to the undo stack', () => {
      const { result } = renderHook(() => useUndo());

      const completion: Completion = {
        index: 0,
        address: '123 Test St',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      act(() => {
        result.current.pushUndo('completion', completion);
      });

      expect(result.current.undoStack).toHaveLength(1);
      expect(result.current.undoStack[0].type).toBe('completion');
      expect(result.current.undoStack[0].data).toEqual(completion);
    });

    it('should generate unique action IDs', () => {
      const { result } = renderHook(() => useUndo());

      let id1!: string;
      let id2!: string;

      act(() => {
        id1 = result.current.pushUndo('completion', createTestCompletion(1));
        id2 = result.current.pushUndo('completion', createTestCompletion(2));
      });

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(result.current.undoStack).toHaveLength(2);
    });

    it('should add timestamps to actions', () => {
      const { result } = renderHook(() => useUndo());

      const beforeTime = Date.now();

      act(() => {
        result.current.pushUndo('completion', createTestCompletion(1));
      });

      const afterTime = Date.now();

      expect(result.current.undoStack[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(result.current.undoStack[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should limit stack to MAX_UNDO_SIZE (10 items)', () => {
      const { result } = renderHook(() => useUndo());

      act(() => {
        // Add 15 items
        for (let i = 0; i < 15; i++) {
          result.current.pushUndo('completion', createTestCompletion(i));
        }
      });

      // Should only keep the latest 10
      expect(result.current.undoStack).toHaveLength(10);
      // Most recent should be first (index 14)
      expect((result.current.undoStack[0].data as Completion).index).toBe(14);
      // Oldest kept should be index 5 (14 down to 5 = 10 items)
      expect((result.current.undoStack[9].data as Completion).index).toBe(5);
    });

    it('should persist to localStorage', () => {
      const { result } = renderHook(() => useUndo());

      const completion: Completion = {
        index: 0,
        address: '123 Test St',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      act(() => {
        result.current.pushUndo('completion', completion);
      });

      const stored = localStorage.getItem('undo_stack');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('completion');
      expect(parsed[0].data.address).toBe('123 Test St');
    });

    it('should handle localStorage failures gracefully', () => {
      const { result } = renderHook(() => useUndo());

      // Mock localStorage.setItem to throw an error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      // Should not throw, just warn
      act(() => {
        result.current.pushUndo('completion', createTestCompletion(1));
      });

      // Stack should still be updated in memory
      expect(result.current.undoStack).toHaveLength(1);

      // Restore original
      localStorage.setItem = originalSetItem;
    });

    it('should support different action types', () => {
      const { result } = renderHook(() => useUndo());

      const address: AddressRow = { address: '123 Test St' };
      const completion: Completion = {
        index: 0,
        address: '123 Test St',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };
      const arrangement: Arrangement = {
        id: 'arr1',
        addressIndex: 0,
        address: '123 Test St',
        status: 'Scheduled',
        scheduledDate: '2025-01-15',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      const daySession: DaySession = {
        date: '2025-01-01',
        start: '2025-01-01T09:00:00Z',
        end: '2025-01-01T17:00:00Z',
        durationSeconds: 28800,
      };

      act(() => {
        result.current.pushUndo('address', address);
        result.current.pushUndo('completion', completion);
        result.current.pushUndo('arrangement', arrangement);
        result.current.pushUndo('day_session', daySession);
      });

      expect(result.current.undoStack).toHaveLength(4);
      expect(result.current.undoStack[0].type).toBe('day_session');
      expect(result.current.undoStack[1].type).toBe('arrangement');
      expect(result.current.undoStack[2].type).toBe('completion');
      expect(result.current.undoStack[3].type).toBe('address');
    });

    it('should add newest items to front of stack', () => {
      const { result } = renderHook(() => useUndo());

      const completion1: Completion = {
        index: 1,
        address: 'Test Address 1',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      const completion2: Completion = {
        index: 2,
        address: 'Test Address 2',
        outcome: 'DA',
        timestamp: '2025-01-01T00:01:00Z',
      };

      const completion3: Completion = {
        index: 3,
        address: 'Test Address 3',
        outcome: 'Done',
        timestamp: '2025-01-01T00:02:00Z',
      };

      act(() => {
        result.current.pushUndo('completion', completion1);
        result.current.pushUndo('completion', completion2);
        result.current.pushUndo('completion', completion3);
      });

      expect((result.current.undoStack[0].data as Completion).index).toBe(3);
      expect((result.current.undoStack[1].data as Completion).index).toBe(2);
      expect((result.current.undoStack[2].data as Completion).index).toBe(1);
    });
  });

  describe('undo', () => {
    it('should remove an action from the stack by ID', () => {
      const { result } = renderHook(() => useUndo());

      let actionId!: string;

      act(() => {
        actionId = result.current.pushUndo('completion', createTestCompletion(1));
      });

      expect(result.current.undoStack).toHaveLength(1);

      act(() => {
        result.current.undo(actionId);
      });

      expect(result.current.undoStack).toHaveLength(0);
    });

    it('should return the undone action', () => {
      const { result } = renderHook(() => useUndo());

      const completion: Completion = {
        index: 5,
        address: '123 Test St',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      let actionId!: string;

      act(() => {
        actionId = result.current.pushUndo('completion', completion);
      });

      // Access the action from stack before undoing
      const actionBeforeUndo = result.current.undoStack.find(a => a.id === actionId);

      act(() => {
        result.current.undo(actionId);
      });

      expect(actionBeforeUndo).toBeTruthy();
      expect(actionBeforeUndo!.type).toBe('completion');
      expect(actionBeforeUndo!.data).toEqual(completion);
      expect(actionBeforeUndo!.id).toBe(actionId);

      // Verify it was removed from stack
      expect(result.current.undoStack.find(a => a.id === actionId)).toBeUndefined();
    });

    it('should return null if action ID not found', () => {
      const { result } = renderHook(() => useUndo());

      let undoneAction: any;

      act(() => {
        undoneAction = result.current.undo('non-existent-id');
      });

      expect(undoneAction).toBeNull();
      expect(result.current.undoStack).toHaveLength(0);
    });

    it('should update localStorage after undo', () => {
      const { result } = renderHook(() => useUndo());

      const completion1: Completion = {
        index: 1,
        address: 'Test Address 1',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      const completion2: Completion = {
        index: 2,
        address: 'Test Address 2',
        outcome: 'DA',
        timestamp: '2025-01-01T00:01:00Z',
      };

      let actionId1!: string, actionId2!: string;

      act(() => {
        actionId1 = result.current.pushUndo('completion', completion1);
        actionId2 = result.current.pushUndo('completion', completion2);
      });

      act(() => {
        result.current.undo(actionId2);
      });

      const stored = localStorage.getItem('undo_stack');
      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(actionId1);
    });

    it('should handle localStorage failures during undo gracefully', () => {
      const { result } = renderHook(() => useUndo());

      let actionId!: string;

      act(() => {
        actionId = result.current.pushUndo('completion', createTestCompletion(1));
      });

      // Mock localStorage.setItem to throw an error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      act(() => {
        result.current.undo(actionId);
      });

      // Stack should still be updated in memory
      expect(result.current.undoStack).toHaveLength(0);

      // Restore original
      localStorage.setItem = originalSetItem;
    });

    it('should only remove the specified action from multi-item stack', () => {
      const { result } = renderHook(() => useUndo());

      let id1!: string, id2!: string, id3!: string;

      act(() => {
        id1 = result.current.pushUndo('completion', createTestCompletion(1));
        id2 = result.current.pushUndo('completion', createTestCompletion(2));
        id3 = result.current.pushUndo('completion', createTestCompletion(3));
      });

      act(() => {
        result.current.undo(id2);
      });

      expect(result.current.undoStack).toHaveLength(2);
      expect(result.current.undoStack.find(a => a.id === id1)).toBeDefined();
      expect(result.current.undoStack.find(a => a.id === id2)).toBeUndefined();
      expect(result.current.undoStack.find(a => a.id === id3)).toBeDefined();
    });

    it('should maintain stack order after removing middle item', () => {
      const { result } = renderHook(() => useUndo());

      const completion1: Completion = {
        index: 1,
        address: 'Test Address 1',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      const completion2: Completion = {
        index: 2,
        address: 'Test Address 2',
        outcome: 'DA',
        timestamp: '2025-01-01T00:01:00Z',
      };

      const completion3: Completion = {
        index: 3,
        address: 'Test Address 3',
        outcome: 'Done',
        timestamp: '2025-01-01T00:02:00Z',
      };

      let id2!: string;

      act(() => {
        result.current.pushUndo('completion', completion1);
        id2 = result.current.pushUndo('completion', completion2);
        result.current.pushUndo('completion', completion3);
      });

      act(() => {
        result.current.undo(id2);
      });

      // Order should still be newest first
      expect((result.current.undoStack[0].data as Completion).index).toBe(3);
      expect((result.current.undoStack[1].data as Completion).index).toBe(1);
    });
  });

  describe('clearUndoStack', () => {
    it('should clear the entire undo stack', () => {
      const { result } = renderHook(() => useUndo());

      act(() => {
        result.current.pushUndo('completion', createTestCompletion(1));
        result.current.pushUndo('completion', createTestCompletion(2));
        result.current.pushUndo('completion', createTestCompletion(3));
      });

      expect(result.current.undoStack).toHaveLength(3);

      act(() => {
        result.current.clearUndoStack();
      });

      expect(result.current.undoStack).toHaveLength(0);
    });

    it('should remove undo_stack from localStorage', () => {
      const { result } = renderHook(() => useUndo());

      act(() => {
        result.current.pushUndo('completion', createTestCompletion(1));
      });

      expect(localStorage.getItem('undo_stack')).toBeTruthy();

      act(() => {
        result.current.clearUndoStack();
      });

      expect(localStorage.getItem('undo_stack')).toBeNull();
    });

    it('should handle localStorage failures during clear gracefully', () => {
      const { result } = renderHook(() => useUndo());

      act(() => {
        result.current.pushUndo('completion', createTestCompletion(1));
      });

      // Mock localStorage.removeItem to throw an error
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      act(() => {
        result.current.clearUndoStack();
      });

      // Stack should still be cleared in memory
      expect(result.current.undoStack).toHaveLength(0);

      // Restore original
      localStorage.removeItem = originalRemoveItem;
    });

    it('should work correctly when called on empty stack', () => {
      const { result } = renderHook(() => useUndo());

      expect(result.current.undoStack).toHaveLength(0);

      act(() => {
        result.current.clearUndoStack();
      });

      expect(result.current.undoStack).toHaveLength(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple push and undo operations', () => {
      const { result } = renderHook(() => useUndo());

      const completion1: Completion = {
        index: 1,
        address: 'Test Address 1',
        outcome: 'PIF',
        timestamp: '2025-01-01T00:00:00Z',
      };

      const completion2: Completion = {
        index: 2,
        address: 'Test Address 2',
        outcome: 'DA',
        timestamp: '2025-01-01T00:01:00Z',
      };

      const completion3: Completion = {
        index: 3,
        address: 'Test Address 3',
        outcome: 'Done',
        timestamp: '2025-01-01T00:02:00Z',
      };

      const completion4: Completion = {
        index: 4,
        address: 'Test Address 4',
        outcome: 'ARR',
        timestamp: '2025-01-01T00:03:00Z',
      };

      let id3!: string;

      act(() => {
        result.current.pushUndo('completion', completion1);
        result.current.pushUndo('completion', completion2);
        id3 = result.current.pushUndo('completion', completion3);
      });

      expect(result.current.undoStack).toHaveLength(3);

      // Verify action exists before undoing
      const actionToUndo = result.current.undoStack.find(a => a.id === id3);
      expect((actionToUndo?.data as Completion)?.index).toBe(3);

      act(() => {
        result.current.undo(id3);
      });

      expect(result.current.undoStack).toHaveLength(2);

      act(() => {
        result.current.pushUndo('completion', completion4);
      });

      expect(result.current.undoStack).toHaveLength(3);
      expect((result.current.undoStack[0].data as Completion).index).toBe(4);
    });

    it('should persist state across multiple operations', () => {
      const { result } = renderHook(() => useUndo());

      act(() => {
        result.current.pushUndo('completion', createTestCompletion(1));
      });

      let stored1 = JSON.parse(localStorage.getItem('undo_stack')!);
      expect(stored1).toHaveLength(1);

      act(() => {
        result.current.pushUndo('completion', createTestCompletion(2));
      });

      let stored2 = JSON.parse(localStorage.getItem('undo_stack')!);
      expect(stored2).toHaveLength(2);

      act(() => {
        result.current.undo(stored2[0].id);
      });

      let stored3 = JSON.parse(localStorage.getItem('undo_stack')!);
      expect(stored3).toHaveLength(1);

      act(() => {
        result.current.clearUndoStack();
      });

      expect(localStorage.getItem('undo_stack')).toBeNull();
    });

    it('should handle complex data structures', () => {
      const { result } = renderHook(() => useUndo());

      const complexCompletion: Completion = {
        index: 42,
        address: '123 Complex St, Suite 100',
        outcome: 'PIF',
        timestamp: '2025-01-01T12:34:56.789Z',
        listVersion: 5,
        caseReference: 'CASE-12345',
        timeSpentSeconds: 1800,
        numberOfCases: 2,
        enforcementFees: [272.50, 310.00],
        amount: '150.50',
      };

      let actionId!: string;

      act(() => {
        actionId = result.current.pushUndo('completion', complexCompletion);
      });

      // Get action from stack before undoing
      const pushedAction = result.current.undoStack.find(a => a.id === actionId);

      act(() => {
        result.current.undo(actionId);
      });

      expect(pushedAction!.data).toEqual(complexCompletion);
      expect((pushedAction!.data as Completion).caseReference).toBe('CASE-12345');
      expect((pushedAction!.data as Completion).amount).toBe('150.50');

      // Verify it was removed
      expect(result.current.undoStack).toHaveLength(0);
    });
  });
});
