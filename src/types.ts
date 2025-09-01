// src/types.ts

// === Core enums / unions ===
export type Outcome = "PIF" | "DA" | "DONE" | "ARR" | "Done"; // include "Done" for legacy checks

// === Address row ===
export interface AddressRow {
  id?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
}

// === Completion (versioned) ===
export interface Completion {
  index: number;               // original index in that list version
  outcome: Outcome;
  amount?: string;
  completedAt?: string;
  updatedAt?: string;
  timestamp?: string;          // legacy compat

  // Versioning & stability
  listVersion?: number;        // optional for legacy; new writes should set it
  addressSnapshot?: string;    // stable label captured at completion time
  addressId?: string;          // optional if your rows have stable IDs

  // Legacy-compat fields used in older components
  address?: string;

  // Some legacy code referenced these keys on completions:
  PIF?: number;
  DA?: number;
  ARR?: number;
  Done?: number;
}

// === Day/session ===
export interface AppDay {
  startTime?: string;
  endTime?: string;
}
export interface DaySession {
  dayKey?: string;
  startTime?: string;
  endTime?: string;
}

// === Arrangements (minimal shape to satisfy existing imports) ===
export type ArrangementStatus = "ACTIVE" | "PAUSED" | "CANCELLED" | "COMPLETED";
export interface Arrangement {
  id: string;
  addressIndex: number;
  amount: number;
  frequency: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
  firstPaymentOn: string;
  status: ArrangementStatus;
  notes?: string;
}

// === Migrations flags ===
export interface Migrations {
  backfill_completion_snapshots_v1?: boolean;
}

// === Global app state ===
export interface AppState {
  currentListVersion: number;

  addresses: AddressRow[];       // non-optional to avoid "possibly undefined" errors
  completions: Completion[];     // non-optional

  day?: AppDay;
  activeIndex?: number | null;

  lastBackupAt?: string;

  migrations?: Migrations;

  // legacy/optional slices referenced by other files
  daySessions?: DaySession[];
  arrangements?: Arrangement[];
}
