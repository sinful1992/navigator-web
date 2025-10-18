// src/hooks/useUndo.ts
import { useState, useCallback } from 'react';
import type { AddressRow, Completion, Arrangement, DaySession } from '../types';

import { logger } from '../utils/logger';

interface UndoAction {
  id: string;
  type: 'completion' | 'address' | 'arrangement' | 'day_session';
  data: AddressRow | Completion | Arrangement | DaySession;
  timestamp: number;
}

interface UndoHookReturn {
  pushUndo: (type: UndoAction['type'], data: any) => string;
  undo: (actionId: string) => UndoAction | null;
  undoStack: UndoAction[];
  clearUndoStack: () => void;
}

const MAX_UNDO_SIZE = 10;

export const useUndo = (): UndoHookReturn => {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const pushUndo = useCallback((type: UndoAction['type'], data: any): string => {
    const actionId = `undo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const action: UndoAction = {
      id: actionId,
      type,
      data,
      timestamp: Date.now()
    };

    setUndoStack(prev => {
      const newStack = [action, ...prev].slice(0, MAX_UNDO_SIZE);
      // Optionally persist to localStorage
      try {
        localStorage.setItem('undo_stack', JSON.stringify(newStack));
      } catch (e) {
        logger.warn('Failed to persist undo stack:', e);
      }
      return newStack;
    });

    return actionId;
  }, []);

  const undo = useCallback((actionId: string): UndoAction | null => {
    let actionToUndo: UndoAction | null = null;

    setUndoStack(prev => {
      const action = prev.find(a => a.id === actionId);
      if (!action) return prev;

      actionToUndo = action;
      const newStack = prev.filter(a => a.id !== actionId);

      // Update localStorage
      try {
        localStorage.setItem('undo_stack', JSON.stringify(newStack));
      } catch (e) {
        logger.warn('Failed to update undo stack:', e);
      }

      return newStack;
    });

    return actionToUndo;
  }, []);

  const clearUndoStack = useCallback(() => {
    setUndoStack([]);
    try {
      localStorage.removeItem('undo_stack');
    } catch (e) {
      logger.warn('Failed to clear undo stack:', e);
    }
  }, []);

  return {
    pushUndo,
    undo,
    undoStack,
    clearUndoStack
  };
};
