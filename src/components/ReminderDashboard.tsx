import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { LoadingButton } from './LoadingButton';
import { ReminderSettings as ReminderSettingsModal } from './ReminderSettings';
import { logger } from '../utils/logger';

import type { 
  AppState, 
  ReminderNotification, 
  Arrangement,
  ReminderSettings 
} from '../types';
import { 
  getPendingReminders, 
  generateReminderMessage, 
  getReminderStats,
  DEFAULT_REMINDER_SETTINGS
} from '../services/reminderScheduler';

type Props = {
  state: AppState;
  onUpdateReminderSettings: (settings: ReminderSettings) => void;
  onUpdateReminderNotification: (notificationId: string, status: ReminderNotification['status']) => void;
  onSendReminder: (arrangement: Arrangement) => Promise<void>;
};

export function ReminderDashboard({ 
  state, 
  onUpdateReminderSettings, 
  onUpdateReminderNotification,
  onSendReminder 
}: Props) {
  const [sendingReminders, setSendingReminders] = React.useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = React.useState(false);
  
  const settings = state.reminderSettings || DEFAULT_REMINDER_SETTINGS;
  const notifications = state.reminderNotifications || [];
  const pendingReminders = getPendingReminders(state.arrangements, notifications);
  const stats = getReminderStats(state.arrangements, notifications);
  
  // Group pending reminders by arrangement
  const remindersByArrangement = React.useMemo(() => {
    const grouped = new Map<string, { arrangement: Arrangement; reminders: ReminderNotification[] }>();
    
    pendingReminders.forEach(reminder => {
      const arrangement = state.arrangements.find(arr => arr.id === reminder.arrangementId);
      if (arrangement) {
        if (!grouped.has(arrangement.id)) {
          grouped.set(arrangement.id, { arrangement, reminders: [] });
        }
        grouped.get(arrangement.id)!.reminders.push(reminder);
      }
    });
    
    return Array.from(grouped.values());
  }, [pendingReminders, state.arrangements]);
  
  const handleSendReminder = async (arrangement: Arrangement, reminder: ReminderNotification) => {
    setSendingReminders(prev => new Set([...prev, reminder.id]));
    
    try {
      await onSendReminder(arrangement);
      onUpdateReminderNotification(reminder.id, 'sent');
    } catch (error) {
      logger.error('Failed to send reminder:', error);
      alert('Failed to send reminder. Please try again.');
    } finally {
      setSendingReminders(prev => {
        const next = new Set(prev);
        next.delete(reminder.id);
        return next;
      });
    }
  };
  
  const handleDismissReminder = (reminderId: string) => {
    onUpdateReminderNotification(reminderId, 'dismissed');
  };
  
  
  return (
    <div className="reminder-dashboard">
      {/* Header with stats */}
      <div className="top-row">
        <div className="stat-item">
          <div className="stat-label">🔔 Pending</div>
          <div className="stat-value">{stats.totalPending}</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-label">📅 Due Today</div>
          <div className="stat-value" style={{ 
            color: stats.dueToday > 0 ? "var(--warning)" : "var(--text-primary)" 
          }}>
            {stats.dueToday}
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-label">⚠️ Overdue</div>
          <div className="stat-value" style={{ 
            color: stats.overduePayments > 0 ? "var(--danger)" : "var(--text-primary)" 
          }}>
            {stats.overduePayments}
          </div>
        </div>
        
        <div className="stat-actions">
          <button 
            className="btn btn-ghost"
            onClick={() => setShowSettings(true)}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>
      
      {/* Settings Modal */}
      {showSettings && (
        <ReminderSettingsModal
          settings={settings}
          onUpdateSettings={(newSettings) => {
            onUpdateReminderSettings(newSettings);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      
      {/* Pending Reminders */}
      <div className="reminders-list">
        {remindersByArrangement.length === 0 ? (
          <div className="empty-box">
            <div style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              🔔 No pending reminders
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
              {settings.globalEnabled 
                ? "All reminders are up to date" 
                : "Reminder system is disabled in settings"
              }
            </div>
          </div>
        ) : (
          remindersByArrangement.map(({ arrangement, reminders }) => (
            <div className="card reminder-card fade-in-up" key={arrangement.id}>
              <div className="reminder-header">
                <div className="reminder-info">
                  <div className="reminder-address">
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      #{arrangement.addressIndex + 1}
                    </span>{" "}
                    {arrangement.address}
                  </div>
                  {arrangement.customerName && (
                    <div className="reminder-customer">
                      👤 {arrangement.customerName}
                    </div>
                  )}
                  <div className="reminder-payment-info">
                    💰 £{arrangement.amount} due {format(parseISO(arrangement.scheduledDate), 'MMM d, yyyy')}
                    {arrangement.scheduledTime && ` at ${arrangement.scheduledTime}`}
                  </div>
                  {arrangement.phoneNumber && (
                    <div className="reminder-phone">
                      📞 {arrangement.phoneNumber}
                    </div>
                  )}
                </div>
                
                <div className="reminder-status">
                  <span className="pill" style={{ 
                    backgroundColor: "var(--warning)15",
                    borderColor: "var(--warning)",
                    color: "var(--warning)"
                  }}>
                    🔔 {reminders.length} reminder{reminders.length > 1 ? 's' : ''} pending
                  </span>
                </div>
              </div>
              
              {/* Individual Reminders */}
              <div className="reminder-notifications">
                {reminders.map(reminder => {
                  const message = generateReminderMessage(arrangement, reminder, settings);
                  const isOverdue = parseISO(reminder.scheduledDate) < new Date();
                  
                  return (
                    <div 
                      key={reminder.id}
                      className="reminder-notification"
                      style={{
                        padding: '0.75rem',
                        margin: '0.5rem 0',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius)',
                        backgroundColor: isOverdue ? 'var(--danger)05' : 'var(--warning)05'
                      }}
                    >
                      <div className="reminder-notification-header">
                        <div style={{ 
                          fontSize: '0.875rem', 
                          fontWeight: 600,
                          color: isOverdue ? 'var(--danger)' : 'var(--warning)'
                        }}>
                          {isOverdue ? '⚠️ Overdue' : '🔔'} Reminder due {format(parseISO(reminder.scheduledDate), 'MMM d, yyyy')}
                        </div>
                        <div className="reminder-actions">
                          {arrangement.phoneNumber && settings.smsEnabled && (
                            <LoadingButton
                              className="btn btn-sm btn-primary"
                              isLoading={sendingReminders.has(reminder.id)}
                              loadingText="Sending..."
                              onClick={() => handleSendReminder(arrangement, reminder)}
                            >
                              📱 Send SMS
                            </LoadingButton>
                          )}
                          
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleDismissReminder(reminder.id)}
                          >
                            ✕ Dismiss
                          </button>
                        </div>
                      </div>
                      
                      {/* Preview of reminder message */}
                      <div className="reminder-preview">
                        <details style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                            📝 Preview message
                          </summary>
                          <div style={{ 
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            backgroundColor: 'var(--surface)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius)',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem'
                          }}>
                            {message}
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Quick Actions */}
      {pendingReminders.length > 0 && (
        <div className="reminder-quick-actions">
          <div style={{ 
            padding: '1rem',
            backgroundColor: 'var(--primary)05',
            border: '1px solid var(--primary)',
            borderRadius: 'var(--radius)',
            marginTop: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              💡 Quick Actions
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Use the "Send SMS" buttons above to open your device's messaging app with pre-written reminder messages.
              {!settings.smsEnabled && " Enable SMS reminders in settings to see SMS options."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}