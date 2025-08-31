// src/Arrangements.tsx
import * as React from "react";
import {
  format,
  parseISO,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isPast,
  addDays,
} from "date-fns";
import type {
  AppState,
  Arrangement,
  ArrangementStatus,
  AddressRow,
} from "./types";

type Props = {
  state: AppState;
  onAddArrangement: (
    arrangement: Omit<Arrangement, "id" | "createdAt" | "updatedAt">
  ) => void | Promise<void>;
  onUpdateArrangement: (id: string, updates: Partial<Arrangement>) => void | Promise<void>;
  onDeleteArrangement: (id: string) => void | Promise<void>;
  onAddAddress?: (address: AddressRow) => Promise<number>; // Returns the new address index
  autoCreateForAddress?: number | null;
  onAutoCreateHandled?: () => void;
};

type ViewMode = "thisWeek" | "all";

export function Arrangements({
  state,
  onAddArrangement,
  onUpdateArrangement,
  onDeleteArrangement,
  onAddAddress,
  autoCreateForAddress,
  onAutoCreateHandled,
}: Props) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("thisWeek");
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

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
      filtered = state.arrangements.filter((arr) => {
        const arrDate = parseISO(arr.scheduledDate);
        return (
          isWithinInterval(arrDate, { start: weekStart, end: weekEnd }) &&
          arr.status !== "Completed" &&
          arr.status !== "Cancelled"
        );
      });
    } else {
      filtered = state.arrangements.filter(
        (arr) => arr.status !== "Completed" && arr.status !== "Cancelled"
      );
    }

    // Sort by date, then time
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
    for (const arr of filteredArrangements) {
      const k = arr.scheduledDate;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(arr);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredArrangements]);

  // Stats
  const stats = React.useMemo(() => {
    const total = filteredArrangements.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = filteredArrangements.filter((a) => a.scheduledDate === todayStr).length;
    const overdue = filteredArrangements.filter((a) => {
      const d = parseISO(a.scheduledDate);
      return isPast(d) && a.status === "Scheduled";
    }).length;
    const totalAmountDue = filteredArrangements.reduce((sum, a) => {
      return a.amount && a.status !== "Completed" ? sum + parseFloat(a.amount) : sum;
    }, 0);
    return { total, todayCount, overdue, totalAmountDue };
  }, [filteredArrangements]);

  const getStatusColor = (status: ArrangementStatus): string => {
    switch (status) {
      case "Confirmed":
        return "var(--success)";
      case "Completed":
        return "var(--primary)";
      case "Cancelled":
        return "var(--text-muted)";
      case "Missed":
        return "var(--danger)";
      default:
        return "var(--warning)";
    }
  };

  const getStatusIcon = (status: ArrangementStatus): string => {
    switch (status) {
      case "Scheduled":
        return "📅";
      case "Confirmed":
        return "✅";
      case "Completed":
        return "🎉";
      case "Cancelled":
        return "❌";
      case "Missed":
        return "⚠️";
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

  const markAsPaid = (id: string, amount: string) => {
    onUpdateArrangement(id, {
      status: "Completed",
      amount,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleArrangementSave = async (
    arrangementData: Omit<Arrangement, "id" | "createdAt" | "updatedAt">
  ) => {
    await onAddArrangement(arrangementData);
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleArrangementUpdate = async (id: string, updates: Partial<Arrangement>) => {
    await onUpdateArrangement(id, updates);
    setEditingId(null);
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
          <div
            className="stat-value"
            style={{
              color: stats.todayCount > 0 ? "var(--warning)" : "var(--text-primary)",
            }}
          >
            {stats.todayCount}
          </div>
        </div>
        {stats.overdue > 0 && (
          <div className="stat-item">
            <div className="stat-label">⚠️ Overdue</div>
            <div className="stat-value" style={{ color: "var(--danger)" }}>
              {stats.overdue}
            </div>
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
            <button className="btn btn-success" onClick={() => setShowAddForm(true)}>
              ➕ Add Arrangement
            </button>
          </div>
        </div>
      </div>

      {(showAddForm || editingId) && (
        <ArrangementForm
          state={state}
          arrangement={editingId ? state.arrangements.find((a) => a.id === editingId) : undefined}
          preSelectedAddressIndex={autoCreateForAddress}
          onAddAddress={onAddAddress}
          onSave={editingId ? handleArrangementUpdate.bind(null, editingId) : handleArrangementSave}
          onCancel={() => {
            setShowAddForm(false);
            setEditingId(null);
          }}
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
                : "No pending payment arrangements found"}
            </div>
          </div>
        ) : (
          groupedArrangements.map(([dateStr, arrangements]) => (
            <div className="day-card fade-in-up" key={dateStr}>
              <div className="day-header">
                <div>
                  <div className="day-title">{formatDateHeader(dateStr)}</div>
                  <div className="muted">
                    {arrangements.length} payment{arrangements.length === 1 ? "" : "s"} due
                    {arrangements.some((a) => a.amount) && (
                      <>
                        {" "}
                        • £
                        {arrangements
                          .reduce((sum, a) => sum + (parseFloat(a.amount || "0") || 0), 0)
                          .toFixed(2)}{" "}
                        total
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="arrangements-list">
                {arrangements.map((a) => (
                  <div className="arrangement-card" key={a.id}>
                    <div className="arrangement-header">
                      <div className="arrangement-info">
                        <div className="arrangement-address">
                          <span
                            style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}
                          >
                            #{a.addressIndex + 1}
                          </span>{" "}
                          {a.address}
                        </div>
                        {a.customerName && (
                          <div className="arrangement-customer">👤 {a.customerName}</div>
                        )}
                        {a.scheduledTime && (
                          <div className="arrangement-time">🕐 {a.scheduledTime}</div>
                        )}
                        {a.amount && (
                          <div
                            className="arrangement-amount"
                            style={{
                              fontSize: "1rem",
                              fontWeight: 600,
                              color: "var(--success)",
                            }}
                          >
                            💰 £{a.amount}
                          </div>
                        )}
                        {a.phoneNumber && (
                          <div className="arrangement-phone">📞 {a.phoneNumber}</div>
                        )}
                        {a.notes && <div className="arrangement-notes">📝 {a.notes}</div>}
                      </div>

                      <div className="arrangement-status">
                        <span
                          className="pill"
                          style={{
                            backgroundColor: `${getStatusColor(a.status)}15`,
                            borderColor: getStatusColor(a.status),
                            color: getStatusColor(a.status),
                          }}
                        >
                          {getStatusIcon(a.status)} {a.status}
                        </span>
                      </div>
                    </div>

                    <div className="arrangement-actions">
                      {a.status === "Scheduled" && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() =>
                            onUpdateArrangement(a.id, {
                              status: "Confirmed",
                              updatedAt: new Date().toISOString(),
                            })
                          }
                        >
                          ✅ Confirm
                        </button>
                      )}

                      {(a.status === "Scheduled" || a.status === "Confirmed") && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            const actual = window.prompt(
                              `Mark as paid:\n\nExpected: £${a.amount || "0.00"}\nEnter actual amount received:`,
                              a.amount || ""
                            );
                            if (actual !== null && actual.trim()) {
                              markAsPaid(a.id, actual.trim());
                            }
                          }}
                        >
                          💰 Mark Paid
                        </button>
                      )}

                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setEditingId(a.id)}
                      >
                        ✏️ Edit
                      </button>

                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this arrangement?")) {
                            onDeleteArrangement(a.id);
                          }
                        }}
                      >
                        🗑️ Delete
                      </button>
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
}

type FormProps = {
  state: AppState;
  arrangement?: Arrangement;
  preSelectedAddressIndex?: number | null;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  onSave: (
    arrangement: Omit<Arrangement, "id" | "createdAt" | "updatedAt">
  ) => Promise<void> | void;
  onCancel: () => void;
};

function ArrangementForm({
  state,
  arrangement,
  preSelectedAddressIndex,
  onAddAddress,
  onSave,
  onCancel,
}: FormProps) {
  const [addressMode, setAddressMode] = React.useState<"existing" | "manual">(
    preSelectedAddressIndex !== null && preSelectedAddressIndex !== undefined
      ? "existing"
      : "existing"
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
    status: (arrangement?.status ?? "Scheduled") as ArrangementStatus,
  });

  const selectedAddress =
    addressMode === "existing" ? state.addresses[formData.addressIndex] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert("Please enter a valid payment amount");
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
      if (!formData.manualAddress.trim()) {
        alert("Please enter an address");
        return;
      }

      const existingIndex = state.addresses.findIndex(
        (addr) =>
          addr.address.toLowerCase().trim() === formData.manualAddress.toLowerCase().trim()
      );

      if (existingIndex >= 0) {
        finalAddressIndex = existingIndex;
        finalAddress = state.addresses[existingIndex].address;
      } else {
        if (!onAddAddress) {
          alert("Cannot add new addresses - missing onAddAddress handler");
          return;
        }
        const newRow: AddressRow = { address: formData.manualAddress.trim(), lat: null, lng: null };
        finalAddressIndex = await onAddAddress(newRow);
        finalAddress = newRow.address;
      }
    }

    const payload = {
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

    await onSave(payload);
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

          {addressMode === "existing" ? (
            <div className="form-group form-group-full">
              <label>📍 Address *</label>
              {state.addresses.length === 0 ? (
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "var(--warning-light)",
                    border: "1px solid var(--warning)",
                    borderRadius: "var(--radius)",
                    color: "var(--warning)",
                    fontSize: "0.875rem",
                  }}
                >
                  ⚠️ No addresses in your list. Switch to "Enter Manually" to add a new address.
                </div>
              ) : (
                <select
                  value={formData.addressIndex}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, addressIndex: parseInt(e.target.value, 10) }))
                  }
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
                onChange={(e) => setFormData((p) => ({ ...p, manualAddress: e.target.value }))}
                className="input"
                placeholder="Enter full address"
                required
              />
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  marginTop: "0.25rem",
                }}
              >
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
              onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
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
              onChange={(e) => setFormData((p) => ({ ...p, customerName: e.target.value }))}
              className="input"
              placeholder="Customer name"
            />
          </div>

          <div className="form-group">
            <label>📞 Phone Number</label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => setFormData((p) => ({ ...p, phoneNumber: e.target.value }))}
              className="input"
              placeholder="Phone number"
            />
          </div>

          <div className="form-group">
            <label>📅 Payment Due Date *</label>
            <input
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData((p) => ({ ...p, scheduledDate: e.target.value }))}
              className="input"
              required
            />
          </div>

          <div className="form-group">
            <label>🕐 Preferred Time</label>
            <input
              type="time"
              value={formData.scheduledTime}
              onChange={(e) => setFormData((p) => ({ ...p, scheduledTime: e.target.value }))}
              className="input"
            />
          </div>

          <div className="form-group form-group-full">
            <label>📝 Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
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
          <button type="submit" className="btn btn-primary" onClick={handleSubmit}>
            {arrangement ? "💾 Update" : "📅 Create"} Arrangement
          </button>
        </div>
      </div>
    </div>
  );
}