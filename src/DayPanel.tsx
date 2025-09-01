// src/DayPanel.tsx
import * as React from "react";
import type { DaySession, Completion, Outcome } from "./types";

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
  /** Called with a Date or ISO string. App will update (or create) today's session. */
  onEditStart: (newStart: string | Date) => void;
};

function toISO(dateStr: string, timeStr: string) {
  // dateStr "YYYY-MM-DD"; timeStr "HH:MM"
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh = 0, mm = 0] = timeStr ? timeStr.split(":").map(Number) : [0, 0];
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  return dt.toISOString();
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
}: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Find today's session (prefer an active one; otherwise, most recent today)
  const todaysSessions = (sessions ?? []).filter((s) => s.date === todayStr);
  const activeIdx = todaysSessions.findIndex((s) => !s.end);
  const active = activeIdx >= 0 ? todaysSessions[activeIdx] : null;
  const latestToday =
    active ?? todaysSessions[todaysSessions.length - 1] ?? null;

  const isActive = !!active;

  // Today’s completion stats
  const todays = (completions ?? []).filter(
    (c) => (c.timestamp ?? "").slice(0, 10) === todayStr
  );

  const outcomeCounts = todays.reduce<Record<Outcome, number>>(
    (acc, c) => {
      // Narrow to known outcomes
      if (c.outcome === "PIF" || c.outcome === "DA" || c.outcome === "Done" || c.outcome === "ARR") {
        acc[c.outcome] += 1;
      }
      return acc;
    },
    { PIF: 0, DA: 0, Done: 0, ARR: 0 }
  );

  // --- Edit start controls ---
  const [editing, setEditing] = React.useState(false);
  const [dateVal, setDateVal] = React.useState<string>(todayStr);
  const [timeVal, setTimeVal] = React.useState<string>(() => {
    if (latestToday?.start) {
      const d = new Date(latestToday.start);
      return `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    }
    // default to now
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    // Keep the editor fields in sync when a session (start) changes
    if (latestToday?.start) {
      const d = new Date(latestToday.start);
      setDateVal(latestToday.date);
      setTimeVal(
        `${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`
      );
    } else {
      setDateVal(todayStr);
      const now = new Date();
      setTimeVal(
        `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes()
        ).padStart(2, "0")}`
      );
    }
  }, [latestToday?.start, latestToday?.date, todayStr]);

  const saveEdit = () => {
    if (!dateVal) {
      alert("Please choose a date.");
      return;
    }
    const iso = toISO(dateVal, timeVal || "09:00");
    onEditStart(iso); // App.tsx will update or create today's session
    setEditing(false);
  };

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

          {/* Today’s quick stats */}
          <div className="day-stats" style={{ display: "flex", gap: "0.5rem" }}>
            <span className="pill pill-pif">PIF {outcomeCounts.PIF}</span>
            <span className="pill pill-done">Done {outcomeCounts.Done}</span>
            <span className="pill pill-da">DA {outcomeCounts.DA}</span>
            <span className="pill pill-active">ARR {outcomeCounts.ARR}</span>
          </div>
        </div>

        <div className="day-panel-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isActive ? (
            <button className="btn btn-success" onClick={startDay}>▶️ Start Day</button>
          ) : (
            <button className="btn btn-danger" onClick={endDay}>⏹️ End Day</button>
          )}

          {/* Edit start is available always for today (lets you backfill). */}
          {!editing ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="Edit today's start time">
              ✏️ Edit start
            </button>
          ) : (
            <div className="btn-group" style={{ alignItems: "center" }}>
              <input
                type="date"
                className="input"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
              />
              <input
                type="time"
                className="input"
                value={timeVal}
                onChange={(e) => setTimeVal(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>💾 Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}