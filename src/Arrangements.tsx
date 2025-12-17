import * as React from "react";
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek, isSameDay, isPast, addDays } from "date-fns";
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome, PaymentInstalment } from "./types";
import { LoadingButton } from "./components/LoadingButton";
import { generateReminderMessage } from "./services/reminderScheduler";
import UnifiedArrangementForm from "./components/UnifiedArrangementForm";
import { QuickPaymentModal } from "./components/QuickPaymentModal";
import { logger } from './utils/logger';

type Props = {
  state: AppState;
  onAddArrangement: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  onUpdateArrangement: (id: string, updates: Partial<Arrangement>) => void;
  onDeleteArrangement: (id: string) => void;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string) => void;
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
  const [quickPaymentArrangementId, setQuickPaymentArrangementId] = React.useState<string | null>(null);
  const [loadingStates, setLoadingStates] = React.useState<{
    saving: boolean;
    deleting: Set<string>;
    continuing: Set<string>;
    paidInFull: Set<string>;
    markingDefaulted: Set<string>;
    sendingReminder: Set<string>;
  }>({
    saving: false,
    deleting: new Set(),
    continuing: new Set(),
    paidInFull: new Set(),
    markingDefaulted: new Set(),
    sendingReminder: new Set()
  });

  const [reminderSent, setReminderSent] = React.useState<Set<string>>(new Set());

  const formatPhoneForSMS = (phone: string): string => {
    if (!phone) return "";
    let cleaned = phone.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("0") || cleaned.startsWith("+44") || cleaned.startsWith("44")) {
      return cleaned;
    }
    if (cleaned.length === 10 && cleaned.startsWith("7")) {
      return "0" + cleaned;
    }
    return cleaned;
  };

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
      const smsUrl = `sms:${formattedPhone}?body=${encodeURIComponent(message)}`;
      window.location.href = smsUrl;

      const now = new Date().toISOString();
      await onUpdateArrangement(arrangement.id, {
        lastReminderSent: now,
        reminderCount: (arrangement.reminderCount || 0) + 1,
        updatedAt: now
      });

      setReminderSent(prev => new Set([...prev, arrangement.id]));
      setTimeout(() => {
        setReminderSent(prev => {
          const next = new Set(prev);
          next.delete(arrangement.id);
          return next;
        });
      }, 3000);

    } catch (error) {
      logger.error("Failed to send reminder:", error);
      alert("Failed to update reminder information.");
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        sendingReminder: new Set([...prev.sendingReminder].filter(id => id !== arrangement.id))
      }));
    }
  };

  React.useEffect(() => {
    if (autoCreateForAddress !== null && autoCreateForAddress !== undefined) {
      setShowAddForm(true);
      onAutoCreateHandled?.();
    }
  }, [autoCreateForAddress, onAutoCreateHandled]);

  const filteredArrangements = React.useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    let filtered = state.arrangements;

    if (viewMode === "thisWeek") {
      filtered = state.arrangements.filter(arr => {
        const arrDate = parseISO(arr.scheduledDate);
        return isWithinInterval(arrDate, { start: weekStart, end: weekEnd }) &&
               arr.status !== "Completed" && arr.status !== "Cancelled";
      });
    } else {
      filtered = state.arrangements.filter(arr =>
        arr.status !== "Completed" && arr.status !== "Cancelled"
      );
    }

    return filtered.sort((a, b) => {
      const dateA = parseISO(a.scheduledDate).getTime();
      const dateB = parseISO(b.scheduledDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return (a.scheduledTime || "00:00").localeCompare(b.scheduledTime || "00:00");
    });
  }, [state.arrangements, viewMode]);

  const groupedArrangements = React.useMemo(() => {
    const groups = new Map<string, Arrangement[]>();
    filteredArrangements.forEach(arr => {
      const dateKey = arr.scheduledDate;
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredArrangements]);

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

  // Instalment helpers
  const getCurrentInstalment = (arr: Arrangement): PaymentInstalment | null => {
    if (!arr.paymentInstalments?.length) return null;
    return arr.paymentInstalments[arr.currentInstalmentIndex ?? 0] ?? null;
  };

  const getNextInstalment = (arr: Arrangement): PaymentInstalment | null => {
    if (!arr.paymentInstalments?.length) return null;
    const nextIdx = (arr.currentInstalmentIndex ?? 0) + 1;
    return nextIdx < arr.paymentInstalments.length ? arr.paymentInstalments[nextIdx] : null;
  };

  const isLastInstalment = (arr: Arrangement): boolean => {
    if (!arr.paymentInstalments?.length) return true;
    return (arr.currentInstalmentIndex ?? 0) >= arr.paymentInstalments.length - 1;
  };

  const getTotalInstalments = (arr: Arrangement): number => {
    return arr.paymentInstalments?.length ?? arr.totalPayments ?? 1;
  };

  const getPaidInstalments = (arr: Arrangement): number => {
    if (arr.paymentInstalments?.length) {
      return arr.paymentInstalments.filter(i => i.status === 'paid').length;
    }
    return arr.paymentsMade ?? 0;
  };

  // CONTINUE: Mark current instalment paid, advance to next
  const handleContinue = async (arrangement: Arrangement) => {
    setLoadingStates(prev => ({
      ...prev,
      continuing: new Set([...prev.continuing, arrangement.id])
    }));

    try {
      const currentIdx = arrangement.currentInstalmentIndex ?? 0;
      const currentInstalment = getCurrentInstalment(arrangement);
      const amount = currentInstalment?.amount?.toFixed(2) ?? arrangement.amount ?? "0";

      // Record ARR payment
      onComplete(arrangement.addressIndex, "ARR", amount, arrangement.id, arrangement.caseReference);

      // Update instalments
      let updatedInstalments = arrangement.paymentInstalments;
      if (updatedInstalments?.length) {
        updatedInstalments = [...updatedInstalments];
        updatedInstalments[currentIdx] = {
          ...updatedInstalments[currentIdx],
          status: 'paid',
          paidDate: new Date().toISOString().slice(0, 10),
          paidAmount: parseFloat(amount)
        };
      }

      const nextInstalment = getNextInstalment(arrangement);

      if (nextInstalment) {
        // Advance to next instalment
        await onUpdateArrangement(arrangement.id, {
          currentInstalmentIndex: currentIdx + 1,
          scheduledDate: nextInstalment.scheduledDate,
          amount: nextInstalment.amount.toFixed(2),
          paymentInstalments: updatedInstalments,
          paymentsMade: (arrangement.paymentsMade ?? 0) + 1,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Last payment - mark arrangement complete
        await onUpdateArrangement(arrangement.id, {
          status: "Completed",
          paymentInstalments: updatedInstalments,
          paymentsMade: (arrangement.paymentsMade ?? 0) + 1,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Error continuing arrangement:', error);
      alert('Failed to record payment. Please try again.');
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        continuing: new Set([...prev.continuing].filter(id => id !== arrangement.id))
      }));
    }
  };

  // PAID IN FULL: Mark entire arrangement as paid
  const handlePaidInFull = async (arrangement: Arrangement) => {
    setLoadingStates(prev => ({
      ...prev,
      paidInFull: new Set([...prev.paidInFull, arrangement.id])
    }));

    try {
      // Calculate remaining amount
      const totalOwed = arrangement.totalAmountOwed ?? parseFloat(arrangement.amount ?? "0");
      const paidSoFar = arrangement.paymentInstalments
        ?.filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + (i.paidAmount ?? i.amount), 0) ?? 0;
      const remainingAmount = Math.max(0, totalOwed - paidSoFar);

      // Record PIF completion
      onComplete(
        arrangement.addressIndex,
        "PIF",
        remainingAmount.toFixed(2),
        arrangement.id,
        arrangement.caseReference
      );

      // Mark all remaining instalments as paid
      let updatedInstalments = arrangement.paymentInstalments;
      if (updatedInstalments?.length) {
        updatedInstalments = updatedInstalments.map(inst =>
          inst.status === 'pending'
            ? { ...inst, status: 'paid' as const, paidDate: new Date().toISOString().slice(0, 10) }
            : inst
        );
      }

      // Complete the arrangement
      await onUpdateArrangement(arrangement.id, {
        status: "Completed",
        paymentInstalments: updatedInstalments,
        paymentsMade: getTotalInstalments(arrangement),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error marking paid in full:', error);
      alert('Failed to complete arrangement. Please try again.');
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        paidInFull: new Set([...prev.paidInFull].filter(id => id !== arrangement.id))
      }));
    }
  };

  // DEFAULTED: Customer didn't pay
  const handleDefaulted = async (arrangement: Arrangement) => {
    setLoadingStates(prev => ({
      ...prev,
      markingDefaulted: new Set([...prev.markingDefaulted, arrangement.id])
    }));

    try {
      onComplete(arrangement.addressIndex, "Done", undefined, arrangement.id, arrangement.caseReference);
      await onUpdateArrangement(arrangement.id, {
        status: "Completed",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error marking defaulted:', error);
      alert('Failed to mark as defaulted.');
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        markingDefaulted: new Set([...prev.markingDefaulted].filter(id => id !== arrangement.id))
      }));
    }
  };

  // Handle arrangement save
  const handleArrangementSave = async (arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => {
    setLoadingStates(prev => ({ ...prev, saving: true }));
    try {
      await onAddArrangement(arrangementData);
      setShowAddForm(false);
    } catch (error) {
      logger.error('Error saving arrangement:', error);
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, saving: false }));
    }
  };

  // Quick payment handler
  const handleQuickPayment = async (amount: string) => {
    if (!quickPaymentArrangementId) return;
    const arrangement = state.arrangements.find(a => a.id === quickPaymentArrangementId);
    if (!arrangement) return;

    try {
      onComplete(arrangement.addressIndex, "ARR", amount, arrangement.id, arrangement.caseReference);
      setQuickPaymentArrangementId(null);
    } catch (error) {
      logger.error('Error recording payment:', error);
      alert('Failed to record payment.');
    }
  };

  return (
    <div className="arrangements-wrap">
      {/* Header */}
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
            <div className="stat-label">💰 Total</div>
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
              📋 All
            </button>
            <button className="btn btn-success" onClick={() => setShowAddForm(true)}>
              ➕ New
            </button>
          </div>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <UnifiedArrangementForm
          state={state}
          preSelectedAddressIndex={autoCreateForAddress}
          onAddAddress={onAddAddress}
          onSave={handleArrangementSave}
          onCancel={() => setShowAddForm(false)}
          isLoading={loadingStates.saving}
          onComplete={onComplete}
          fullscreen={true}
        />
      )}

      {/* Quick Payment Modal */}
      {quickPaymentArrangementId && (
        <QuickPaymentModal
          arrangement={state.arrangements.find(a => a.id === quickPaymentArrangementId)!}
          onConfirm={handleQuickPayment}
          onCancel={() => setQuickPaymentArrangementId(null)}
          isLoading={false}
        />
      )}

      {/* Arrangements List */}
      <div className="days-list">
        {groupedArrangements.length === 0 ? (
          <div className="empty-box">
            <div style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              📅 No arrangements {viewMode === "thisWeek" ? "this week" : "pending"}
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
              Click "New" to create a payment arrangement
            </div>
          </div>
        ) : (
          groupedArrangements.map(([dateStr, arrangements]) => (
            <div className="day-card fade-in-up" key={dateStr}>
              <div className="day-header">
                <div className="day-title">{formatDateHeader(dateStr)}</div>
                <div className="muted">
                  {arrangements.length} payment{arrangements.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="arrangements-list">
                {arrangements.map(arrangement => {
                  const currentInst = getCurrentInstalment(arrangement);
                  const totalInst = getTotalInstalments(arrangement);
                  const paidInst = getPaidInstalments(arrangement);
                  const isLast = isLastInstalment(arrangement);
                  const hasInstalments = totalInst > 1;

                  return (
                    <div className="arrangement-card-modern" key={arrangement.id}>
                      {/* Header */}
                      <div className="arrangement-card-header">
                        <div className="arrangement-primary-info">
                          <div className="arrangement-address-modern">
                            <span className="address-index">#{arrangement.addressIndex + 1}</span>
                            <span className="address-text">{arrangement.address}</span>
                          </div>
                          {arrangement.caseReference && (
                            <div className="case-reference">
                              <span className="case-icon">📋</span>
                              <span>{arrangement.caseReference}</span>
                            </div>
                          )}
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

                      {/* Payment Progress (for instalment plans) */}
                      {hasInstalments && (
                        <div className="payment-progress-bar">
                          <div className="progress-info">
                            <span>Payment {paidInst + 1} of {totalInst}</span>
                            <span className="progress-amount">
                              £{currentInst?.amount?.toFixed(2) ?? arrangement.amount}
                            </span>
                          </div>
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{ width: `${(paidInst / totalInst) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Details Grid */}
                      <div className="arrangement-card-body">
                        <div className="arrangement-details-grid">
                          <div className="detail-item">
                            <span className="detail-icon">📅</span>
                            <div className="detail-content">
                              <span className="detail-label">Due Date</span>
                              <span className="detail-value">{format(parseISO(arrangement.scheduledDate), 'MMM d, yyyy')}</span>
                            </div>
                          </div>

                          <div className="detail-item">
                            <span className="detail-icon">💰</span>
                            <div className="detail-content">
                              <span className="detail-label">{hasInstalments ? 'This Payment' : 'Amount'}</span>
                              <span className="detail-value amount-value">
                                £{currentInst?.amount?.toFixed(2) ?? arrangement.amount}
                              </span>
                            </div>
                          </div>

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
                        </div>
                      </div>

                      {/* Action Buttons - NEW LAYOUT */}
                      <div className="arrangement-actions">
                        {/* PRIMARY: Continue or Paid in Full */}
                        {(arrangement.status === "Scheduled" || arrangement.status === "Confirmed") && (
                          <>
                            {!isLast ? (
                              <LoadingButton
                                className="btn btn-sm btn-continue"
                                isLoading={loadingStates.continuing.has(arrangement.id)}
                                loadingText="Processing..."
                                onClick={() => handleContinue(arrangement)}
                                title="Mark current instalment as paid and advance to next"
                              >
                                <span className="btn-icon">✅</span>
                                <span className="btn-text">Continue</span>
                              </LoadingButton>
                            ) : null}

                            <LoadingButton
                              className="btn btn-sm btn-paid-full"
                              isLoading={loadingStates.paidInFull.has(arrangement.id)}
                              loadingText="Processing..."
                              onClick={() => handlePaidInFull(arrangement)}
                              title="Mark entire arrangement as paid in full"
                            >
                              <span className="btn-icon">💰</span>
                              <span className="btn-text">Paid in Full</span>
                            </LoadingButton>
                          </>
                        )}

                        {/* SECONDARY: SMS */}
                        {(arrangement.status === "Scheduled" || arrangement.status === "Confirmed") && arrangement.phoneNumber && (
                          <div className="btn-with-feedback">
                            <LoadingButton
                              className="btn btn-sm btn-secondary"
                              isLoading={loadingStates.sendingReminder.has(arrangement.id)}
                              loadingText="Opening..."
                              onClick={() => sendReminderSMS(arrangement)}
                              title={`Send SMS to ${arrangement.phoneNumber}`}
                            >
                              <span className="btn-icon">📱</span>
                              <span className="btn-text">Send SMS</span>
                            </LoadingButton>
                            {reminderSent.has(arrangement.id) && (
                              <div className="reminder-confirmation">✅ SMS opened!</div>
                            )}
                          </div>
                        )}

                        {/* DANGER: Defaulted & Delete */}
                        {(arrangement.status === "Scheduled" || arrangement.status === "Confirmed") && (
                          <LoadingButton
                            className="btn btn-sm btn-warning"
                            isLoading={loadingStates.markingDefaulted.has(arrangement.id)}
                            loadingText="Processing..."
                            onClick={() => {
                              if (confirm("Mark as defaulted? This completes the case as 'Done'.")) {
                                handleDefaulted(arrangement);
                              }
                            }}
                          >
                            <span className="btn-icon">❌</span>
                            <span className="btn-text">Defaulted</span>
                          </LoadingButton>
                        )}

                        <LoadingButton
                          className="btn btn-sm btn-danger"
                          isLoading={loadingStates.deleting.has(arrangement.id)}
                          loadingText="Deleting..."
                          onClick={async () => {
                            if (confirm("Delete this arrangement?")) {
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
                          <span className="btn-icon">🗑️</span>
                          <span className="btn-text">Delete</span>
                        </LoadingButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        /* Payment Progress Bar */
        .payment-progress-bar {
          margin: 0.75rem 0;
          padding: 0.75rem 1rem;
          background: var(--gray-50, #f9fafb);
          border-radius: 8px;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
          color: var(--text-secondary);
        }

        .progress-amount {
          font-weight: 700;
          color: var(--success);
        }

        .progress-track {
          height: 6px;
          background: var(--gray-200);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--success) 0%, #059669 100%);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        /* Case Reference */
        .case-reference {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.8rem;
          color: var(--primary);
          font-weight: 600;
          margin-top: 0.25rem;
        }

        .case-icon {
          font-size: 0.75rem;
        }

        /* Continue Button */
        .btn-continue {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border: none;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .btn-continue:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        /* Paid in Full Button */
        .btn-paid-full {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .btn-paid-full:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        /* Dark mode adjustments */
        .dark-mode .payment-progress-bar {
          background: var(--gray-200);
        }

        .dark-mode .progress-track {
          background: var(--gray-300);
        }

        .dark-mode .case-reference {
          color: var(--primary-light);
        }

        /* Existing styles... */
        .arrangement-card-modern {
          background: linear-gradient(135deg, white 0%, var(--gray-50) 100%);
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          margin-bottom: 0.75rem;
          box-shadow: var(--shadow-sm);
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .arrangement-card-modern:hover {
          transform: translateY(-1px);
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
          margin-bottom: 0.75rem;
          gap: 0.75rem;
        }

        .arrangement-primary-info { flex: 1; }

        .arrangement-address-modern {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .address-index {
          background: var(--primary);
          color: white;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.2rem 0.4rem;
          border-radius: var(--radius-sm);
        }

        .address-text {
          font-weight: 600;
          font-size: 1rem;
          color: var(--text-primary);
        }

        .arrangement-customer-modern {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        .status-badge-modern {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-badge-modern.status-scheduled {
          background: rgba(59, 130, 246, 0.1);
          color: var(--blue-700);
        }

        .arrangement-card-body { margin-bottom: 0.75rem; }

        .arrangement-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem;
        }

        .detail-item {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--gray-25);
          border-radius: var(--radius-md);
        }

        .detail-notes { grid-column: 1 / -1; }

        .detail-icon { font-size: 1rem; }

        .detail-content { flex: 1; min-width: 0; }

        .detail-label {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          margin-bottom: 0.125rem;
        }

        .detail-value {
          font-size: 0.85rem;
          color: var(--text-primary);
          font-weight: 500;
        }

        .amount-value {
          color: var(--success-dark);
          font-weight: 700;
        }

        .phone-link {
          color: var(--primary) !important;
          text-decoration: none;
        }

        .arrangement-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          padding-top: 0.75rem;
          border-top: 1px solid var(--gray-200);
        }

        .arrangement-actions .btn {
          min-height: 40px;
          padding: 0.5rem 0.875rem;
          font-size: 0.8rem;
          font-weight: 600;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
        }

        .btn-icon { font-size: 0.9rem; }

        .btn-with-feedback {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .reminder-confirmation {
          position: absolute;
          top: -28px;
          left: 0;
          padding: 0.25rem 0.5rem;
          background: var(--success);
          color: white;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
        }

        /* Layout containers */
        .arrangements-wrap { width: 100%; }

        .top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.5rem 0.75rem;
          background: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--gray-200);
        }

        .stat-label {
          font-size: 0.7rem;
          color: var(--gray-600);
          font-weight: 500;
        }

        .stat-value {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--gray-800);
        }

        .days-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .day-card {
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--gray-200);
          overflow: hidden;
        }

        .day-header {
          padding: 1rem;
          background: var(--gray-50);
          border-bottom: 1px solid var(--gray-200);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .day-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--gray-800);
        }

        .muted {
          font-size: 0.8rem;
          color: var(--gray-500);
        }

        .arrangements-list {
          padding: 1rem;
        }

        .empty-box {
          padding: 2.5rem;
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
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Dark mode */
        .dark-mode .arrangement-card-modern {
          background: linear-gradient(135deg, var(--gray-100) 0%, var(--gray-200) 100%);
          border-color: var(--gray-300);
        }

        .dark-mode .address-text { color: var(--gray-800); }
        .dark-mode .detail-item { background: var(--gray-200); }
        .dark-mode .detail-value { color: var(--gray-800); }
        .dark-mode .arrangement-actions { border-top-color: var(--gray-300); }
        .dark-mode .stat-item { background: var(--gray-100); border-color: var(--gray-300); }
        .dark-mode .stat-value { color: var(--gray-800); }
        .dark-mode .day-card { background: var(--gray-100); border-color: var(--gray-200); }
        .dark-mode .day-header { background: var(--gray-200); border-bottom-color: var(--gray-300); }
        .dark-mode .day-title { color: var(--gray-800); }
        .dark-mode .empty-box { background: var(--gray-100); border-color: var(--gray-400); }

        @media (max-width: 768px) {
          .arrangement-card-header { flex-direction: column; }
          .arrangement-details-grid { grid-template-columns: 1fr; }
          .arrangement-actions { flex-direction: column; }
          .arrangement-actions .btn { width: 100%; justify-content: center; }
          .btn-with-feedback { width: 100%; }
          .btn-with-feedback .btn { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export const Arrangements = React.memo(ArrangementsComponent);
