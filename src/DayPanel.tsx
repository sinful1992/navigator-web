// src/DayPanel.tsx - FIXED VERSION
import * as React from "react";
import type { DaySession, Completion, Outcome } from "./types";

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
  /** Called with a Date or ISO string. App will update (or create) today's session start. */
  onEditStart: (newStart: string | Date) => void;
  /** Called with a Date or ISO string. App will update (or create) today's session end. */
  onEditEnd: (newEnd: string | Date) => void;
};

// 🔧 FIXED: Create local time instead of UTC
function toISO(dateStr: string, timeStr: string) {
  // dateStr "YYYY-MM-DD"; timeStr "HH:MM"
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  try {
    // ✅ Use local time constructor instead of Date.UTC()
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
    return dt.toISOString();
  } catch {
    return "";
  }
}

// 🔧 FIXED: Extract time in local timezone
function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    // ✅ Use toLocaleTimeString to respect local timezone
    return d.toLocaleTimeString("en-GB", { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/London' // Or use Intl.DateTimeFormat().resolvedOptions().timeZone for auto-detect
    });
  } catch {
    return "—";
  }
}

// 🔧 FIXED: Convert ISO to local time for form inputs
function isoToLocalTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

function isoToLocalDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

export function DayPanel({
  sessions,
  completions,
  startDay,
  endDay,
  onEditStart,
  onEditEnd,
}: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Prefer an active session; else the most recent for today
  const todaySessions = sessions.filter((s) => s.date === todayStr);
  const active = todaySessions.find((s) => !s.end) || null;
  const latestToday =
    active ||
    todaySessions.slice().sort((a, b) => {
      const ta = new Date(a.start || a.date + "T00:00:00.000Z").getTime();
      const tb = new Date(b.start || b.date + "T00:00:00.000Z").getTime();
      return tb - ta;
    })[0];

  const isActive = !!active;

  // Today's completions summary
  const todays = completions.filter((c) => (c.timestamp || "").slice(0, 10) === todayStr);
  const outcomeCounts = todays.reduce<Record<Outcome, number>>(
    (acc, c) => {
      if (c.outcome === "PIF" || c.outcome === "DA" || c.outcome === "Done" || c.outcome === "ARR") {
        acc[c.outcome] += 1;
      }
      return acc;
    },
    { PIF: 0, DA: 0, Done: 0, ARR: 0 }
  );

  // --- Edit start controls ---
  const [editingStart, setEditingStart] = React.useState(false);
  const [startDate, setStartDate] = React.useState<string>(todayStr);
  const [startTime, setStartTime] = React.useState<string>(() => {
    if (latestToday?.start) {
      return isoToLocalTime(latestToday.start);
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    if (latestToday?.start) {
      setStartDate(isoToLocalDate(latestToday.start) || latestToday.date);
      setStartTime(isoToLocalTime(latestToday.start));
    } else {
      setStartDate(todayStr);
      const now = new Date();
      setStartTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [latestToday?.start, latestToday?.date, todayStr]);

  const saveStart = React.useCallback(() => {
    const iso = toISO(startDate, startTime);
    if (iso) onEditStart(iso);
    setEditingStart(false);
  }, [startDate, startTime, onEditStart]);

  // --- Edit finish controls ---
  const [editingEnd, setEditingEnd] = React.useState(false);
  const [endDate, setEndDate] = React.useState<string>(todayStr);
  const [endTime, setEndTime] = React.useState<string>(() => {
    if (latestToday?.end) {
      return isoToLocalTime(latestToday.end);
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    if (latestToday?.end) {
      setEndDate(isoToLocalDate(latestToday.end) || latestToday.date);
      setEndTime(isoToLocalTime(latestToday.end));
    } else {
      setEndDate(todayStr);
      const now = new Date();
      setEndTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [latestToday?.end, latestToday?.date, todayStr]);

  const saveEnd = React.useCallback(() => {
    const iso = toISO(endDate, endTime);
    if (iso) onEditEnd(iso);
    setEditingEnd(false);
  }, [endDate, endTime, onEditEnd]);

  return (
    <div className={`day-panel ${isActive ? "day-panel-active" : ""}`}>
      <div className="day-panel-content">
        <div className="day-panel-info">
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {isActive ? "Day Running" : latestToday ? "Day (ended)" : "No session today"}
            </div>
            <div className="muted">
              {latestToday?.start ? (
                <>
                  Start: <strong>{fmtTime(latestToday.start)}</strong>
                  {latestToday?.end ? (
                    <>
                      {" "}
                      • End: <strong>{fmtTime(latestToday.end)}</strong>
                    </>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>

          {/* Today's quick stats */}
          <div className="day-stats" style={{ display: "flex", gap: "0.5rem" }}>
            <span className="pill pill-pif">PIF {outcomeCounts.PIF}</span>
            <span className="pill pill-done">Done {outcomeCounts.Done}</span>
            <span className="pill pill-da">DA {outcomeCounts.DA}</span>
            <span className="pill pill-active">ARR {outcomeCounts.ARR}</span>
          </div>
        </div>

        <div className="day-panel-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!isActive ? (
            <button className="btn btn-success" onClick={startDay}>▶️ Start Day</button>
          ) : (
            <button className="btn btn-danger" onClick={endDay}>⏹️ End Day</button>
          )}

          {/* Edit START */}
          {!editingStart ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingStart(true)} title="Edit today's start time">
              ✏️ Edit start
            </button>
          ) : (
            <div className="btn-group" style={{ alignItems: "center" }}>
              <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={saveStart}>💾 Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingStart(false)}>Cancel</button>
            </div>
          )}

          {/* Edit END */}
          {!editingEnd ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingEnd(true)} title="Edit today's finish time">
              ✏️ Edit finish
            </button>
          ) : (
            <div className="btn-group" style={{ alignItems: "center" }}>
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={saveEnd}>💾 Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingEnd(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}