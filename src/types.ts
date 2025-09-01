// src/types.ts

// Outcomes — keep both variants for legacy compatibility
export type Outcome = "PIF" | "DA" | "ARR" | "DONE" | "Done";

// Address rows
export interface AddressRow {
  id?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
}

// Completions (versioned)
export interface Completion {
  index: number;
  outcome: Outcome;
  amount?: string;

  // timestamps (old + new)
  timestamp?: string;
  completedAt?: string;
  updatedAt?: string;

  // versioning & stability
  listVersion?: number;
  addressSnapshot?: string;
  addressId?: string;

  // legacy convenience fields
  address?: string;
  lat?: number | null;
  lng?: number | null;

  // legacy aggregate fields some panels referenced
  PIF?: number;
  DA?: number;
  ARR?: number;
  Done?: number;
}

// Day/session
export interface AppDay {
  startTime?: string;
  endTime?: string;
}

export interface DaySession {
  date: string;              // YYYY-MM-DD
  start: string;             // ISO
  end?: string;              // ISO
  durationSeconds?: number;
}

// Arrangements — include all fields that Arrangements.tsx reads
export type ArrangementStatus =
  | "Scheduled"
  | "Confirmed"
  | "Completed"
  | "Cancelled"
  | "Missed";

export type ArrangementFrequency = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";

export interface Arrangement {
  id: string;
  addressIndex: number;

  // fields Arrangements.tsx expects:
  address?: string;
  customerName?: string;
  phoneNumber?: string;
  scheduledDate?: string;    // ISO date (YYYY-MM-DD)
  scheduledTime?: string;    // HH:mm
  notes?: string;

  // amount is treated as string in some places and number in others
  amount: number | string;

  status: ArrangementStatus;

  // make optional so Omit<...> callers don’t fail
  frequency?: ArrangementFrequency;
  firstPaymentOn?: string;

  createdAt: string;
  updatedAt: string;
}

// Migrations
export interface Migrations {
  backfill_completion_snapshots_v1?: boolean;
}

// Global app state
export interface AppState {
  currentListVersion: number;

  addresses: AddressRow[];
  completions: Completion[];

  day?: AppDay;
  activeIndex?: number | null;

  lastBackupAt?: string;
  migrations?: Migrations;

  daySessions: DaySession[];
  arrangements: Arrangement[];
}
