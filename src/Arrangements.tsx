// src/Arrangements.tsx
import * as React from "react";
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek, isSameDay, isPast, addDays } from "date-fns";
import type { AppState, Arrangement, ArrangementStatus } from "./types";

type Props = {
  state: AppState;
  onAddArrangement: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateArrangement: (id: string, updates: Partial<Arrangement>) => void;
  onDeleteArrangement: (id: string) => void;
};

type ViewMode = "thisWeek" | "all";

export function Arrangements({ state, onAddArrangement, onUpdateArrangement, onDeleteArrangement }: Props) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("thisWeek");
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Filter arrangements based on view mode
  const filteredArrangements = React.useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday

    let filtered = state.arrangements;

    if (viewMode === "thisWeek") {
      filtered = state.arrangements.filter(arr => {
        const arrDate = parseISO(arr.scheduledDate);
        return isWithinInterval(arrDate, { start: weekStart, end: weekEnd });
      });
    }

    // Sort by date, then by time
    return filtered.sort((a, b) => {
      const dateA = parseISO(a.scheduledDate);
      const dateB = parseISO(b.scheduledDate);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      // If same date, sort by time
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
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
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
    
    const statusCounts = filteredArrangements.reduce((acc, arr) => {
      acc[arr.status] = (acc[arr.status] || 0) + 1;
      return acc;
    }, {} as Record<ArrangementStatus, number>);

    return { total, todayCount, overdue, statusCounts };
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

  return (
    <div className="arrangements-wrap">
      {/* Header with view toggle */}
      <div className="top-row">
        <div className="stat-item">
          <div className="stat-label">📋 Total</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-label">📅 Today</div>
          <div className="stat-value">{stats.todayCount}</div>
        </div>
        
        {stats.overdue > 0 && (
          <div className="stat-item">
            <div className="stat-label">⚠️ Overdue</div>
            <div className="stat-value" style={{ color: "var(--danger)" }}>{stats.overdue}</div>
          </div>
        )}
        
        <div className="stat-item">
          <div className="stat-label">✅ Confirmed</div>
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {stats.statusCounts.Confirmed || 0}
          </div>
        </div>

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
            <button 
              className="btn btn-success"
              onClick={() => setShowAddForm(true)}
            >
              ➕ Add
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <ArrangementForm 
          state={state}
          arrangement={editingId ? state.arrangements.find(a => a.id === editingId) : undefined}
          onSave={(arrangement) => {
            if (editingId) {
              onUpdateArrangement(editingId, arrangement);
              setEditingId(null);
            } else {
              onAddArrangement(arrangement);
              setShowAddForm(false);
            }
          }}
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
              📅 No arrangements found
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
              {viewMode === "thisWeek" 
                ? "No arrangements scheduled for this week" 
                : "No arrangements have been created yet"
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
                    {arrangements.length} arrangement{arrangements.length === 1 ? '' : 's'}
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
                          <div className="arrangement-amount">
                            💰 £{arrangement.amount}
                          </div>
                        )}
                        {arrangement.phoneNumber && (
                          <div className="arrangement-phone">
                            📞 {arrangement.phoneNumber}
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
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setEditingId(arrangement.id)}
                      >
                        ✏️ Edit
                      </button>
                      
                      {arrangement.status === "Scheduled" && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => onUpdateArrangement(arrangement.id, { 
                            status: "Confirmed",
                            updatedAt: new Date().toISOString()
                          })}
                        >
                          ✅ Confirm
                        </button>
                      )}
                      
                      {(arrangement.status === "Scheduled" || arrangement.status === "Confirmed") && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => onUpdateArrangement(arrangement.id, { 
                            status: "Completed",
                            updatedAt: new Date().toISOString()
                          })}
                        >
                          🎉 Complete
                        </button>
                      )}
                      
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this arrangement?")) {
                            onDeleteArrangement(arrangement.id);
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

// Arrangement Form Component
type FormProps = {
  state: AppState;
  arrangement?: Arrangement;
  onSave: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
};

function ArrangementForm({ state, arrangement, onSave, onCancel }: FormProps) {
  const [formData, setFormData] = React.useState({
    addressIndex: arrangement?.addressIndex ?? 0,
    customerName: arrangement?.customerName ?? "",
    phoneNumber: arrangement?.phoneNumber ?? "",
    scheduledDate: arrangement?.scheduledDate ?? new Date().toISOString().slice(0, 10),
    scheduledTime: arrangement?.scheduledTime ?? "",
    amount: arrangement?.amount ?? "",
    notes: arrangement?.notes ?? "",
    status: arrangement?.status ?? "Scheduled" as ArrangementStatus,
  });

  const selectedAddress = state.addresses[formData.addressIndex];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAddress) {
      alert("Please select a valid address");
      return;
    }

    onSave({
      ...formData,
      address: selectedAddress.address,
    });
  };

  return (
    <div className="card arrangement-form">
      <div className="card-header">
        <h3 style={{ margin: 0 }}>
          {arrangement ? "✏️ Edit Arrangement" : "➕ Add New Arrangement"}
        </h3>
      </div>
      
      <div className="card-body">
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>📍 Address *</label>
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
            <label>📅 Date *</label>
            <input
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
              className="input"
              required
            />
          </div>

          <div className="form-group">
            <label>🕐 Time</label>
            <input
              type="time"
              value={formData.scheduledTime}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
              className="input"
            />
          </div>

          <div className="form-group">
            <label>💰 Expected Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              className="input"
              placeholder="0.00"
            />
          </div>

          <div className="form-group form-group-full">
            <label>📝 Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="input"
              rows={3}
              placeholder="Additional notes..."
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
            {arrangement ? "💾 Update" : "➕ Create"} Arrangement
          </button>
        </div>
      </div>
    </div>
  );
}
