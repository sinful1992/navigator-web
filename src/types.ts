// src/types.ts

// Outcomes recorded for a completion
export type Outcome = "PIF" | "DA" | "DONE" | "ARR";

// A single address row in the active list
export interface AddressRow {
  id?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
}

// A completion event tied to a specific list version + index
export interface Completion {
  index: number;               // original index in that list version
  outcome: Outcome;
  amount?: string;
  completedAt?: string;
  updatedAt?: string;

  // Versioning & stability
  listVersion?: number;        // optional for legacy; new writes should set it
  addressSnapshot?: string;    // stable label captured at completion time
  addressId?: string;          // optional if your rows have stable IDs
}

// Day/session timings
export interface AppDay {
  startTime?: string;
  endTime?: string;
}

// Migration flags for one-off data fixes
export interface Migrations {
  backfill_completion_snapshots_v1?: boolean;
}

// Global app state shape
export interface AppState {
  currentListVersion: number;

  addresses?: AddressRow[];
  completions?: Completion[];

  day?: AppDay;
  activeIndex?: number;

  // Last successful cloud backup timestamp
  lastBackupAt?: string;

  // One-off migration flags
  migrations?: Migrations;
}
