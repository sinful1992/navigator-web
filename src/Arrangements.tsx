import * as React from "react";
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek, isSameDay, isPast, addDays } from "date-fns";
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome, RecurrenceType } from "./types";
import { LoadingButton } from "./components/LoadingButton";
import { generateReminderMessage } from "./services/reminderScheduler";
import UnifiedArrangementForm from "./components/UnifiedArrangementForm";

type Props = {
  state: AppState;
  onAddArrangement: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>; // Returns the arrangement ID
  onUpdateArrangement: (id: string, updates: Partial<Arrangement>) => void;
  onDeleteArrangement: (id: string) => void;
  onAddAddress?: (address: AddressRow) => Promise<number>; // Returns the new address index
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => void; // ✅ mark as completed (ARR)
  autoCreateForAddress?: number | null;
  onAutoCreateHandled?: () => void;
};

type ViewMode = "thisWeek" | "all";

const ArrangementsComponent = function Arrangements({
  state,
  onAddArrangement,
  onUpdateArrangement,
  onDeleteArrangement,
  onAddAddress,
  onComplete,
  autoCreateForAddress,
  onAutoCreateHandled
}: Props) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("thisWeek");
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loadingStates, setLoadingStates] = React.useState<{
    saving: boolean;
    updating: boolean;
    deleting: Set<string>;
    markingPaid: Set<string>;
    markingDefaulted: Set<string>;
    sendingReminder: Set<string>;
  }>({
    saving: false,
    updating: false,
    deleting: new Set(),
    markingPaid: new Set(),
    markingDefaulted: new Set(),
    sendingReminder: new Set()
  });

  // State for reminder confirmations
  const [reminderSent, setReminderSent] = React.useState<Set<string>>(new Set());


  // Format phone number for SMS (keep original format, just clean it)
  const formatPhoneForSMS = (phone: string): string => {
    if (!phone) return "";

    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, "");

    // If starts with 0, keep as is (UK local format)
    // If starts with +44, keep as is (international format)
    // Otherwise assume it's a clean UK number
    if (cleaned.startsWith("0") || cleaned.startsWith("+44") || cleaned.startsWith("44")) {
      return cleaned;
    }

    // For other formats, assume UK and add leading 0 if it looks like a mobile number
    if (cleaned.length === 10 && cleaned.startsWith("7")) {
      return "0" + cleaned;
    }

    return cleaned;
  };

  // Send SMS reminder
  const sendReminderSMS = async (arrangement: Arrangement) => {
    if (!arrangement.phoneNumber) {
      alert("No phone number available for this arrangement.");
      return;
    }

    setLoadingStates(prev => ({
      ...prev,
      sendingReminder: new Set([...prev.sendingReminder, arrangement.id])
    }));

    try {
      // Create a mock notification for message generation
      const mockNotification = {
        id: 'temp',
        arrangementId: arrangement.id,
        type: 'payment_due' as const,
        scheduledDate: new Date().toISOString(),
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const message = generateReminderMessage(arrangement, mockNotification, state.reminderSettings);
      const formattedPhone = formatPhoneForSMS(arrangement.phoneNumber);

      // Create SMS URL (sms: protocol)
      const smsUrl = `sms:${formattedPhone}?body=${encodeURIComponent(message)}`;

      // Open default SMS app
      window.location.href = smsUrl;

      // Update arrangement with reminder info
      const now = new Date().toISOString();
      await onUpdateArrangement(arrangement.id, {
        lastReminderSent: now,
        reminderCount: (arrangement.reminderCount || 0) + 1,
        updatedAt: now
      });

      // Show confirmation
      setReminderSent(prev => new Set([...prev, arrangement.id]));

      // Auto-hide confirmation after 3 seconds
      setTimeout(() => {
        setReminderSent(prev => {
          const next = new Set(prev);
          next.delete(arrangement.id);
          return next;
        });
      }, 3000);

    } catch (error) {
      console.error("Failed to send reminder:", error);
      alert("Failed to update reminder information. Please try again.");
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        sendingReminder: new Set([...prev.sendingReminder].filter(id => id !== arrangement.id))
      }));
    }
  };

  // Handle auto-create from address list
  React.useEffect(() => {
    if (autoCreateForAddress !== null && autoCreateForAddress !== undefined) {
      setShowAddForm(true);
      onAutoCreateHandled?.();
    }
  }, [autoCreateForAddress, onAutoCreateHandled]);

  // Filter arrangements based on view mode - focus on upcoming payments
  const filteredArrangements = React.useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Monday

    let filtered = state.arrangements;

    if (viewMode === "thisWeek") {
      filtered = state.arrangements.filter(arr => {
        const arrDate = parseISO(arr.scheduledDate);
        return isWithinInterval(arrDate, { start: weekStart, end: weekEnd }) &&
               arr.status !== "Completed" &&
               arr.status !== "Cancelled";
      });
    } else {
      filtered = state.arrangements.filter(arr =>
        arr.status !== "Completed" && arr.status !== "Cancelled"
      );
    }

    // Sort by date, then by time
    return filtered.sort((a, b) => {
      const dateA = parseISO(a.scheduledDate).getTime();
      const dateB = parseISO(b.scheduledDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const timeA = a.scheduledTime || "00:00";
      const timeB = b.scheduledTime || "00:00";
      return timeA.localeCompare(timeB);
    });
  }, [state.arrangements, viewMode]);

  // Group arrangements by date
  const groupedArrangements = React.useMemo(() => {
    const groups = new Map<string, Arrangement[]>();
    filteredArrangements.forEach(arr => {
      const dateKey = arr.scheduledDate;
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredArrangements]);

  // Stats
  const stats = React.useMemo(() => {
    const total = filteredArrangements.length;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = filteredArrangements.filter(arr => arr.scheduledDate === today).length;
    const overdue = filteredArrangements.filter(arr => {
      const arrDate = parseISO(arr.scheduledDate);
      return isPast(arrDate) && arr.status === "Scheduled";
    }).length;
    const totalAmountDue = filteredArrangements.reduce((sum, arr) => {
      if (arr.amount && arr.status !== "Completed") {
        const amount = parseFloat(arr.amount);
        return sum + (isNaN(amount) ? 0 : amount);
      }
      return sum;
    }, 0);
    return { total, todayCount, overdue, totalAmountDue };
  }, [filteredArrangements]);

  const getStatusIcon = (status: ArrangementStatus): string => {
    switch (status) {
      case "Scheduled": return "📅";
      case "Confirmed": return "✅";
      case "Completed": return "🎉";
      case "Cancelled": return "❌";
      case "Missed": return "⚠️";
    }
  };

  const formatDateHeader = (dateStr: string): string => {
    const date = parseISO(dateStr);
    const today = new Date();
    const tomorrow = addDays(today, 1);
    if (isSameDay(date, today)) return "Today";
    if (isSameDay(date, tomorrow)) return "Tomorrow";
    return format(date, "EEEE, d MMM yyyy");
  };

  // Helper to calculate next payment date
  const calculateNextPaymentDate = (currentDate: string, recurrenceType: RecurrenceType, interval: number = 1): string => {
    const current = new Date(currentDate);

    switch (recurrenceType) {
      case "weekly":
        current.setDate(current.getDate() + (7 * interval));
        break;
      case "biweekly":
        current.setDate(current.getDate() + 14);
        break;
      case "monthly":
        current.setMonth(current.getMonth() + interval);
        break;
      default:
        return currentDate;
    }

    return current.toISOString().slice(0, 10);
  };

  // Mark arrangement as defaulted (customer didn't pay)
  const markAsDefaulted = async (id: string) => {
    const arrangement = state.arrangements.find(arr => arr.id === id);
    if (!arrangement) return;

    // Update arrangement status to completed (defaulted)
    onUpdateArrangement(id, {
      status: "Completed",
      updatedAt: new Date().toISOString()
    });

    // Create completion record with Done outcome for defaulted arrangement
    onComplete(arrangement.addressIndex, "Done", undefined, arrangement.id);
  };

  // Mark arrangement as paid/completed
  const markAsPaid = async (id: string, amount: string) => {
    // Find the arrangement to get the address index
    const arrangement = state.arrangements.find(arr => arr.id === id);
    if (!arrangement) return;

    // Update payment count
    const paymentsMade = (arrangement.paymentsMade || 0) + 1;
    const isLastPayment = paymentsMade >= (arrangement.totalPayments || 1);
    const isRecurring = arrangement.recurrenceType && arrangement.recurrenceType !== "none";

    // Update arrangement status
    onUpdateArrangement(id, {
      status: "Completed",
      amount: amount,
      paymentsMade,
      updatedAt: new Date().toISOString()
    });

    // Create completion record with PIF outcome and arrangement reference
    onComplete(arrangement.addressIndex, "PIF", amount, arrangement.id);

    // Create next payment arrangement if this is recurring and not the last payment
    if (isRecurring && !isLastPayment) {
      const nextDate = calculateNextPaymentDate(
        arrangement.scheduledDate,
        arrangement.recurrenceType!,
        arrangement.recurrenceInterval || 1
      );

      const nextPaymentNumber = paymentsMade + 1;
      const nextArrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'> = {
        addressIndex: arrangement.addressIndex,
        address: arrangement.address,
        customerName: arrangement.customerName,
        phoneNumber: arrangement.phoneNumber,
        scheduledDate: nextDate,
        scheduledTime: arrangement.scheduledTime,
        status: "Scheduled" as ArrangementStatus,
        notes: arrangement.notes ? `${arrangement.notes} (Payment ${nextPaymentNumber}/${arrangement.totalPayments})` : `Payment ${nextPaymentNumber}/${arrangement.totalPayments}`,
        amount: arrangement.amount,
        recurrenceType: arrangement.recurrenceType,
        recurrenceInterval: arrangement.recurrenceInterval,
        totalPayments: arrangement.totalPayments,
        paymentsMade: paymentsMade,
        parentArrangementId: arrangement.parentArrangementId || arrangement.id,
      };

      await onAddArrangement(nextArrangement);
    }
  };

  // Handle arrangement creation (also mark as ARR completion or process initial payment)
  const handleArrangementSave = async (arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => {
    setLoadingStates(prev => ({ ...prev, saving: true }));
    try {
      // Validate address index is still valid
      if (arrangementData.addressIndex < 0 || arrangementData.addressIndex >= state.addresses.length) {
        throw new Error('Selected address is no longer valid. Please refresh and try again.');
      }

      // Check if there's an initial payment
      const hasInitialPayment = arrangementData.initialPaymentAmount &&
                                parseFloat(arrangementData.initialPaymentAmount) > 0;

      if (hasInitialPayment) {
        // Create arrangement - this returns the arrangement ID
        const arrangementId = await onAddArrangement(arrangementData);

        // Give React time to propagate the state update to this component
        // The addArrangement promise resolves after state is committed, but we need
        // to wait for the re-render to propagate the updated state prop to this component
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify the arrangement exists in our state before processing payment
        const arrangement = state.arrangements.find(arr => arr.id === arrangementId);
        if (!arrangement) {
          throw new Error('Arrangement was created but not yet available. Please refresh and mark the payment manually.');
        }

        // Process the initial payment using the existing markAsPaid logic
        await markAsPaid(arrangementId, arrangementData.initialPaymentAmount!);
      } else {
        // No initial payment - standard flow
        await onAddArrangement(arrangementData);

        // Record ARR completion
        try {
          onComplete(arrangementData.addressIndex, "ARR");
        } catch (completionError) {
          console.error('Error recording ARR completion:', completionError);
          alert('Arrangement created successfully, but there was an issue recording the completion. You may need to manually mark this address as ARR.');
        }
      }

      setShowAddForm(false);
      setEditingId(null);
    } catch (error) {
      console.error('Error saving arrangement:', error);
      alert(`Failed to save arrangement: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, saving: false }));
    }
  };

  const handleArrangementUpdate = async (id: string, arrangementData: Partial<Arrangement>) => {
    setLoadingStates(prev => ({ ...prev, updating: true }));
    try {
      await onUpdateArrangement(id, arrangementData);
      setEditingId(null);
    } catch (error) {
      console.error('Error updating arrangement:', error);
      alert('Failed to update arrangement. Please try again.');
    } finally {
      setLoadingStates(prev => ({ ...prev, updating: false }));
    }
  };

  return (
    <div className="arrangements-wrap">
      {/* Header with view toggle */}
      <div className="top-row">
        <div className="stat-item">
          <div className="stat-label">📋 Due</div>
          <div className="stat-value">{stats.total}</div>
        </div>

        <div className="stat-item">
          <div className="stat-label">📅 Today</div>
          <div className="stat-value" style={{ color: stats.todayCount > 0 ? "var(--warning)" : "var(--text-primary)" }}>
            {stats.todayCount}
          </div>
        </div>

        {stats.overdue > 0 && (
          <div className="stat-item">
            <div className="stat-label">⚠️ Overdue</div>
            <div className="stat-value" style={{ color: "var(--danger)" }}>{stats.overdue}</div>
          </div>
        )}

        {stats.totalAmountDue > 0 && (
          <div className="stat-item">
            <div className="stat-label">💰 Total Due</div>
            <div className="stat-value" style={{ color: "var(--success)" }}>
              £{stats.totalAmountDue.toFixed(2)}
            </div>
          </div>
        )}

        <div className="stat-actions">
          <div className="btn-group">
            <button
              className={`btn ${viewMode === "thisWeek" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("thisWeek")}
            >
              📅 This Week
            </button>
            <button
              className={`btn ${viewMode === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("all")}
            >
              📋 All Pending
            </button>
            <button
              className="btn btn-success"
              onClick={() => setShowAddForm(true)}
            >
              ➕ Add Arrangement
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <UnifiedArrangementForm
          state={state}
          arrangement={editingId ? state.arrangements.find(a => a.id === editingId) : undefined}
          preSelectedAddressIndex={autoCreateForAddress}
          onAddAddress={onAddAddress}
          onSave={editingId ? (arrangementData) => handleArrangementUpdate(editingId, arrangementData) : handleArrangementSave}
          onCancel={() => {
            setShowAddForm(false);
            setEditingId(null);
          }}
          isLoading={loadingStates.saving || loadingStates.updating}
          onComplete={onComplete}
          fullscreen={true}
        />
      )}

      {/* Arrangements List */}
      <div className="days-list">
        {groupedArrangements.length === 0 ? (
          <div className="empty-box">
            <div style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              📅 No payment arrangements {viewMode === "thisWeek" ? "due this week" : "pending"}
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
              {viewMode === "thisWeek"
                ? "No payment arrangements are scheduled for this week"
                : "No pending payment arrangements found"
              }
            </div>
          </div>
        ) : (
          groupedArrangements.map(([dateStr, arrangements]) => (
            <div className="day-card fade-in-up" key={dateStr}>
              <div className="day-header">
                <div>
                  <div className="day-title">
                    {formatDateHeader(dateStr)}
                  </div>
                  <div className="muted">
                    {arrangements.length} payment{arrangements.length === 1 ? '' : 's'} due
                    {arrangements.some(arr => arr.amount) && (
                      <> • £{arrangements.reduce((sum, arr) => {
                        const amount = parseFloat(arr.amount || '0');
                        return sum + (isNaN(amount) ? 0 : amount);
                      }, 0).toFixed(2)} total</>
                    )}
                  </div>
                </div>
              </div>

              <div className="arrangements-list">
                {arrangements.map(arrangement => (
                  <div className="arrangement-card-modern" key={arrangement.id}>
                    <div className="arrangement-card-header">
                      <div className="arrangement-primary-info">
                        <div className="arrangement-address-modern">
                          <span className="address-index">#{arrangement.addressIndex + 1}</span>
                          <span className="address-text">{arrangement.address}</span>
                        </div>
                        {arrangement.customerName && (
                          <div className="arrangement-customer-modern">
                            <span className="customer-icon">👤</span>
                            <span className="customer-name">{arrangement.customerName}</span>
                          </div>
                        )}
                      </div>

                      <div className="arrangement-status-modern">
                        <span className={`status-badge-modern status-${arrangement.status.toLowerCase()}`}>
                          <span className="status-icon">{getStatusIcon(arrangement.status)}</span>
                          <span className="status-text">{arrangement.status}</span>
                        </span>
                      </div>
                    </div>

                    <div className="arrangement-card-body">
                      <div className="arrangement-details-grid">
                        <div className="detail-item">
                          <span className="detail-icon">📅</span>
                          <div className="detail-content">
                            <span className="detail-label">Date</span>
                            <span className="detail-value">{arrangement.scheduledDate}</span>
                          </div>
                        </div>

                        {arrangement.scheduledTime && (
                          <div className="detail-item">
                            <span className="detail-icon">🕐</span>
                            <div className="detail-content">
                              <span className="detail-label">Time</span>
                              <span className="detail-value">{arrangement.scheduledTime}</span>
                            </div>
                          </div>
                        )}

                        {arrangement.amount && (
                          <div className="detail-item">
                            <span className="detail-icon">💰</span>
                            <div className="detail-content">
                              <span className="detail-label">Amount</span>
                              <span className="detail-value amount-value">£{arrangement.amount}</span>
                            </div>
                          </div>
                        )}

                        {arrangement.phoneNumber && (
                          <div className="detail-item">
                            <span className="detail-icon">📞</span>
                            <div className="detail-content">
                              <span className="detail-label">Phone</span>
                              <a href={`tel:${arrangement.phoneNumber}`} className="detail-value phone-link">
                                {arrangement.phoneNumber}
                              </a>
                            </div>
                          </div>
                        )}

                        {arrangement.notes && (
                          <div className="detail-item detail-notes">
                            <span className="detail-icon">📝</span>
                            <div className="detail-content">
                              <span className="detail-label">Notes</span>
                              <span className="detail-value">{arrangement.notes}</span>
                            </div>
                          </div>
                        )}

                        {arrangement.recurrenceType && arrangement.recurrenceType !== "none" && (
                          <div className="detail-item">
                            <span className="detail-icon">🔄</span>
                            <div className="detail-content">
                              <span className="detail-label">Recurrence</span>
                              <span className="detail-value">
                                {arrangement.recurrenceType === "weekly" ? "Weekly" :
                                 arrangement.recurrenceType === "biweekly" ? "Bi-weekly" :
                                 arrangement.recurrenceType === "monthly" ? "Monthly" : arrangement.recurrenceType}
                                {arrangement.recurrenceInterval && arrangement.recurrenceInterval > 1 && arrangement.recurrenceType !== "biweekly" && ` (every ${arrangement.recurrenceInterval})`}
                                <div className="recurrence-progress">
                                  Payment {(arrangement.paymentsMade || 0) + 1} of {arrangement.totalPayments || 1}
                                </div>
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="arrangement-actions">
                      {/* Show "Confirm Payment" only for non-recurring or final payments */}
                      {arrangement.status === "Scheduled" &&
                       (!arrangement.recurrenceType || arrangement.recurrenceType === "none" ||
                        (arrangement.paymentsMade && arrangement.totalPayments && arrangement.paymentsMade >= (arrangement.totalPayments - 1))) && (
                        <LoadingButton
                          className="btn btn-sm btn-success"
                          isLoading={loadingStates.markingPaid.has(arrangement.id)}
                          loadingText="Processing..."
                          onClick={async () => {
                            const actualAmount = window.prompt(
                              `Payment received:\n\nExpected: £${arrangement.amount || '0.00'}\nEnter actual amount received:`,
                              arrangement.amount || ''
                            );
                            if (actualAmount !== null && actualAmount.trim()) {
                              setLoadingStates(prev => ({
                                ...prev,
                                markingPaid: new Set([...prev.markingPaid, arrangement.id])
                              }));
                              try {
                                await markAsPaid(arrangement.id, actualAmount.trim());
                              } finally {
                                setLoadingStates(prev => ({
                                  ...prev,
                                  markingPaid: new Set([...prev.markingPaid].filter(id => id !== arrangement.id))
                                }));
                              }
                            }
                          }}
                        >
                          ✅ Confirm Payment
                        </LoadingButton>
                      )}

                      {(arrangement.status === "Scheduled" || arrangement.status === "Confirmed") && (
                        <>
                          {/* Send Reminder Button */}
                          {arrangement.phoneNumber && (
                            <div style={{ position: 'relative' }}>
                              <LoadingButton
                                className="btn btn-sm btn-primary"
                                isLoading={loadingStates.sendingReminder.has(arrangement.id)}
                                loadingText="Opening..."
                                onClick={() => sendReminderSMS(arrangement)}
                                title={`Send SMS reminder to ${arrangement.phoneNumber}`}
                              >
                                📱 Send SMS
                              </LoadingButton>

                              {/* Confirmation message */}
                              {reminderSent.has(arrangement.id) && (
                                <div
                                  className="reminder-confirmation"
                                  style={{
                                    position: 'absolute',
                                    top: '-35px',
                                    left: '0',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    whiteSpace: 'nowrap',
                                    zIndex: 1000,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                  }}
                                >
                                  ✅ SMS opened!
                                </div>
                              )}

                              {/* Show reminder history */}
                              {arrangement.reminderCount && arrangement.reminderCount > 0 && (
                                <div className="reminder-history">
                                  {arrangement.reminderCount} SMS reminder{arrangement.reminderCount > 1 ? 's' : ''} sent
                                  {arrangement.lastReminderSent && (
                                    <span>
                                      {' • Last: '}
                                      {format(parseISO(arrangement.lastReminderSent), 'MMM d, HH:mm')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Show "Continue Plan" only for recurring payments that are not the final payment */}
                          {arrangement.recurrenceType && arrangement.recurrenceType !== "none" &&
                           (!arrangement.paymentsMade || !arrangement.totalPayments || arrangement.paymentsMade < (arrangement.totalPayments - 1)) && (
                            <LoadingButton
                              className="btn btn-sm btn-success"
                              isLoading={loadingStates.markingPaid.has(arrangement.id)}
                              loadingText="Processing..."
                              onClick={async () => {
                                const actualAmount = window.prompt(
                                  `Continue with payment plan:\n\nExpected: £${arrangement.amount || '0.00'}\nEnter actual amount received:`,
                                  arrangement.amount || ''
                                );
                                if (actualAmount !== null && actualAmount.trim()) {
                                  setLoadingStates(prev => ({
                                    ...prev,
                                    markingPaid: new Set([...prev.markingPaid, arrangement.id])
                                  }));
                                  try {
                                    await markAsPaid(arrangement.id, actualAmount.trim());
                                  } finally {
                                    setLoadingStates(prev => ({
                                      ...prev,
                                      markingPaid: new Set([...prev.markingPaid].filter(id => id !== arrangement.id))
                                    }));
                                  }
                                }
                              }}
                            >
                              ✅ Continue Plan
                            </LoadingButton>
                          )}

                          <LoadingButton
                            className="btn btn-sm btn-warning"
                            isLoading={loadingStates.markingDefaulted.has(arrangement.id)}
                            loadingText="Processing..."
                            onClick={async () => {
                              if (confirm("Mark this arrangement as defaulted? This will complete the case as 'Done (Defaulted Arrangement)'.")) {
                                setLoadingStates(prev => ({
                                  ...prev,
                                  markingDefaulted: new Set([...prev.markingDefaulted, arrangement.id])
                                }));
                                try {
                                  await markAsDefaulted(arrangement.id);
                                } finally {
                                  setLoadingStates(prev => ({
                                    ...prev,
                                    markingDefaulted: new Set([...prev.markingDefaulted].filter(id => id !== arrangement.id))
                                  }));
                                }
                              }
                            }}
                          >
                            ❌ Defaulted
                          </LoadingButton>
                        </>
                      )}

                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setEditingId(arrangement.id)}
                        disabled={loadingStates.updating || loadingStates.saving}
                      >
                        ✏️ Edit
                      </button>

                      <LoadingButton
                        className="btn btn-sm btn-danger"
                        isLoading={loadingStates.deleting.has(arrangement.id)}
                        loadingText="Deleting..."
                        onClick={async () => {
                          if (confirm("Are you sure you want to delete this arrangement?")) {
                            setLoadingStates(prev => ({
                              ...prev,
                              deleting: new Set([...prev.deleting, arrangement.id])
                            }));
                            try {
                              await onDeleteArrangement(arrangement.id);
                            } finally {
                              setLoadingStates(prev => ({
                                ...prev,
                                deleting: new Set([...prev.deleting].filter(id => id !== arrangement.id))
                              }));
                            }
                          }
                        }}
                      >
                        🗑️ Delete
                      </LoadingButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        </div>

      <style>{`
        .arrangement-card-modern {
          background: linear-gradient(135deg, white 0%, var(--gray-50) 100%);
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          margin-bottom: 1rem;
          box-shadow: var(--shadow-sm);
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .arrangement-card-modern:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          border-color: var(--primary-light);
        }

        .arrangement-card-modern::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--primary) 0%, var(--success) 100%);
        }

        .arrangement-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.25rem;
          gap: 1rem;
        }

        .arrangement-primary-info {
          flex: 1;
        }

        .arrangement-address-modern {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .address-index {
          background: var(--primary);
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          min-width: 2rem;
          text-align: center;
        }

        .address-text {
          font-weight: 600;
          font-size: 1.1rem;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .arrangement-customer-modern {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .customer-icon {
          font-size: 1rem;
        }

        .customer-name {
          font-weight: 500;
        }

        .arrangement-status-modern {
          flex-shrink: 0;
        }

        .status-badge-modern {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-full);
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s ease;
        }

        .status-badge-modern.status-scheduled {
          background: linear-gradient(135deg, var(--blue-50) 0%, var(--blue-25) 100%);
          color: var(--blue-700);
          border: 1px solid var(--blue-200);
        }

        .status-badge-modern.status-confirmed {
          background: linear-gradient(135deg, var(--success-light) 0%, var(--success-lighter) 100%);
          color: var(--success-dark);
          border: 1px solid var(--success-border);
        }

        .status-badge-modern.status-completed {
          background: linear-gradient(135deg, var(--green-50) 0%, var(--green-25) 100%);
          color: var(--green-700);
          border: 1px solid var(--green-200);
        }

        .status-badge-modern.status-cancelled {
          background: linear-gradient(135deg, var(--gray-50) 0%, var(--gray-25) 100%);
          color: var(--gray-700);
          border: 1px solid var(--gray-200);
        }

        .status-badge-modern.status-missed {
          background: linear-gradient(135deg, var(--danger-light) 0%, var(--danger-lighter) 100%);
          color: var(--danger-dark);
          border: 1px solid var(--danger-border);
        }

        .status-icon {
          font-size: 0.875rem;
        }

        .arrangement-card-body {
          margin-bottom: 1.25rem;
        }

        .arrangement-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .detail-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--gray-25);
          border-radius: var(--radius-md);
          transition: all 0.2s ease;
        }

        .detail-item:hover {
          background: var(--gray-50);
        }

        .detail-notes {
          grid-column: 1 / -1;
        }

        /* Dark mode styles for arrangements */
        .dark-mode .arrangement-card-modern {
          background: linear-gradient(135deg, var(--gray-100) 0%, var(--gray-200) 100%);
          border-color: var(--gray-300);
        }

        .dark-mode .arrangement-card-modern:hover {
          border-color: var(--primary);
          background: linear-gradient(135deg, var(--gray-200) 0%, var(--gray-300) 100%);
        }

        .dark-mode .address-text {
          color: var(--gray-800);
        }

        .dark-mode .customer-name {
          color: var(--gray-600);
        }

        .dark-mode .detail-item {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        .dark-mode .detail-item:hover {
          background: var(--gray-300);
        }

        .dark-mode .detail-label {
          color: var(--gray-500);
        }

        .dark-mode .detail-value {
          color: var(--gray-800);
        }

        .dark-mode .phone-link {
          color: var(--primary) !important;
        }

        .dark-mode .recurrence-progress {
          color: var(--gray-500);
        }

        .dark-mode .reminder-confirmation {
          background: var(--gray-200) !important;
          color: var(--gray-800) !important;
        }

        .dark-mode .reminder-history {
          color: var(--gray-600) !important;
        }

        /* Basic card and form styles */
        .card {
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }

        .card-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--gray-200);
          background: var(--gray-50);
        }

        .card-body {
          padding: 1.5rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group-full {
          grid-column: 1 / -1;
        }

        .form-group label {
          font-weight: 600;
          color: var(--gray-700);
          font-size: 0.875rem;
        }

        .btn-row {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .btn-row-end {
          justify-content: flex-end;
        }

        .arrangements-wrap {
          max-width: none;
          width: 100%;
        }

        .top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.75rem 1rem;
          background: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--gray-200);
          min-width: 80px;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--gray-600);
          margin-bottom: 0.25rem;
          font-weight: 500;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--gray-800);
        }

        .stat-actions {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .days-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .day-card {
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--gray-200);
          overflow: hidden;
        }

        .day-header {
          padding: 1.5rem;
          background: var(--gray-50);
          border-bottom: 1px solid var(--gray-200);
        }

        .day-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--gray-800);
          margin-bottom: 0.25rem;
        }

        .muted {
          font-size: 0.875rem;
          color: var(--gray-500);
        }

        .arrangements-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.5rem;
        }

        .empty-box {
          padding: 3rem;
          text-align: center;
          background: white;
          border-radius: var(--radius-lg);
          border: 2px dashed var(--gray-300);
          color: var(--gray-500);
        }

        .fade-in-up {
          animation: fadeInUp 0.3s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Dark mode for basic elements */
        .dark-mode .card {
          background: var(--gray-100);
          border-color: var(--gray-200);
        }

        .dark-mode .card-header {
          background: var(--gray-200);
          border-bottom-color: var(--gray-300);
        }

        .dark-mode .form-group label {
          color: var(--gray-700);
        }

        .dark-mode .stat-item {
          background: var(--gray-100);
          border-color: var(--gray-300);
        }

        .dark-mode .stat-label {
          color: var(--gray-500);
        }

        .dark-mode .stat-value {
          color: var(--gray-800);
        }

        .dark-mode .day-card {
          background: var(--gray-100);
          border-color: var(--gray-200);
        }

        .dark-mode .day-header {
          background: var(--gray-200);
          border-bottom-color: var(--gray-300);
        }

        .dark-mode .day-title {
          color: var(--gray-800);
        }

        .dark-mode .muted {
          color: var(--gray-500);
        }

        .dark-mode .empty-box {
          background: var(--gray-100);
          border-color: var(--gray-400);
          color: var(--gray-500);
        }

        /* Dark mode button styles */
        .dark-mode .btn-warning {
          background: var(--warning);
          color: white;
          border-color: var(--warning);
        }

        .dark-mode .btn-warning:hover {
          background: var(--warning-dark);
          border-color: var(--warning-dark);
        }

        .dark-mode .btn-danger {
          background: var(--danger);
          color: white;
          border-color: var(--danger);
        }

        .dark-mode .btn-danger:hover {
          background: var(--danger-dark);
          border-color: var(--danger-dark);
        }

        /* Dark mode arrangement actions */
        .dark-mode .arrangement-actions .btn {
          background: var(--gray-200);
          color: var(--gray-700);
          border-color: var(--gray-300);
        }

        .dark-mode .arrangement-actions .btn:hover {
          background: var(--gray-300);
          color: var(--gray-800);
        }

        .dark-mode .arrangement-actions .btn-success {
          background: var(--success);
          color: white;
          border-color: var(--success);
        }

        .dark-mode .arrangement-actions .btn-success:hover {
          background: var(--success-dark);
          border-color: var(--success-dark);
        }

        .dark-mode .arrangement-actions .btn-primary {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .dark-mode .arrangement-actions .btn-primary:hover {
          background: var(--primary-hover);
          border-color: var(--primary-hover);
        }

        .dark-mode .arrangement-actions .btn-warning {
          background: var(--warning);
          color: white;
          border-color: var(--warning);
        }

        .dark-mode .arrangement-actions .btn-warning:hover {
          background: var(--warning-dark);
          border-color: var(--warning-dark);
        }

        .dark-mode .arrangement-actions .btn-danger {
          background: var(--danger);
          color: white;
          border-color: var(--danger);
        }

        .dark-mode .arrangement-actions .btn-danger:hover {
          background: var(--danger-dark);
          border-color: var(--danger-dark);
        }

        .dark-mode .arrangement-actions .btn-ghost {
          background: transparent;
          color: var(--gray-600);
          border-color: var(--gray-400);
        }

        .dark-mode .arrangement-actions .btn-ghost:hover {
          background: var(--gray-200);
          color: var(--gray-800);
        }

        .detail-icon {
          font-size: 1.1rem;
          flex-shrink: 0;
          margin-top: 0.125rem;
        }

        .detail-content {
          flex: 1;
          min-width: 0;
        }

        .detail-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }

        .detail-value {
          display: block;
          font-size: 0.9rem;
          color: var(--text-primary);
          font-weight: 500;
          word-break: break-word;
        }

        .amount-value {
          color: var(--success-dark);
          font-weight: 700;
          font-size: 1rem;
        }

        .phone-link {
          color: var(--primary) !important;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .phone-link:hover {
          color: var(--primary-dark) !important;
          text-decoration: underline;
        }

        .recurrence-progress {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
          font-weight: 400;
        }

        .arrangement-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--gray-200);
        }

        .dark-mode .arrangement-actions {
          border-top-color: var(--gray-300);
        }

        @media (max-width: 768px) {
          .arrangement-card-header {
            flex-direction: column;
            align-items: stretch;
          }

          .arrangement-details-grid {
            grid-template-columns: 1fr;
          }

          .detail-notes {
            grid-column: 1;
          }
        }
      `}</style>
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export const Arrangements = React.memo(ArrangementsComponent);