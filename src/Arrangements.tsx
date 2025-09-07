import * as React from "react";
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek, isSameDay, isPast, addDays } from "date-fns";
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome } from "./types";
import { LoadingButton } from "./components/LoadingButton";

type Props = {
  state: AppState;
  onAddArrangement: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateArrangement: (id: string, updates: Partial<Arrangement>) => void;
  onDeleteArrangement: (id: string) => void;
  onAddAddress?: (address: AddressRow) => Promise<number>; // Returns the new address index
  onComplete: (index: number, outcome: Outcome, amount?: string) => void; // ✅ mark as completed (ARR)
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
  }>({
    saving: false,
    updating: false,
    deleting: new Set(),
    markingPaid: new Set()
  });

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
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday

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

  const getStatusColor = (status: ArrangementStatus): string => {
    switch (status) {
      case "Confirmed": return "var(--success)";
      case "Completed": return "var(--primary)";
      case "Cancelled": return "var(--text-muted)";
      case "Missed": return "var(--danger)";
      default: return "var(--warning)";
    }
  };

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

  // Mark arrangement as paid/completed
  const markAsPaid = (id: string, amount: string) => {
    onUpdateArrangement(id, { 
      status: "Completed",
      amount: amount,
      updatedAt: new Date().toISOString()
    });
  };

  // Handle arrangement creation (also mark as ARR completion)
  const handleArrangementSave = async (arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => {
    setLoadingStates(prev => ({ ...prev, saving: true }));
    try {
      // Validate address index is still valid
      if (arrangementData.addressIndex < 0 || arrangementData.addressIndex >= state.addresses.length) {
        throw new Error('Selected address is no longer valid. Please refresh and try again.');
      }
      
      await onAddArrangement(arrangementData);
      // record completion (ARR) today for the chosen index
      onComplete(arrangementData.addressIndex, "ARR");
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
        <ArrangementForm 
          state={state}
          arrangement={editingId ? state.arrangements.find(a => a.id === editingId) : undefined}
          preSelectedAddressIndex={autoCreateForAddress}
          onAddAddress={onAddAddress}
          onSave={editingId ? handleArrangementUpdate.bind(null, editingId) : handleArrangementSave}
          onCancel={() => {
            setShowAddForm(false);
            setEditingId(null);
          }}
          isLoading={loadingStates.saving || loadingStates.updating}
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
                  <div className="arrangement-card" key={arrangement.id}>
                    <div className="arrangement-header">
                      <div className="arrangement-info">
                        <div className="arrangement-address">
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                            #{arrangement.addressIndex + 1}
                          </span>{" "}
                          {arrangement.address}
                        </div>
                        {arrangement.customerName && (
                          <div className="arrangement-customer">
                            👤 {arrangement.customerName}
                          </div>
                        )}
                        {arrangement.scheduledTime && (
                          <div className="arrangement-time">
                            🕐 {arrangement.scheduledTime}
                          </div>
                        )}
                        {arrangement.amount && (
                          <div className="arrangement-amount" style={{ fontSize: "1rem", fontWeight: 600, color: "var(--success)" }}>
                            💰 £{arrangement.amount}
                          </div>
                        )}
                        {arrangement.phoneNumber && (
                          <div className="arrangement-phone">
                            📞 <a href={`tel:${arrangement.phoneNumber}`} style={{ color: "inherit", textDecoration: "underline" }}>
                              {arrangement.phoneNumber}
                            </a>
                          </div>
                        )}
                        {arrangement.notes && (
                          <div className="arrangement-notes">
                            📝 {arrangement.notes}
                          </div>
                        )}
                      </div>
                      
                      <div className="arrangement-status">
                        <span 
                          className="pill"
                          style={{ 
                            backgroundColor: `${getStatusColor(arrangement.status)}15`,
                            borderColor: getStatusColor(arrangement.status),
                            color: getStatusColor(arrangement.status)
                          }}
                        >
                          {getStatusIcon(arrangement.status)} {arrangement.status}
                        </span>
                      </div>
                    </div>

                    <div className="arrangement-actions">
                      {arrangement.status === "Scheduled" && (
                        <LoadingButton
                          className="btn btn-sm btn-success"
                          isLoading={loadingStates.updating}
                          loadingText="Confirming..."
                          onClick={() => onUpdateArrangement(arrangement.id, { 
                            status: "Confirmed",
                            updatedAt: new Date().toISOString()
                          })}
                        >
                          ✅ Confirm
                        </LoadingButton>
                      )}
                      
                      {(arrangement.status === "Scheduled" || arrangement.status === "Confirmed") && (
                        <LoadingButton
                          className="btn btn-sm btn-primary"
                          isLoading={loadingStates.markingPaid.has(arrangement.id)}
                          loadingText="Processing..."
                          onClick={async () => {
                            const actualAmount = window.prompt(
                              `Mark as paid:\n\nExpected: £${arrangement.amount || '0.00'}\nEnter actual amount received:`,
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
                          💰 Mark Paid
                        </LoadingButton>
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
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export const Arrangements = React.memo(ArrangementsComponent);

// Arrangement Form Component
type FormProps = {
  state: AppState;
  arrangement?: Arrangement;
  preSelectedAddressIndex?: number | null;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  onSave: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
};

function ArrangementForm({ state, arrangement, preSelectedAddressIndex, onAddAddress, onSave, onCancel, isLoading = false }: FormProps) {
  const [addressMode, setAddressMode] = React.useState<"existing" | "manual">(
    preSelectedAddressIndex !== null && preSelectedAddressIndex !== undefined ? "existing" : "existing"
  );
  
  const [formData, setFormData] = React.useState({
    addressIndex: arrangement?.addressIndex ?? preSelectedAddressIndex ?? 0,
    manualAddress: "",
    customerName: arrangement?.customerName ?? "",
    phoneNumber: arrangement?.phoneNumber ?? "",
    scheduledDate: arrangement?.scheduledDate ?? new Date().toISOString().slice(0, 10),
    scheduledTime: arrangement?.scheduledTime ?? "",
    amount: arrangement?.amount ?? "",
    notes: arrangement?.notes ?? "",
    status: arrangement?.status ?? "Scheduled" as ArrangementStatus,
  });

  const selectedAddress = addressMode === "existing" ? state.addresses[formData.addressIndex] : null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const amount = parseFloat(formData.amount || '0');
    if (!formData.amount || isNaN(amount) || amount <= 0) {
      alert("Please enter a valid payment amount (numbers only, greater than 0)");
      return;
    }

    let finalAddressIndex = formData.addressIndex;
    let finalAddress = "";

    if (addressMode === "existing") {
      if (!selectedAddress) {
        alert("Please select a valid address");
        return;
      }
      finalAddress = selectedAddress.address;
    } else {
      // Manual address mode
      if (!formData.manualAddress.trim()) {
        alert("Please enter an address");
        return;
      }

      // Check if this address already exists in the list
      const existingIndex = state.addresses.findIndex(
        addr => (addr.address || "").toLowerCase().trim() === formData.manualAddress.toLowerCase().trim()
      );

      if (existingIndex >= 0) {
        finalAddressIndex = existingIndex;
        finalAddress = state.addresses[existingIndex].address;
      } else {
        if (!onAddAddress) {
          alert("Cannot add new addresses - missing onAddAddress handler");
          return;
        }

        try {
          const newAddressRow: AddressRow = {
            address: formData.manualAddress.trim(),
            lat: null,
            lng: null
          };
          
          finalAddressIndex = await onAddAddress(newAddressRow);
          finalAddress = newAddressRow.address;
        } catch (error) {
          console.error('Error adding address:', error);
          alert('Failed to add new address. Please try again.');
          return;
        }
      }
    }

    const arrangementData = {
      addressIndex: finalAddressIndex,
      address: finalAddress,
      customerName: formData.customerName,
      phoneNumber: formData.phoneNumber,
      scheduledDate: formData.scheduledDate,
      scheduledTime: formData.scheduledTime,
      amount: formData.amount,
      notes: formData.notes,
      status: formData.status,
    };

    await onSave(arrangementData);
  };

  return (
    <div className="card arrangement-form">
      <div className="card-header">
        <h3 style={{ margin: 0 }}>
          {arrangement ? "✏️ Edit Payment Arrangement" : "➕ Create Payment Arrangement"}
        </h3>
      </div>
      
      <div className="card-body">
        <form onSubmit={handleSubmit} className="form-grid">
          {/* Address Mode Toggle */}
          {!arrangement && (
            <div className="form-group form-group-full">
              <label>📍 Address Source</label>
              <div className="btn-group">
                <button
                  type="button"
                  className={`btn ${addressMode === "existing" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAddressMode("existing")}
                >
                  📋 From List
                </button>
                <button
                  type="button"
                  className={`btn ${addressMode === "manual" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAddressMode("manual")}
                >
                  ✏️ Enter Manually
                </button>
              </div>
            </div>
          )}

          {/* Address Selection */}
          {addressMode === "existing" ? (
            <div className="form-group form-group-full">
              <label>📍 Address *</label>
              {state.addresses.length === 0 ? (
                <div style={{ 
                  padding: "0.75rem", 
                  backgroundColor: "var(--warning-light)", 
                  border: "1px solid var(--warning)",
                  borderRadius: "var(--radius)",
                  color: "var(--warning)",
                  fontSize: "0.875rem"
                }}>
                  ⚠️ No addresses in your list. Switch to "Enter Manually" to add a new address.
                </div>
              ) : (
                <select 
                  value={formData.addressIndex}
                  onChange={(e) => setFormData(prev => ({ ...prev, addressIndex: parseInt(e.target.value) }))}
                  className="input"
                  required
                >
                  {state.addresses.map((addr, idx) => (
                    <option key={idx} value={idx}>
                      #{idx + 1} - {addr.address}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="form-group form-group-full">
              <label>📍 Address *</label>
              <input
                type="text"
                value={formData.manualAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, manualAddress: e.target.value }))}
                className="input"
                placeholder="Enter full address"
                required
              />
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                💡 If this address doesn't exist in your list, it will be automatically added.
              </div>
            </div>
          )}

          <div className="form-group">
            <label>💰 Payment Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              className="input"
              placeholder="0.00"
              required
            />
          </div>

          <div className="form-group">
            <label>👤 Customer Name</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
              className="input"
              placeholder="Customer name"
            />
          </div>

          <div className="form-group">
            <label>📞 Phone Number</label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
              className="input"
              placeholder="Phone number"
            />
          </div>

          <div className="form-group">
            <label>📅 Payment Due Date *</label>
            <input
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
              className="input"
              required
            />
          </div>

          <div className="form-group">
            <label>🕐 Preferred Time</label>
            <input
              type="time"
              value={formData.scheduledTime}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
              className="input"
            />
          </div>

          <div className="form-group form-group-full">
            <label>📝 Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="input"
              rows={3}
              placeholder="Payment terms, special instructions, etc..."
            />
          </div>
        </form>
      </div>

      <div className="card-footer">
        <div className="btn-row btn-row-end">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <LoadingButton
            type="submit" 
            className="btn btn-primary" 
            isLoading={isLoading}
            loadingText={arrangement ? "Updating..." : "Creating..."}
            onClick={handleSubmit}
            disabled={addressMode === "existing" && state.addresses.length === 0}
          >
            {arrangement ? "💾 Update" : "📅 Create"} Arrangement
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}