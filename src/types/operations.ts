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
  index: number;
  outcome: Completion['outcome'];
  amount?: string;
  timeSpentSeconds?: number;
  arrangementId?: string;
  caseReference?: string;
  numberOfCases?: number;
  enforcementFees?: number[];
  address?: string;
  lat?: number | null;
  lng?: number | null;
};

export type CompletionUpdatePayload = {
  index: number;
  updates: Partial<Completion>;
};

/**
 * Address operation payloads
 */
export type AddressImportPayload = {
  addresses: AddressRow[];
  preserveCompletions?: boolean;
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

export type ArrangementUpdatePayload = {
  id: string;
  updates: Partial<Arrangement>;
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
  updates: Partial<DaySession>;
};

/**
 * Discriminated union of all operation types
 */
export type SubmitOperation =
  // Completion operations
  | { type: 'COMPLETION_CREATE'; payload: CompletionCreatePayload }
  | { type: 'COMPLETION_UPDATE'; payload: CompletionUpdatePayload }
  // Address operations
  | { type: 'ADDRESS_IMPORT'; payload: AddressImportPayload }
  | { type: 'ADDRESS_ADD'; payload: AddressAddPayload }
  // Arrangement operations
  | { type: 'ARRANGEMENT_ADD'; payload: ArrangementAddPayload }
  | { type: 'ARRANGEMENT_UPDATE'; payload: ArrangementUpdatePayload }
  | { type: 'ARRANGEMENT_DELETE'; payload: ArrangementDeletePayload }
  // Settings operations
  | { type: 'SETTINGS_UPDATE_SUBSCRIPTION'; payload: SettingsUpdateSubscriptionPayload }
  | { type: 'SETTINGS_UPDATE_REMINDER'; payload: SettingsUpdateReminderPayload }
  | { type: 'SETTINGS_UPDATE_BONUS'; payload: SettingsUpdateBonusPayload }
  // Session operations
  | { type: 'SESSION_CREATE'; payload: SessionCreatePayload }
  | { type: 'SESSION_UPDATE'; payload: SessionUpdatePayload };

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
