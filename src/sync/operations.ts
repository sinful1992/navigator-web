// src/sync/operations.ts - Event-based sync operations
import type { Completion, AddressRow, DaySession, Arrangement } from '../types';

// Base operation structure
export type BaseOperation = {
  id: string;
  timestamp: string;
  clientId: string; // Which device created this
  sequence: number; // For ordering
};

// All possible operations in the system
export type Operation =
  | CompletionOperation
  | AddressOperation
  | SessionOperation
  | ArrangementOperation
  | ActiveIndexOperation;

// Completion operations
export type CompletionOperation = BaseOperation & (
  | {
      type: 'COMPLETION_CREATE';
      payload: {
        completion: Completion;
      };
    }
  | {
      type: 'COMPLETION_UPDATE';
      payload: {
        originalTimestamp: string;
        updates: Partial<Completion>;
      };
    }
  | {
      type: 'COMPLETION_DELETE';
      payload: {
        timestamp: string;
        index: number;
        listVersion: number;
      };
    }
);

// Address operations
export type AddressOperation = BaseOperation & (
  | {
      type: 'ADDRESS_BULK_IMPORT';
      payload: {
        addresses: AddressRow[];
        newListVersion: number;
        preserveCompletions: boolean;
      };
    }
  | {
      type: 'ADDRESS_ADD';
      payload: {
        address: AddressRow;
      };
    }
);

// Session operations
export type SessionOperation = BaseOperation & (
  | {
      type: 'SESSION_START';
      payload: {
        session: DaySession;
      };
    }
  | {
      type: 'SESSION_END';
      payload: {
        date: string;
        endTime: string;
      };
    }
);

// Arrangement operations
export type ArrangementOperation = BaseOperation & (
  | {
      type: 'ARRANGEMENT_CREATE';
      payload: {
        arrangement: Arrangement;
      };
    }
  | {
      type: 'ARRANGEMENT_UPDATE';
      payload: {
        id: string;
        updates: Partial<Arrangement>;
      };
    }
  | {
      type: 'ARRANGEMENT_DELETE';
      payload: {
        id: string;
      };
    }
);

// Active index operations
export type ActiveIndexOperation = BaseOperation & {
  type: 'ACTIVE_INDEX_SET';
  payload: {
    index: number | null;
  };
};

// Operation factory functions
export function createOperation<T extends Operation>(
  type: T['type'],
  payload: T['payload'],
  clientId: string,
  sequence: number
): T {
  return {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    clientId,
    sequence,
    type,
    payload,
  } as T;
}

// Utility to generate next sequence number
let localSequence = 0;
export function nextSequence(): number {
  return ++localSequence;
}

export function setSequence(seq: number): void {
  localSequence = Math.max(localSequence, seq);
}