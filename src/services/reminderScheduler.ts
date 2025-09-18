import { subDays, parseISO, isAfter, isBefore, startOfDay } from 'date-fns';
import type { 
  Arrangement, 
  ReminderSchedule, 
  ReminderNotification, 
  ReminderSettings,
  AppState,
  MessageTemplate,
  AgentProfile
} from '../types';

// Default agent profile
export const DEFAULT_AGENT_PROFILE: AgentProfile = {
  name: "[Agent Name]",
  title: "Enforcement Agent",
  signature: "Enforcement Agent [Agent Name]",
  contactInfo: undefined
};

// Default message templates
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'professional_standard',
    name: 'Professional Standard',
    template: `{greeting}PAYMENT REMINDER\n\n{refLine}Your payment arrangement is due {date}{time}.\n\nAmount Due: £{amount}\n\nPayment must be made as agreed. Failure to comply may result in further enforcement action.\n\nContact immediately if unable to pay as arranged.\n\n{signature}`,
    variables: ['greeting', 'refLine', 'date', 'time', 'amount', 'signature']
  },
  {
    id: 'friendly_reminder',
    name: 'Friendly Reminder',
    template: `{greeting}Payment Reminder\n\n{refLine}This is a friendly reminder that your payment arrangement is due {date}{time}.\n\nAmount: £{amount}\n\nPlease ensure payment is made as agreed. If you need to discuss this arrangement, please contact us immediately.\n\nThank you,\n{signature}`,
    variables: ['greeting', 'refLine', 'date', 'time', 'amount', 'signature']
  },
  {
    id: 'urgent_notice',
    name: 'Urgent Notice',
    template: `{greeting}URGENT: PAYMENT DUE\n\n{refLine}Your payment arrangement is due {date}{time}.\n\nAmount Due: £{amount}\n\nIMPORTANT: Payment must be made TODAY as agreed. Failure to comply will result in immediate further enforcement action.\n\nContact us NOW if unable to pay.\n\n{signature}`,
    variables: ['greeting', 'refLine', 'date', 'time', 'amount', 'signature']
  },
  {
    id: 'custom',
    name: 'Custom Template',
    template: `{greeting}Payment Reminder\n\n{refLine}Your payment is due {date}{time}.\n\nAmount: £{amount}\n\n[Customize this message]\n\n{signature}`,
    variables: ['greeting', 'refLine', 'date', 'time', 'amount', 'signature']
  }
];

// Default reminder schedule: 3 days before, 1 day before, and day of payment
export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = {
  daysBeforePayment: [3, 1, 0],
  enabled: true,
  autoSend: false
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  defaultSchedule: DEFAULT_REMINDER_SCHEDULE,
  globalEnabled: true,
  smsEnabled: true,
  agentProfile: DEFAULT_AGENT_PROFILE,
  messageTemplates: DEFAULT_MESSAGE_TEMPLATES,
  activeTemplateId: 'professional_standard',
  customizableSchedule: {
    threeDayReminder: true,
    oneDayReminder: true,
    dayOfReminder: true,
    customDays: []
  }
};

/**
 * Calculate reminder dates for an arrangement using customizable settings
 */
export function calculateReminderDates(
  arrangement: Arrangement,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS
): string[] {
  const schedule = arrangement.reminderSchedule || settings.defaultSchedule;

  if (!schedule.enabled || !settings.globalEnabled) {
    return [];
  }

  const paymentDate = parseISO(arrangement.scheduledDate);

  // Use the schedule's daysBeforePayment array if available, otherwise fall back to customizable settings
  let reminderDays: number[] = [];

  if (schedule.daysBeforePayment && schedule.daysBeforePayment.length > 0) {
    // Use arrangement-specific or default schedule days
    reminderDays = [...schedule.daysBeforePayment];
  } else {
    // Fall back to global customizable schedule
    if (settings.customizableSchedule.threeDayReminder) {
      reminderDays.push(3);
    }
    if (settings.customizableSchedule.oneDayReminder) {
      reminderDays.push(1);
    }
    if (settings.customizableSchedule.dayOfReminder) {
      reminderDays.push(0);
    }

    // Add any custom days
    reminderDays.push(...settings.customizableSchedule.customDays);
  }

  // Remove duplicates and sort
  const uniqueDays = [...new Set(reminderDays)].sort((a, b) => b - a);

  return uniqueDays.map(daysBefore => {
    const reminderDate = subDays(paymentDate, daysBefore);
    return reminderDate.toISOString();
  });
}

/**
 * Create reminder notifications for an arrangement
 */
export function createReminderNotifications(
  arrangement: Arrangement,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS
): ReminderNotification[] {
  const reminderDates = calculateReminderDates(arrangement, settings);
  const now = new Date().toISOString();
  
  return reminderDates.map((dateStr, index) => ({
    id: `${arrangement.id}_reminder_${index}`,
    arrangementId: arrangement.id,
    type: getReminderType(arrangement, dateStr),
    scheduledDate: dateStr,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now
  }));
}

/**
 * Determine reminder type based on timing
 */
export function getReminderType(arrangement: Arrangement, reminderDate: string): 'payment_due' | 'overdue' | 'custom' {
  const paymentDate = startOfDay(parseISO(arrangement.scheduledDate));
  const reminderDateTime = startOfDay(parseISO(reminderDate));
  const today = startOfDay(new Date());
  
  if (reminderDateTime.getTime() === paymentDate.getTime()) {
    return 'payment_due';
  } else if (isAfter(today, paymentDate)) {
    return 'overdue';
  } else {
    return 'custom';
  }
}

/**
 * Get pending reminders that are due today or overdue
 */
export function getPendingReminders(
  arrangements: Arrangement[], 
  notifications: ReminderNotification[] = []
): ReminderNotification[] {
  const today = startOfDay(new Date());
  
  return notifications.filter(notification => {
    if (notification.status !== 'pending') {
      return false;
    }
    
    // Find the associated arrangement
    const arrangement = arrangements.find(arr => arr.id === notification.arrangementId);
    if (!arrangement || arrangement.status === 'Completed' || arrangement.status === 'Cancelled') {
      return false;
    }
    
    const reminderDate = startOfDay(parseISO(notification.scheduledDate));
    return !isAfter(reminderDate, today); // Due today or overdue
  });
}

/**
 * Process arrangements and generate missing reminder notifications
 */
export function processArrangementReminders(state: AppState): ReminderNotification[] {
  const settings = state.reminderSettings || DEFAULT_REMINDER_SETTINGS;
  
  if (!settings.globalEnabled) {
    return state.reminderNotifications || [];
  }
  
  const existingNotifications = state.reminderNotifications || [];
  const newNotifications: ReminderNotification[] = [];
  
  // Process each active arrangement
  state.arrangements
    .filter(arr => arr.status !== 'Completed' && arr.status !== 'Cancelled')
    .forEach(arrangement => {
      // Check if we already have notifications for this arrangement
      const hasExistingNotifications = existingNotifications.some(
        n => n.arrangementId === arrangement.id
      );
      
      if (!hasExistingNotifications) {
        // Create new reminder notifications with current settings
        const reminderNotifications = createReminderNotifications(arrangement, settings);
        newNotifications.push(...reminderNotifications);
      }
    });
  
  // Combine existing and new notifications
  return [...existingNotifications, ...newNotifications];
}

/**
 * Update reminder notification status
 */
export function updateReminderStatus(
  notifications: ReminderNotification[],
  notificationId: string,
  status: ReminderNotification['status'],
  message?: string
): ReminderNotification[] {
  return notifications.map(notification => {
    if (notification.id === notificationId) {
      return {
        ...notification,
        status,
        message: message || notification.message,
        updatedAt: new Date().toISOString()
      };
    }
    return notification;
  });
}

/**
 * Clean up old notifications for completed/cancelled arrangements
 */
export function cleanupOldNotifications(
  notifications: ReminderNotification[],
  arrangements: Arrangement[]
): ReminderNotification[] {
  const activeArrangementIds = new Set(
    arrangements
      .filter(arr => arr.status !== 'Completed' && arr.status !== 'Cancelled')
      .map(arr => arr.id)
  );
  
  return notifications.filter(notification => 
    activeArrangementIds.has(notification.arrangementId)
  );
}

/**
 * Generate reminder message for notification using customizable template
 */
export function generateReminderMessage(
  arrangement: Arrangement, 
  _notification: ReminderNotification,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS
): string {
  const template = settings.messageTemplates.find(t => t.id === settings.activeTemplateId) 
    || settings.messageTemplates[0];
  
  const customerField = arrangement.customerName || "";
  const amount = arrangement.amount || "the arranged amount";
  const paymentDate = parseISO(arrangement.scheduledDate);
  
  // Extract reference number and surname from "123456789 surname" format
  let greeting = "";
  let referenceNumber = "";
  
  if (customerField) {
    const parts = customerField.trim().split(/\s+/);
    if (parts.length >= 2) {
      referenceNumber = parts[0];
      const surname = parts.slice(1).join(" ");
      greeting = `Mr/Mrs ${surname}, `;
    } else {
      greeting = `${customerField}, `;
    }
  }
  
  const refLine = referenceNumber ? `Reference: ${referenceNumber}\n\n` : "";
  
  const timeText = arrangement.scheduledTime ? ` at ${arrangement.scheduledTime}` : "";
  const dateText = paymentDate.toLocaleDateString('en-GB');
  
  // Replace template variables
  let message = template.template;
  
  const replacements: Record<string, string> = {
    greeting,
    refLine,
    date: dateText,
    time: timeText,
    amount,
    signature: settings.agentProfile.signature,
    customerName: customerField,
    referenceNumber: referenceNumber || '',
    agentName: settings.agentProfile.name,
    agentTitle: settings.agentProfile.title,
    contactInfo: settings.agentProfile.contactInfo || ''
  };
  
  // Replace all template variables
  Object.entries(replacements).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    message = message.replace(regex, value);
  });
  
  return message;
}

/**
 * Get reminder statistics for dashboard
 */
export function getReminderStats(
  arrangements: Arrangement[],
  notifications: ReminderNotification[]
) {
  const pendingReminders = getPendingReminders(arrangements, notifications);
  const todayReminders = pendingReminders.filter(n => {
    const reminderDate = startOfDay(parseISO(n.scheduledDate));
    const today = startOfDay(new Date());
    return reminderDate.getTime() === today.getTime();
  });
  
  const overduePayments = arrangements.filter(arr => {
    if (arr.status === 'Completed' || arr.status === 'Cancelled') return false;
    const paymentDate = startOfDay(parseISO(arr.scheduledDate));
    const today = startOfDay(new Date());
    return isBefore(paymentDate, today);
  });
  
  return {
    totalPending: pendingReminders.length,
    dueToday: todayReminders.length,
    overduePayments: overduePayments.length,
    totalArrangements: arrangements.filter(arr => 
      arr.status !== 'Completed' && arr.status !== 'Cancelled'
    ).length
  };
}