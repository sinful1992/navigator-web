// src/types.ts
export type AddressRow = {
  address: string;
  lat?: number | null;
  lng?: number | null;
};

export type Outcome = "PIF" | "DA" | "Done" | "ARR";

export type Completion = {
  index: number;            // index in the address list at the time of completion
  address: string;
  lat?: number | null;
  lng?: number | null;
  outcome: Outcome;
  amount?: string;          // "12.34" (string to preserve formatting)
  timestamp: string;        // ISO string (when recorded/edited)
  // Some older code used "ts"; we keep timestamp as the canonical field.
};

export type DaySession = {
  date: string;             // "YYYY-MM-DD"
  start: string;            // ISO string
  end?: string;             // ISO string (undefined while active)
  durationSeconds?: number; // computed on end
};

export type ArrangementStatus =
  | "Scheduled"
  | "Confirmed"
  | "Cancelled"
  | "Completed"
  | "Missed";

export type Arrangement = {
  id: string;               // unique identifier
  addressIndex: number;     // links to address in the main list
  address: string;          // cached for display
  customerName?: string;    // optional customer name
  phoneNumber?: string;     // optional contact number
  scheduledDate: string;    // ISO date string (YYYY-MM-DD)
  scheduledTime?: string;   // optional time (HH:MM)
  status: ArrangementStatus;
  notes?: string;           // optional notes
  amount?: string;          // expected amount
  createdAt: string;        // when arrangement was created
  updatedAt: string;        // when last modified
};

export type AppState = {
  addresses: AddressRow[];
  activeIndex: number | null;
  completions: Completion[];
  daySessions: DaySession[];
  arrangements: Arrangement[];
};