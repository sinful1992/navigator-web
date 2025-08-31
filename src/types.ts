// src/types.ts

export type AddressRow = {
  address: string;
  lat?: number | null;
  lng?: number | null;
};

// If you also use "ARR" elsewhere, add it here:
// export type Outcome = "PIF" | "DA" | "Done" | "ARR";
export type Outcome = "PIF" | "DA" | "Done";

export type Completion = {
  index: number;            // index in the list at the time of completion (for that version)
  address: string;          // cached label (stable for history)
  lat?: number | null;
  lng?: number | null;
  outcome: Outcome;
  amount?: string;          // "12.34" (string preserves formatting)
  timestamp: string;        // ISO string
  listVersion: number;      // <== NEW: which import/version this completion belongs to
};

export type DaySession = {
  date: string;             // "YYYY-MM-DD"
  start: string;            // ISO
  end?: string;             // ISO
  durationSeconds?: number;
};

export type ArrangementStatus =
  | "Scheduled"
  | "Confirmed"
  | "Cancelled"
  | "Completed"
  | "Missed";

export type Arrangement = {
  id: string;
  addressIndex: number;
  address: string;
  customerName?: string;
  phoneNumber?: string;
  scheduledDate: string;    // "YYYY-MM-DD"
  scheduledTime?: string;   // "HH:MM"
  status: ArrangementStatus;
  notes?: string;
  amount?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppState = {
  // NEW: the active version of the imported list (increments on every import)
  currentListVersion: number;

  addresses: AddressRow[];
  activeIndex: number | null;
  completions: Completion[];
  daySessions: DaySession[];
  arrangements: Arrangement[];
};