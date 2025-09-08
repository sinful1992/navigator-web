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
  timestamp: string;        // ISO string
  /** The list version this completion belongs to (so new imports don't hide items). */
  listVersion?: number;
  /** Link to arrangement if this completion came from an arrangement payment. */
  arrangementId?: string;
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

export type RecurrenceType = "none" | "weekly" | "monthly" | "custom";

export type Arrangement = {
  id: string;               // unique identifier
  addressIndex: number;     // links to address in the main list
  address: string;          // cached for display
  customerName?: string;
  phoneNumber?: string;
  scheduledDate: string;    // ISO date string (YYYY-MM-DD)
  scheduledTime?: string;   // optional time (HH:MM)
  status: ArrangementStatus;
  notes?: string;
  amount?: string;
  createdAt: string;
  updatedAt: string;
  // Recurring payment fields
  recurrenceType?: RecurrenceType;
  recurrenceInterval?: number;  // e.g., 1 for weekly, 2 for bi-weekly
  totalPayments?: number;       // total number of payments expected
  paymentsMade?: number;        // payments completed so far
  parentArrangementId?: string; // links recurring payments to original
};

export type AppState = {
  addresses: AddressRow[];
  activeIndex: number | null;
  completions: Completion[];
  daySessions: DaySession[];
  arrangements: Arrangement[];
  /** Increments whenever you import a new Excel list. */
  currentListVersion: number;
};