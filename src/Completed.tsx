// src/Completed.tsx
import * as React from "react";
import type { AddressRow, Completion, Arrangement, DaySession, Outcome } from "./types";

type AppStateSlice = {
  addresses: AddressRow[];
  completions: Completion[];
  arrangements: Arrangement[];
  daySessions: DaySession[];
  activeIndex: number | null;
  currentListVersion: number;
};

type Props = {
  state: AppStateSlice;
  onChangeOutcome: (completionArrayIndex: number, outcome: Outcome, amount?: string) => void;
};

function toKey(d: Date, tz = "Europe/London") {
  const y = d.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  const m = d.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
  const dd = d.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
  return y + "-" + m + "-" + dd;
}

function safeDurationSeconds(s: DaySession): number {
  // If durationSeconds present, trust it; else compute from start/end
  const asAny: any = s as any;
  if (typeof asAny.durationSeconds === "number") return Math.max(0, asAny.durationSeconds);
  if (s.start && s.end) {
    try {
      const st = new Date(s.start).getTime();
      const en = new Date(s.end).getTime();
      if (isFinite(st) && isFinite(en) && en > st) return Math.floor((en - st) / 1000);
    } catch {}
  }
  return 0;
}

function hoursFmt(totalSeconds: number) {
  const h = totalSeconds / 3600;
  return h.toFixed(2);
}

function getCompletionDateKey(c: Completion, fallbackSessions: DaySession[]): string | null {
  const anyC: any = c as any;
  const candidates = [anyC.date, anyC.day, anyC.at, anyC.timestamp, anyC.completedAt, anyC.created_at];
  for (const cand of candidates) {
    if (!cand) continue;
    const d = new Date(cand);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // no timestamp on the completion: try to place it on any same-day session if there is exactly one
  const keys = new Set(fallbackSessions.map((s) => s.date));
  if (keys.size === 1) return Array.from(keys)[0] || null;
  return null;
}

function inRange(key: string, startKey: string, endKey: string) {
  return key >= startKey && key <= endKey;
}

function buildDays(startKey: string, endKey: string): string[] {
  if (!startKey || !endKey) return [];
  const start = new Date(startKey + "T00:00:00");
  const end = new Date(endKey + "T00:00:00");
  if (!(start <= end)) return [startKey];
  const out: string[] = [];
  const cur = new Date(start.getTime());
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function Completed({ state, onChangeOutcome }: Props) {
  const { addresses, completions, daySessions } = state;

  // Initial range: last active day if exists, else today
  const lastSessionKey =
    daySessions.length > 0 ? daySessions[daySessions.length - 1].date : toKey(new Date());
  const [startKey, setStartKey] = React.useState<string>(lastSessionKey);
  const [endKey, setEndKey] = React.useState<string>(lastSessionKey);

  // Map: dayKey -> seconds worked
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

  // Map: dayKey -> list of completion indices (indices into state.completions array)
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

  // Aggregate for selected range
  const dayKeys = buildDays(startKey, endKey);

  let totalSeconds = 0;
  let totalCompleted = 0;
  let totalPIF = 0;

  dayKeys.forEach((k) => {
    totalSeconds += secondsByDay.get(k) || 0;
    const idxs = completionIdxByDay.get(k) || [];
    totalCompleted += idxs.length;
    totalPIF += idxs
      .map((i) => completions[i])
      .filter((c) => (c as any).outcome === "PIF").length;
  });

  // For per-day expand/collapse
  const [openDays, setOpenDays] = React.useState<Record<string, boolean>>({});

  function toggleDay(key: string) {
    setOpenDays((o) => ({ ...o, [key]: !o[key] }));
  }

  function outcomeSelect(
    completionArrayIndex: number,
    current: Outcome | string | undefined,
    onChange: (v: Outcome) => void
  ) {
    const cur = (current as string) || "";
    return (
      <select
        value={cur}
        onChange={(e) => onChange(e.target.value as Outcome)}
        className="input"
        style={{ padding: "0.25rem 0.5rem", height: 32 }}
      >
        <option value="">—</option>
        <option value="Done">Done</option>
        <option value="PIF">PIF</option>
        <option value="DA">DA</option>
      </select>
    );
  }

  return (
    <div>
      {/* Range picker */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "end",
        }}
      >
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Start</label>
          <input
            type="date"
            className="input"
            value={startKey}
            onChange={(e) => {
              const v = e.target.value;
              setStartKey(v);
              if (v > endKey) setEndKey(v);
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>End</label>
          <input
            type="date"
            className="input"
            value={endKey}
            onChange={(e) => {
              const v = e.target.value;
              setEndKey(v);
              if (v < startKey) setStartKey(v);
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const t = new Date();
              const k = toKey(t);
              setStartKey(k);
              setEndKey(k);
            }}
          >
            Today
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 6);
              setStartKey(toKey(start));
              setEndKey(toKey(end));
            }}
          >
            Last 7 days
          </button>
        </div>
      </div>

      {/* Range summary */}
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
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Summary {startKey === endKey ? "(" + startKey + ")" : "(" + startKey + " → " + endKey + ")"}
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span className="pill">Hours {hoursFmt(totalSeconds)}</span>
          <span className="pill pill-done">Completed {totalCompleted}</span>
          <span className="pill pill-pif">PIF {totalPIF}</span>
        </div>
      </div>

      {/* Per-day cards */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {dayKeys.map((k) => {
          const seconds = secondsByDay.get(k) || 0;
          const idxs = completionIdxByDay.get(k) || [];
          const pif = idxs
            .map((i) => completions[i])
            .filter((c) => (c as any).outcome === "PIF").length;
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
                  <span className="pill">Hours {hoursFmt(seconds)}</span>
                  <span className="pill pill-done">Completed {total}</span>
                  <span className="pill pill-pif">PIF {pif}</span>
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
                          (addr && (addr as any).address) ||
                          (addr && (addr as any).name) ||
                          (typeof comp.index === "number" ? "Address #" + comp.index : "Address");
                        const currentOutcome: Outcome | string | undefined = comp.outcome;

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
                              <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                Index {String(comp.index)}
                                {comp.amount ? " · £" + String(comp.amount) : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              {outcomeSelect(compIndex, currentOutcome, (v) => onChangeOutcome(compIndex, v))}
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
    </div>
  );
}

export default Completed;
