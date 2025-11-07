// src/syncTypes.ts
import type {
  AddressRow,
  Completion,
  Arrangement,
  DaySession,
} from './types';

export type OpAction = "create" | "update" | "delete";
export type OpEntity = "arrangement" | "session" | "completion" | "address";

// PHASE 2 Task 3: Discriminated union types for operation payloads
// Ensures type safety for all operation types

export type SyncOpPayload =
  // Completion operations
  | {
      entity: 'completion';
      action: 'create' | 'update' | 'delete';
      payload: Completion;
    }
  // Address operations
  | {
      entity: 'address';
      action: 'create' | 'update' | 'delete';
      payload: AddressRow;
    }
  // Arrangement operations
  | {
      entity: 'arrangement';
      action: 'create' | 'update' | 'delete';
      payload: Arrangement;
    }
  // Day session operations
  | {
      entity: 'session';
      action: 'create' | 'update' | 'delete';
      payload: DaySession;
    };

export interface SyncOp {
  /** Global idempotency key: `${deviceId}:${opSeq}` */
  id: string;
  deviceId: string;
  opSeq: number;
  entity: OpEntity;
  action: OpAction;
  /** App-level payload (the row or minimal change) - typed as discriminated union */
  payload: unknown; // Using unknown for now to maintain backward compatibility, typed via SyncOpPayload
  createdAt: string;      // ISO
  /** (Optional) Link to your optimistic update id */
  optimisticId?: string;
}

// Conflict type with proper typing
export type ApplyOpsConflict = {
  entity: OpEntity;
  id: string;
  server: unknown; // Server version of the conflicting entity
  client: unknown; // Client version of the conflicting entity
};

export type ApplyOpsResult =
  | { ok: true }
  | { ok: false; retryAfterMs?: number; conflicts?: ApplyOpsConflict[] };
