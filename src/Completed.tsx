import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { isSameDay } from "date-fns";
import type { Outcome } from "./types";

type Props = {
  state: any;
  /** Change the outcome for a completed address (by address index). */
  onChangeOutcome: (index: number, outcome: Outcome, amount?: string) => void;
  /** Optional: expose undo on each row. */
  onUndo?: (index: number) => void;
};

export function Completed({ state, onChangeOutcome, onUndo }: Props) {
  const completions: any[] = Array.isArray(state?.completions) ? state.completions : [];
  const addresses: any[] = Array.isArray(state?.addresses) ? state.addresses : [];

  // --- Calendar filter ---
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);

  // Normalize + sort completions (newest first)
  const normalized = React.useMemo(() => {
    const toDate = (c: any): Date | null => {
      const raw = c?.timestamp ?? null;
      if (!raw) return null;
      const d = new Date(raw);
      return isNaN(d as any) ? null : d;
    };
    return completions
      .map((c) => ({ ...c, _date: toDate(c) }))
      .sort((a, b) => {
        const at = a._date ? a._date.getTime() : 0;
        const bt = b._date ? b._date.getTime() : 0;
        return bt - at; // newest first
      });
  }, [completions]);

  const filtered = React.useMemo(() => {
    if (!selectedDate) return normalized;
    return normalized.filter((c) => (c._date ? isSameDay(c._date, selectedDate) : false));
  }, [normalized, selectedDate]);

  // --- Inline edit state ---
  const [editingFor, setEditingFor] = React.useState<number | null>(null);
  const [pifAmount, setPifAmount] = React.useState<string>("");

  const clearDate = () => setSelectedDate(undefined);

  if (completions.length === 0) {
    return (
      <div className="completed-wrap">
        <div className="empty-box">
          <div>No completed calls yet</div>
          <p>When you complete a call it will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="completed-wrap">
      {/* Calendar row */}
      <div className="calendar-row">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
            {selectedDate ? `Showing: ${selectedDate.toLocaleDateString()}` : "Showing: All dates"}
          </div>
          {selectedDate && (
            <button className="btn btn-ghost btn-sm" onClick={clearDate} title="Show all dates">
              Clear
            </button>
          )}
        </div>
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          modifiers={{
            hasData: (day) =>
              normalized.some((c) => (c._date ? isSameDay(c._date, day) : false)),
          }}
          modifiersClassNames={{ hasData: "pill-active" }}
        />
      </div>

      {/* Completed list */}
      {filtered.length === 0 ? (
        <div className="empty-box">
          <div>No completions for this date</div>
          <p>Pick another day or clear the date filter.</p>
        </div>
      ) : (
        filtered.map((c, row) => {
          const idx = Number(c?.index);
          const rec = addresses[idx] ?? {};
          const label = String(rec?.address ?? c?.address ?? `#${idx + 1}`);
          const when = c._date;
          const isEditing = editingFor === idx;

          return (
            <div key={`${idx}-${when?.toISOString?.() ?? row}`} className="card">
              <div className="card-header">
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={label}
                  >
                    {label}
                  </div>

                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    <span
                      className={
                        "pill " +
                        (c.outcome === "PIF"
                          ? "pill-pif"
                          : c.outcome === "DA"
                          ? "pill-da"
                          : c.outcome === "ARR"
                          ? "pill-arr"
                          : "pill-done")
                      }
                    >
                      {c.outcome}
                      {c.outcome === "PIF" && c.amount ? ` £${c.amount}` : ""}
                    </span>
                    {when ? <span style={{ marginLeft: 8 }}>{when.toLocaleString()}</span> : null}
                  </div>
                </div>

                <div className="btn-group">
                  {onUndo && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onUndo(idx)}
                      title="Undo this completion"
                    >
                      ↩️ Undo
                    </button>
                  )}

                  {!isEditing ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setEditingFor(idx);
                        setPifAmount(c.outcome === "PIF" ? String(c.amount ?? "") : "");
                      }}
                      title="Edit outcome"
                    >
                      ✏️ Edit
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingFor(null)}
                      title="Close editor"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="card-body">
                  <div className="complete-bar">
                    <div className="complete-btns">
                      <button
                        className="btn btn-success"
                        onClick={() => {
                          onChangeOutcome(idx, "Done");
                          setEditingFor(null);
                        }}
                        title="Mark as Done"
                      >
                        ✅ Done
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          onChangeOutcome(idx, "DA");
                          setEditingFor(null);
                        }}
                        title="Mark as DA"
                      >
                        🚫 DA
                      </button>

                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          onChangeOutcome(idx, "ARR");
                          setEditingFor(null);
                        }}
                        title="Mark as Arrangement"
                      >
                        📅 ARR
                      </button>
                    </div>

                    <div className="pif-group">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className="input amount-input"
                        placeholder="PIF £"
                        value={pifAmount}
                        onChange={(e) => setPifAmount(e.target.value)}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          const n = Number(pifAmount);
                          if (!Number.isFinite(n) || n <= 0) {
                            alert("Enter a valid PIF amount (e.g. 50)");
                            return;
                          }
                          onChangeOutcome(idx, "PIF", n.toFixed(2));
                          setEditingFor(null);
                        }}
                        title="Save PIF"
                      >
                        💷 Save PIF
                      </button>
                    </div>
                  </div>

                  <div className="muted" style={{ marginTop: 8 }}>
                    Need to manage the payment schedule? Go to the <strong>📅 Arrangements</strong> tab.
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}