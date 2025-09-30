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

export type ReminderSchedule = {
  daysBeforePayment: number[];
  enabled: boolean;
  autoSend?: boolean;  // Future: auto-send via service
};

export type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  variables: string[]; // Available variables like {customerName}, {amount}, {date}, etc.
};

export type AgentProfile = {
  name: string;
  title: string; // e.g., "Enforcement Agent", "Bailiff", "Recovery Officer"
  signature: string; // e.g., "Enforcement Agent J. Smith"
  contactInfo?: string;
};

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
  initialPaymentAmount?: string;  // Initial payment recorded at arrangement creation
  createdAt: string;
  updatedAt: string;
  // Recurring payment fields
  recurrenceType?: RecurrenceType;
  recurrenceInterval?: number;  // e.g., 1 for weekly, 2 for bi-weekly
  totalPayments?: number;       // total number of payments expected
  paymentsMade?: number;        // payments completed so far
  parentArrangementId?: string; // links recurring payments to original
  // Reminder tracking
  lastReminderSent?: string;    // ISO timestamp of last reminder
  reminderCount?: number;       // number of reminders sent
  reminderSchedule?: ReminderSchedule; // customizable reminder schedule
  nextReminderDue?: string;     // ISO timestamp for next scheduled reminder
  scheduledReminders?: string[]; // Array of ISO timestamps for all scheduled reminders
};

export type SubscriptionStatus = "active" | "trial" | "expired" | "cancelled";

export type SubscriptionPlan = {
  id: string;
  name: string;
  price: number; // in pence (2500 = £25.00)
  currency: string;
  features: string[];
  trialDays: number;
};

export type UserSubscription = {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string; // ISO date
  currentPeriodEnd: string;   // ISO date
  trialStart?: string;        // ISO date
  trialEnd?: string;          // ISO date
  cancelledAt?: string;       // ISO date
  createdAt: string;          // ISO date
  updatedAt: string;          // ISO date
  lastPaymentAt?: string;     // ISO date
  nextPaymentDue?: string;    // ISO date
};

export type CourtType = "high_court" | "magistrates" | "custom";

export type CommissionRule = {
  id: string;
  name: string;
  courtType: CourtType;
  isActive: boolean;
  fees: {
    pif: number;     // Fee for PIF completions (in pence)
    done: number;    // Fee for Done completions (in pence) 
    da: number;      // Fee for DA completions (in pence)
    arr: number;     // Fee for ARR completions (in pence)
  };
  bonuses?: {
    dailyTargetAddresses?: number;  // Daily target for bonus
    dailyBonusAmount?: number;      // Bonus amount if target met (in pence)
    weeklyTargetPifs?: number;      // Weekly PIF target
    weeklyBonusAmount?: number;     // Weekly bonus (in pence)
  };
  createdAt: string;
  updatedAt: string;
};

export type DailyEarnings = {
  date: string;           // YYYY-MM-DD
  ruleId: string;         // Which commission rule was used
  completions: {
    pif: { count: number; amount: number; };
    done: { count: number; amount: number; };
    da: { count: number; amount: number; };
    arr: { count: number; amount: number; };
  };
  totalEarnings: number;  // Total for the day (in pence)
  bonusEarned?: number;   // Any bonus earned (in pence)
  addressesCompleted: number;
  workHours?: number;     // Hours worked (from day sessions)
};

export type ReminderNotification = {
  id: string;
  arrangementId: string;
  type: 'payment_due' | 'overdue' | 'custom';
  scheduledDate: string;  // When the reminder should be shown/sent
  status: 'pending' | 'shown' | 'dismissed' | 'sent';
  message?: string;       // Custom reminder message
  createdAt: string;
  updatedAt: string;
};

export type ReminderSettings = {
  defaultSchedule: ReminderSchedule;
  globalEnabled: boolean;
  smsEnabled: boolean;
  agentProfile: AgentProfile;
  messageTemplates: MessageTemplate[];
  activeTemplateId: string;
  customizableSchedule: {
    threeDayReminder: boolean;
    oneDayReminder: boolean;
    dayOfReminder: boolean;
    customDays: number[]; // Additional custom reminder days
  };
};

export type AppState = {
  addresses: AddressRow[];
  activeIndex: number | null;
  completions: Completion[];
  daySessions: DaySession[];
  arrangements: Arrangement[];
  /** Increments whenever you import a new Excel list. */
  currentListVersion: number;
  /** Schema version for data migration. */
  _schemaVersion?: number;
  /** User subscription info */
  subscription?: UserSubscription | null;
  /** Commission tracking */
  commissionRules?: CommissionRule[];
  activeCommissionRule?: string | null; // ID of currently active rule
  dailyEarnings?: DailyEarnings[];
  /** Reminder system settings */
  reminderSettings?: ReminderSettings;
  /** Pending reminder notifications */
  reminderNotifications?: ReminderNotification[];
  /** Last time reminders were processed */
  lastReminderProcessed?: string; // ISO timestamp
};