// src/Completed.tsx
import * as React from "react";
import type { AddressRow, Completion, DaySession, Outcome, Arrangement, AppState } from "./types";
import UnifiedArrangementForm from "./components/UnifiedArrangementForm";
import { PifDetailsModal } from "./components/PifDetailsModal";

import { logger } from './utils/logger';

type AppStateSlice = {
  addresses: AddressRow[];
  completions: Completion[];
  daySessions: DaySession[];
  arrangements: Arrangement[];
};

type Props = {
  state: AppStateSlice & AppState;
  onChangeOutcome: (
    completionArrayIndex: number,
    outcome: Outcome,
    amount?: string,
    arrangementId?: string,
    caseReference?: string,
    numberOfCases?: number,
    enforcementFees?: number[]
  ) => void;
  onAddArrangement?: (
    arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<string>;
  onComplete?: (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string) => void;
};

const TZ = "Europe/London";

/* ----------------------- Date helpers ----------------------- */
function toKey(d: Date, tz = TZ) {
  const y = d.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  const m = d.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
  const dd = d.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
  return y + "-" + m + "-" + dd;
}
function fromKey(key: string) {
  const parts = key.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
function addDays(d: Date, days: number) {
  const nd = new Date(d.getTime());
  nd.setDate(nd.getDate() + days);
  return nd;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDayKey(a: string, b: string) {
  return a === b;
}
function keyBetween(key: string, a: string, b: string) {
  return key >= a && key <= b;
}
function hoursFmt(totalSeconds: number) {
  const h = totalSeconds / 3600;
  return h.toFixed(2);
}
function safeDurationSeconds(s: DaySession): number {
  const anyS: any = s as any;
  if (typeof anyS.durationSeconds === "number") return Math.max(0, anyS.durationSeconds);
  if (s.start && s.end) {
    try {
      const st = new Date(s.start).getTime();
      const en = new Date(s.end).getTime();
      if (isFinite(st) && isFinite(en) && en > st) return Math.floor((en - st) / 1000);
    } catch (error) {
      logger.warn("Failed to calculate duration:", error);
    }
  }
  return 0;
}
function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function buildDays(startKey: string, endKey: string): string[] {
  if (!startKey || !endKey) return [];
  const start = fromKey(startKey);
  const end = fromKey(endKey);
  if (!(start <= end)) return [startKey];
  const out: string[] = [];
  let cur = new Date(start.getTime());
  while (cur <= end) {
    out.push(toKey(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/* ------------------- Calendar (single/range) ------------------- */
type CalendarRangeProps = {
  startKey: string;
  endKey: string;
  onChange: (startKey: string, endKey: string) => void;
};

function CalendarRange({ startKey, endKey, onChange }: CalendarRangeProps) {
  const initial = fromKey(endKey || startKey || toKey(new Date()));
  const [viewDate, setViewDate] = React.useState<Date>(startOfMonth(initial));
  const [pickingEnd, setPickingEnd] = React.useState<boolean>(false);

  function buildGrid(dateInMonth: Date) {
    const first = startOfMonth(dateInMonth);
    const dow = first.getDay(); // 0=Sun..6=Sat
    const mondayOffset = (dow + 6) % 7; // Monday as start
    const gridStart = addDays(first, -mondayOffset);
    const cells: { key: string; inMonth: boolean; date: Date }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      cells.push({ key: toKey(d), inMonth: d.getMonth() === dateInMonth.getMonth(), date: d });
    }
    return cells;
  }

  const cells = buildGrid(viewDate);
  const monthLabel =
    viewDate.toLocaleDateString("en-GB", { month: "long" }) + " " + String(viewDate.getFullYear());
  const minKey = startKey <= endKey ? startKey : endKey;
  const maxKey = startKey <= endKey ? endKey : startKey;
  const todayKey = toKey(new Date());

  function gotoPrevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }
  function gotoNextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }
  function handlePick(dayKey: string) {
    // First click picks start (single day). Second click sets range end.
    if (!pickingEnd) {
      onChange(dayKey, dayKey);
      setPickingEnd(true);
      return;
    }
    let s = startKey || dayKey;
    let e = dayKey;
    if (e < s) {
      const tmp = s;
      s = e;
      e = tmp;
    }
    onChange(s, e);
    setPickingEnd(false);
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-light)",
        borderRadius: 12,
        padding: "0.75rem",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <button className="btn btn-ghost" onClick={gotoPrevMonth} aria-label="Previous month">
          Prev
        </button>
        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{monthLabel}</div>
        <button className="btn btn-ghost" onClick={gotoNextMonth} aria-label="Next month">
          Next
        </button>
      </div>

      {/* Weekdays */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          fontSize: 12,
          color: "var(--text-secondary)",
          textAlign: "center",
          marginBottom: 4,
        }}
      >
        <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((c) => {
          const selected = keyBetween(c.key, minKey, maxKey);
          const isStart = sameDayKey(c.key, startKey);
          const isEnd = sameDayKey(c.key, endKey);
          const isToday = sameDayKey(c.key, todayKey);
          const baseStyle: React.CSSProperties = {
            padding: "0.5rem 0",
            borderRadius: 8,
            border: "1px solid var(--border-light)",
            background: selected ? "var(--surface-strong)" : "var(--surface)",
            textAlign: "center",
            cursor: "pointer",
            opacity: c.inMonth ? 1 : 0.45,
            position: "relative",
            userSelect: "none",
          };
          const dotStyle: React.CSSProperties = {
            position: "absolute",
            top: 6,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: 6,
            background: isToday ? "currentColor" : "transparent",
            opacity: isToday ? 0.7 : 0,
          };
          const ringStyle: React.CSSProperties = {
            position: "absolute",
            inset: 0,
            borderRadius: 8,
            border: isStart || isEnd ? "2px solid var(--primary, #4f46e5)" : "2px solid transparent",
            pointerEvents: "none",
          };
          return (
            <div key={c.key} style={baseStyle} title={c.key} onClick={() => handlePick(c.key)}>
              <div style={{ fontWeight: isStart || isEnd ? 700 : 500, color: "var(--text-primary)" }}>{String(c.date.getDate())}</div>
              <div style={dotStyle} />
              <div style={ringStyle} />
            </div>
          );
        })}
      </div>

      {/* Quick ranges */}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const k = toKey(new Date());
            onChange(k, k);
            setViewDate(startOfMonth(new Date()));
            setPickingEnd(false);
          }}
        >
          Today
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const end = new Date();
            const start = addDays(new Date(), -6);
            onChange(toKey(start), toKey(end));
            setViewDate(startOfMonth(end));
            setPickingEnd(false);
          }}
        >
          Last 7 days
        </button>
      </div>
    </div>
  );
}

/* ------------------------- Completed ------------------------- */
function getCompletionDateKey(c: Completion, fallbackSessions: DaySession[]): string | null {
  const anyC: any = c as any;
  const candidates = [anyC.date, anyC.day, anyC.at, anyC.timestamp, anyC.completedAt, anyC.created_at];
  for (const cand of candidates) {
    if (!cand) continue;
    const d = new Date(cand);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const keys = new Set(fallbackSessions.map((s) => s.date));
  if (keys.size === 1) return Array.from(keys)[0] || null;
  return null;
}

const CompletedComponent = function Completed({ state, onChangeOutcome, onAddArrangement, onComplete }: Props) {
  const { addresses, completions, daySessions, arrangements } = state;

  // Track which completion is showing PIF details modal
  const [showPifModal, setShowPifModal] = React.useState<{
    completionIndex: number;
    currentAmount?: string;
    currentCaseRef?: string;
    currentNumberOfCases?: number;
    currentEnforcementFees?: number[];
  } | null>(null);

  // Track which completion is showing arrangement form for ARR outcome
  const [showArrangementForm, setShowArrangementForm] = React.useState<{
    completionIndex: number;
    addressIndex: number;
  } | null>(null);

  // Initial range: last session day or today
  const lastSessionKey =
    daySessions.length > 0 ? daySessions[daySessions.length - 1].date : toKey(new Date());
  const [startKey, setStartKey] = React.useState<string>(lastSessionKey);
  const [endKey, setEndKey] = React.useState<string>(lastSessionKey);

  // Show/hide the per-day detail cards
  const [detailsOpen, setDetailsOpen] = React.useState<boolean>(false);

  // Aggregate session seconds per day
  const secondsByDay = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of daySessions) {
      const key = s.date;
      if (!key) continue;
      const prev = m.get(key) || 0;
      m.set(key, prev + safeDurationSeconds(s));
    }
    return m;
  }, [daySessions]);

  // Track earliest start and latest end per day
  const timesByDay = React.useMemo(() => {
    const m = new Map<string, { start?: string; end?: string }>();
    for (const s of daySessions) {
      if (!s.date) continue;
      const existing = m.get(s.date) || {};
      // Track earliest start
      if (s.start) {
        if (!existing.start || new Date(s.start) < new Date(existing.start)) {
          existing.start = s.start;
        }
      }
      // Track latest end
      if (s.end) {
        if (!existing.end || new Date(s.end) > new Date(existing.end)) {
          existing.end = s.end;
        }
      }
      m.set(s.date, existing);
    }
    return m;
  }, [daySessions]);

  // Map day -> indices of completions for that day
  const completionIdxByDay = React.useMemo(() => {
    const m = new Map<string, number[]>();
    completions.forEach((c, idx) => {
      const key = getCompletionDateKey(c, daySessions);
      if (!key) return;
      const arr = m.get(key);
      if (arr) arr.push(idx);
      else m.set(key, [idx]);
    });
    return m;
  }, [completions, daySessions]);

  const dayKeys = buildDays(startKey, endKey);

  // Range totals
  let totalSeconds = 0;
  let totalCompleted = 0;
  let totalPIF = 0;
  let totalDA = 0;
  dayKeys.forEach((k) => {
    totalSeconds += secondsByDay.get(k) || 0;
    const idxs = completionIdxByDay.get(k) || [];
    totalCompleted += idxs.length;
    totalPIF += idxs.map((i) => completions[i]).filter((c) => c.outcome === "PIF").length;
    totalDA += idxs.map((i) => completions[i]).filter((c) => c.outcome === "DA").length;
  });

  // Per-day expand/collapse (when details are open)
  const [openDays, setOpenDays] = React.useState<Record<string, boolean>>({});
  function toggleDay(key: string) {
    setOpenDays((o) => ({ ...o, [key]: !o[key] }));
  }

  return (
    <div>
      {/* Single calendar (pick day or range) */}
      <div style={{ marginBottom: "0.9rem" }}>
        <CalendarRange
          startKey={startKey}
          endKey={endKey}
          onChange={(s, e) => {
            setStartKey(s);
            setEndKey(e);
          }}
        />
      </div>

      {/* Range summary (with details toggle) */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: "12px",
          padding: "1rem",
          boxShadow: "var(--shadow-sm)",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {"Summary " + (startKey === endKey ? "(" + startKey + ")" : "(" + startKey + " -> " + endKey + ")")}
          </div>
          <button className="btn btn-ghost" onClick={() => setDetailsOpen((v) => !v)}>
            {detailsOpen ? "Hide details" : "View details"}
          </button>
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span className="pill">Hours {hoursFmt(totalSeconds)}</span>
          <span className="pill pill-done">Completed {totalCompleted}</span>
          <span className="pill pill-pif">PIF {totalPIF}</span>
          <span className="pill pill-da">DA {totalDA}</span>
        </div>
      </div>

      {/* Per-day cards (shown only when detailsOpen) */}
      {detailsOpen && (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {dayKeys.map((k) => {
            const seconds = secondsByDay.get(k) || 0;
            const idxs = completionIdxByDay.get(k) || [];
            const pif = idxs.map((i) => completions[i]).filter((c) => c.outcome === "PIF").length;
            const da = idxs.map((i) => completions[i]).filter((c) => c.outcome === "DA").length;
            const arrCount = idxs.map((i) => completions[i]).filter((c) => c.outcome === "ARR").length;
            const total = idxs.length;

            return (
              <div
                key={k}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 12,
                  padding: "0.75rem",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{k}</strong>
                    {(() => {
                      const times = timesByDay.get(k);
                      if (times?.start) {
                        const startTime = formatTime(times.start);
                        const endTime = times.end ? formatTime(times.end) : "ongoing";
                        return (
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            {startTime} - {endTime}
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <span className="pill">Hours {hoursFmt(seconds)}</span>
                    <span className="pill pill-done">Completed {total}</span>
                    <span className="pill pill-pif">PIF {pif}</span>
                    <span className="pill pill-da">DA {da}</span>
                    {arrCount > 0 && <span className="pill pill-arr">ARR {arrCount}</span>}
                  </div>
                  <button className="btn btn-ghost" onClick={() => toggleDay(k)}>
                    {openDays[k] ? "Hide" : "View"}
                  </button>
                </div>

                {openDays[k] && (
                  <div style={{ marginTop: "0.75rem" }}>
                    {idxs.length === 0 ? (
                      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>No entries for this day.</div>
                    ) : (
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        {idxs.map((compIndex) => {
                          const comp = completions[compIndex] as any;
                          const addr = addresses[comp.index] as AddressRow | undefined;
                          const line =
                            (typeof comp.address === "string" && comp.address.trim().length > 0
                              ? comp.address
                              : undefined) ||
                            (addr && addr.address) ||
                            (addr && (addr as any).name) ||
                            (typeof comp.index === "number" ? "Address #" + comp.index : "Address");
                          const currentOutcome: Outcome | string | undefined = comp.outcome;
                          
                          // Find associated arrangement if this completion has an arrangementId
                          const arrangement = comp.arrangementId 
                            ? arrangements.find(arr => arr.id === comp.arrangementId)
                            : null;

                          return (
                            <div
                              key={compIndex}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: "0.5rem",
                                alignItems: "center",
                                border: "1px dashed var(--border-light)",
                                borderRadius: 10,
                                padding: "0.5rem 0.75rem",
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>
                                  {line}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                  {"Index " + String(comp.index)}
                                  {comp.outcome === "PIF" && (
                                    <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                      <span>· £{comp.amount || "0.00"}</span>
                                      <button
                                        style={{
                                          fontSize: 10,
                                          padding: "2px 6px",
                                          background: "var(--primary)",
                                          color: "white",
                                          border: "none",
                                          borderRadius: 3,
                                          cursor: "pointer",
                                          marginLeft: 4
                                        }}
                                        onClick={() => {
                                          setShowPifModal({
                                            completionIndex: compIndex,
                                            currentAmount: comp.amount,
                                            currentCaseRef: comp.caseReference,
                                            currentNumberOfCases: comp.numberOfCases,
                                            currentEnforcementFees: comp.enforcementFees
                                          });
                                        }}
                                        title="Edit PIF details"
                                      >
                                        ✏️
                                      </button>
                                      {comp.caseReference && (
                                        <span style={{ marginLeft: 8 }}>
                                          · Ref: {comp.caseReference}
                                        </span>
                                      )}
                                      {comp.numberOfCases && comp.numberOfCases > 1 && (
                                        <span style={{ marginLeft: 8 }}>
                                          · {comp.numberOfCases} cases
                                        </span>
                                      )}
                                      {/* Display enforcement fees (NEW: array format) */}
                                      {comp.enforcementFees && comp.enforcementFees.length > 0 && (
                                        <span style={{ marginLeft: 8 }}>
                                          · Enf Fees: {comp.enforcementFees.map((fee: number) => `£${fee.toFixed(2)}`).join(", ")}
                                          {comp.numberOfCases && comp.numberOfCases > comp.enforcementFees.length && (
                                            <span style={{ color: "var(--primary)", fontWeight: 600, marginLeft: 4 }}>
                                              + {comp.numberOfCases - comp.enforcementFees.length} linked (£10 each)
                                            </span>
                                          )}
                                        </span>
                                      )}
                                      {/* Legacy: Display total enforcement fees (backward compatibility) */}
                                      {!comp.enforcementFees && comp.totalEnforcementFees !== undefined && comp.totalEnforcementFees !== null && (
                                        <span style={{ marginLeft: 8 }}>
                                          · Enf: £{comp.totalEnforcementFees.toFixed(2)}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {arrangement && (
                                    <>
                                      <br />
                                      <span style={{ color: "var(--primary)", fontSize: "0.75rem" }}>
                                        📅 From arrangement
                                        {arrangement.customerName && ` (${arrangement.customerName})`}
                                        {comp.outcome === "Done" && " • Defaulted"}
                                        {comp.outcome === "PIF" && arrangement.recurrenceType && arrangement.recurrenceType !== "none" &&
                                          ` • ${arrangement.recurrenceType === "weekly" ? "Weekly" : "Monthly"} payment`
                                        }
                                      </span>
                                    </>
                                  )}
                                  {comp.timeSpentSeconds !== undefined && comp.timeSpentSeconds > 0 && (
                                    <>
                                      {!arrangement && <br />}
                                      <span style={{ color: "var(--gray-600)", fontSize: "0.75rem", marginLeft: arrangement ? 8 : 0 }}>
                                        {arrangement && " • "}⏱️ {Math.floor(comp.timeSpentSeconds / 60)}m {comp.timeSpentSeconds % 60}s
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <label
                                  htmlFor={`outcome-${compIndex}`}
                                  style={{
                                    position: 'absolute',
                                    width: 1,
                                    height: 1,
                                    padding: 0,
                                    margin: -1,
                                    overflow: 'hidden',
                                    clip: 'rect(0,0,0,0)',
                                    whiteSpace: 'nowrap',
                                    border: 0
                                  }}
                                >
                                  Outcome
                                </label>
                                <select
                                  id={`outcome-${compIndex}`}
                                  name={`outcome-${compIndex}`}
                                  value={(currentOutcome as string) || ""}
                                  onChange={(e) => {
                                    const newOutcome = e.target.value as Outcome;
                                    if (newOutcome === "ARR" && onAddArrangement) {
                                      // Show arrangement form instead of directly changing outcome
                                      setShowArrangementForm({
                                        completionIndex: compIndex,
                                        addressIndex: comp.index
                                      });
                                    } else if (newOutcome === "PIF") {
                                      // Show PIF details modal for entering/editing full PIF information
                                      setShowPifModal({
                                        completionIndex: compIndex,
                                        currentAmount: comp.amount,
                                        currentCaseRef: comp.caseReference,
                                        currentNumberOfCases: comp.numberOfCases,
                                        currentEnforcementFees: comp.enforcementFees
                                      });
                                    } else {
                                      onChangeOutcome(compIndex, newOutcome, comp.amount, comp.arrangementId, comp.caseReference, comp.numberOfCases, comp.enforcementFees);
                                    }
                                  }}
                                  className="input"
                                  style={{ padding: "0.25rem 0.5rem", height: 32 }}
                                >
                                  <option value="">-</option>
                                  <option value="Done">
                                    {arrangement ? "Done (Defaulted)" : "Done"}
                                  </option>
                                  <option value="PIF">
                                    {arrangement ? "PIF (Arrangement)" : "PIF"}
                                  </option>
                                  <option value="DA">DA</option>
                                  <option value="ARR">ARR</option>
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Arrangement Form for ARR outcome */}
      {showArrangementForm && onAddArrangement && onComplete && (
        <UnifiedArrangementForm
          state={state}
          preSelectedAddressIndex={showArrangementForm.addressIndex}
          onSave={async (arrangementData) => {
            const arrangementId = await onAddArrangement(arrangementData);
            // Change the completion outcome to ARR and link the new arrangement
            onChangeOutcome(showArrangementForm.completionIndex, "ARR", undefined, arrangementId);
            setShowArrangementForm(null);
          }}
          onCancel={() => setShowArrangementForm(null)}
          onComplete={onComplete}
          fullscreen={true}
        />
      )}

      {/* PIF Details Modal for editing PIF completions */}
      {showPifModal && (
        <PifDetailsModal
          initialAmount={showPifModal.currentAmount}
          initialCaseReference={showPifModal.currentCaseRef}
          initialNumberOfCases={showPifModal.currentNumberOfCases}
          initialEnforcementFees={showPifModal.currentEnforcementFees}
          onConfirm={(data) => {
            onChangeOutcome(
              showPifModal.completionIndex,
              "PIF",
              data.amount,
              completions[showPifModal.completionIndex]?.arrangementId,
              data.caseReference,
              data.numberOfCases,
              data.enforcementFees
            );
            setShowPifModal(null);
          }}
          onCancel={() => setShowPifModal(null)}
        />
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(CompletedComponent);