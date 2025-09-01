// src/types.ts

// ---- Core outcome union ------------------------------------------------------
/** Uppercase outcomes used by current UI; include "Done" for legacy comparisons */
export type Outcome = "PIF" | "DA" | "DONE" | "ARR" | "Done";

// ---- Address row -------------------------------------------------------------
export interface AddressRow {
  id?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
}

// ---- Completion (versioned) --------------------------------------------------
export interface Completion {
  /** Original index within the list version this completion belongs to */
  index: number;

  /** Outcome recorded */
  outcome: Outcome;

  /** Optional £ amount (PIF) */
  amount?: string;

  /** Timestamps (legacy + new) */
  timestamp?: string;       // legacy key used in some components
  completedAt?: string;     // newer key
  updatedAt?: string;

  /** Versioning & stability */
  listVersion?: number;     // legacy-safe optional; all new writes should set it
  addressSnapshot?: string; // stable human-readable label captured at completion time
  addressId?: string;       // optional if rows have stable IDs

  /** Legacy convenience fields some views read */
  address?: string;

  /** Optional coords captured at completion time (your useAppState writes nulls) */
  lat?: number | null;
  lng?: number | null;

  /** Legacy aggregate counters some panels referenced */
  PIF?: number;
  DA?: number;
  ARR?: number;
  Done?: number;
}

// ---- Day / session tracking --------------------------------------------------
export interface AppDay {
  startTime?: string;
  endTime?: string;
}

/** What your useAppState.ts manipulates in startDay/endDay */
export interface DaySession {
  date: string;                 // YYYY-MM-DD
  start: string;                // ISO
  end?: string;                 // ISO
  durationSeconds?: number;     // computed on end
}

// ---- Arrangements (shape used by Arrangements.tsx/useAppState.ts) -----------
export type ArrangementStatus =
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED"
  | "COMPLETED";

export type ArrangementFrequency = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";

/**
 * Minimal but complete fields to satisfy existing reads/updates:
 * - id/createdAt/updatedAt (you create & update these in useAppState)
 * - addressIndex (ties back to an address row)
 * - amount/frequency/firstPaymentOn/status/notes
 */
export interface Arrangement {
  id: string;
  addressIndex: number;
  amount: number;
  frequency: ArrangementFrequency;
  firstPaymentOn: string;        // ISO date
  status: ArrangementStatus;
  notes?: string;

  createdAt: string;             // ISO
  updatedAt: string;             // ISO
}

// ---- Migrations flags --------------------------------------------------------
export interface Migrations {
  backfill_completion_snapshots_v1?: boolean;
}

// ---- Global app state --------------------------------------------------------
export interface AppState {
  currentListVersion: number;

  /** Keep these non-optional to avoid "possibly undefined" in consumers */
  addresses: AddressRow[];
  completions: Completion[];

  /** Day & UI */
  day?: AppDay;
  activeIndex?: number | null;

  /** Optional metadata */
  lastBackupAt?: string;

  /** Migrations */
  migrations?: Migrations;

  /** Slices referenced by your useAppState & panels */
  daySessions: DaySession[];
  arrangements: Arrangement[];
}
