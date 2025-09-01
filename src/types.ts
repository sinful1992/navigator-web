export type AddressRow = {
  address: string;
  lat?: number | null;
  lng?: number | null;
};

export type Outcome = "PIF" | "DA" | "Done" | "ARR";

export type Completion = {
  index: number;
  outcome: Outcome;
  amount?: string;
  completedAt?: string;
  updatedAt?: string;
  listVersion?: number;     // legacy-safe: optional, Step C writes it going forward
  addressSnapshot?: string; // stable label captured at completion time
  addressId?: string;       // optional if rows have stable IDs
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
  customerName?: string;
  phoneNumber?: string;
  scheduledDate: string;    // ISO date string (YYYY-MM-DD)
  scheduledTime?: string;   // optional time (HH:MM)
  status: ArrangementStatus;
  notes?: string;
  amount?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppState = {
  currentListVersion: number;
  addresses?: Array<{ id?: string; address?: string; postcode?: string; lat?: number; lng?: number }>;
  completions?: Completion[];
  day?: { startTime?: string; endTime?: string };
  activeIndex?: number;
  // track simple migration flags
  migrations?: {
    backfill_completion_snapshots_v1?: boolean;
};
