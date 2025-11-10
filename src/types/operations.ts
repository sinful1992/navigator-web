// src/types/operations.ts
// PHASE 2 Task 3: Discriminated union types for all operation types
// Ensures type safety for submit operations and callbacks

import type {
  Completion,
  AddressRow,
  Arrangement,
  DaySession,
  UserSubscription,
  ReminderSettings,
  BonusSettings,
} from '../types';

/**
 * Completion operation payloads
 */
export type CompletionCreatePayload = {
  completion: Completion;
};

export type CompletionUpdatePayload = {
  originalTimestamp: string;
  updates: Partial<Completion>;
  // TIMESTAMP-ORDERED SYNC: No version checking needed
};

export type CompletionDeletePayload = {
  timestamp: string;
  index: number;
  listVersion: number;
};

/**
 * Address operation payloads
 */
export type AddressImportPayload = {
  addresses: AddressRow[];
  preserveCompletions?: boolean;
};

export type AddressBulkImportPayload = {
  addresses: AddressRow[];
  newListVersion: number;
  preserveCompletions: boolean;
};

export type AddressAddPayload = {
  address: AddressRow;
};

/**
 * Arrangement operation payloads
 */
export type ArrangementAddPayload = {
  data: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>;
};

export type ArrangementCreatePayload = {
  arrangement: Arrangement;
};

export type ArrangementUpdatePayload = {
  id: string;
  updates: Partial<Arrangement>;
  // TIMESTAMP-ORDERED SYNC: No version checking needed
};

export type ArrangementDeletePayload = {
  id: string;
};

/**
 * Settings operation payloads
 */
export type SettingsUpdateSubscriptionPayload = {
  subscription: UserSubscription | null;
};

export type SettingsUpdateReminderPayload = {
  settings: ReminderSettings;
};

export type SettingsUpdateBonusPayload = {
  settings: BonusSettings;
};

/**
 * Day session payloads
 */
export type SessionCreatePayload = DaySession;
export type SessionUpdatePayload = {
  date: string;
  updates: Partial<DaySession>;
};
export type SessionStartPayload = {
  session: DaySession;
};
export type SessionEndPayload = {
  date: string;
  endTime: string;
};

/**
 * Active index tracking payloads
 */
export type ActiveIndexSetPayload = {
  index: number | null;
  startTime?: string | null;
};


/**
 * Conflict operation payloads
 */
export type ConflictDismissPayload = {
  conflictId: string;
};

export type ConflictResolvePayload = {
  conflictId: string;
  resolution: 'keep-local' | 'use-remote' | 'manual';
};
/**
 * Discriminated union of all operation types
 */
export type SubmitOperation =
  // Completion operations
  | { type: 'COMPLETION_CREATE'; payload: CompletionCreatePayload }
  | { type: 'COMPLETION_UPDATE'; payload: CompletionUpdatePayload }
  | { type: 'COMPLETION_DELETE'; payload: CompletionDeletePayload }
  // Address operations
  | { type: 'ADDRESS_BULK_IMPORT'; payload: AddressBulkImportPayload }
  | { type: 'ADDRESS_ADD'; payload: AddressAddPayload }
  // Arrangement operations
  | { type: 'ARRANGEMENT_CREATE'; payload: ArrangementCreatePayload }
  | { type: 'ARRANGEMENT_UPDATE'; payload: ArrangementUpdatePayload }
  | { type: 'ARRANGEMENT_DELETE'; payload: ArrangementDeletePayload }
  // Settings operations
  | { type: 'SETTINGS_UPDATE_SUBSCRIPTION'; payload: SettingsUpdateSubscriptionPayload }
  | { type: 'SETTINGS_UPDATE_REMINDER'; payload: SettingsUpdateReminderPayload }
  | { type: 'SETTINGS_UPDATE_BONUS'; payload: SettingsUpdateBonusPayload }
  // Session operations
  | { type: 'SESSION_CREATE'; payload: SessionCreatePayload }
  | { type: 'SESSION_UPDATE'; payload: SessionUpdatePayload }
  | { type: 'SESSION_START'; payload: SessionStartPayload }
  | { type: 'SESSION_END'; payload: SessionEndPayload }
  // Active index tracking
  | { type: 'ACTIVE_INDEX_SET'; payload: ActiveIndexSetPayload }
  // Conflict operations
  | { type: 'CONFLICT_DISMISS'; payload: ConflictDismissPayload }
  | { type: 'CONFLICT_RESOLVE'; payload: ConflictResolvePayload };

/**
 * Callback for submitting operations to cloud sync
 */
export type SubmitOperationCallback = (operation: SubmitOperation) => Promise<void>;

/**
 * Type guard for checking if value is a SubmitOperation
 */
export function isSubmitOperation(value: unknown): value is SubmitOperation {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    'payload' in value
  );
}
