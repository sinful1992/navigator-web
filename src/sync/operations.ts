// src/sync/operations.ts - Event-based sync operations
import type { Completion, AddressRow, DaySession, Arrangement, UserSubscription, ReminderSettings, BonusSettings } from '../types';

// Vector clock type for conflict detection
export type VectorClock = Record<string, number>;

// Base operation structure
export type BaseOperation = {
  id: string;
  timestamp: string;
  clientId: string; // Which device created this
  sequence: number; // For ordering
  vectorClock?: VectorClock; // Optional vector clock for conflict detection
};

// All possible operations in the system
export type Operation =
  | CompletionOperation
  | AddressOperation
  | SessionOperation
  | ArrangementOperation
  | ActiveIndexOperation
  | SettingsOperation;

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
    startTime?: string | null; // Time when address was activated (for time tracking)
  };
};

// Settings operations
export type SettingsOperation = BaseOperation & (
  | {
      type: 'SETTINGS_UPDATE_SUBSCRIPTION';
      payload: {
        subscription: UserSubscription | null;
      };
    }
  | {
      type: 'SETTINGS_UPDATE_REMINDER';
      payload: {
        settings: ReminderSettings;
      };
    }
  | {
      type: 'SETTINGS_UPDATE_BONUS';
      payload: {
        settings: BonusSettings;
      };
    }
);

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

// PHASE 1.3: Thread-safe sequence generator with atomic operations
// Prevents race conditions where two operations could get the same sequence number
class SequenceGenerator {
  private sequence = 0;
  private lock = Promise.resolve();
  private readonly MAX_REASONABLE_SEQUENCE = 1000000; // Max reasonable value (10 years of heavy use)

  async next(): Promise<number> {
    // Queue this request and wait for previous ones to complete
    const myTurn = this.lock;
    let release: () => void = () => {};
    this.lock = new Promise<void>(resolve => { release = resolve; });

    await myTurn; // Wait for previous sequence requests

    try {
      const seq = ++this.sequence;
      return seq;
    } finally {
      release(); // Let next request proceed
    }
  }

  // PHASE 1.3: CRITICAL FIX - Make set() also respect the lock
  // Prevents race condition where set() and next() could execute concurrently
  async setAsync(seq: number): Promise<void> {
    const myTurn = this.lock;
    let release: () => void = () => {};
    this.lock = new Promise<void>(resolve => { release = resolve; });

    await myTurn; // Wait for previous operations

    try {
      // 🚨 CRITICAL: Cap unreasonable sequences (likely Unix timestamps)
      const cappedSeq = Math.min(seq, this.MAX_REASONABLE_SEQUENCE);
      if (cappedSeq < seq) {
        console.error('🚨 CRITICAL: Sequence capped to prevent timestamp poisoning', {
          original: seq,
          capped: cappedSeq,
          reason: 'Sequence number exceeded maximum (likely Unix timestamp)',
          stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
        });
      }
      this.sequence = Math.max(this.sequence, cappedSeq);
    } finally {
      release(); // Let next request proceed
    }
  }

  // Synchronous version for backward compatibility (e.g., in error recovery paths)
  set(seq: number): void {
    // 🚨 CRITICAL: Cap unreasonable sequences instead of silently accepting them
    const cappedSeq = Math.min(seq, this.MAX_REASONABLE_SEQUENCE);
    if (cappedSeq < seq) {
      console.error('🚨 CRITICAL: Sequence capped to prevent timestamp poisoning', {
        original: seq,
        capped: cappedSeq,
        reason: 'Sequence number exceeded maximum (likely Unix timestamp)',
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });
    }
    this.sequence = Math.max(this.sequence, cappedSeq);
  }

  get current(): number {
    return this.sequence;
  }
}

const sequenceGenerator = new SequenceGenerator();

// Utility to generate next sequence number (thread-safe)
export function nextSequence(): Promise<number> {
  return sequenceGenerator.next();
}

export function setSequence(seq: number): void {
  // Delegates to SequenceGenerator which caps unreasonable values
  // No need for separate validation here - generator handles it
  sequenceGenerator.set(seq);
}

// PHASE 1.3: Atomic version of setSequence (respects the lock)
// Use this when you need to guarantee atomicity with next()
export async function setSequenceAsync(seq: number): Promise<void> {
  // Delegates to SequenceGenerator which caps unreasonable values
  // No need for separate validation here - generator handles it
  return sequenceGenerator.setAsync(seq);
}