// src/DayPanel.tsx
import * as React from "react";
import type { DaySession, Completion } from "./types";

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
  onEditStart: (dateStr: string, newISO: string) => void; // ✅ new
};

function toLocalInputValue(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromLocalInputToISO(local: string) {
  // Treat as local time and convert to ISO
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function DayPanel({ sessions, completions, startDay, endDay, onEditStart }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const todaysSessions = (sessions ?? []).filter((s) => s.date === today);
  const latestToday = todaysSessions.length ? todaysSessions[todaysSessions.length - 1] : undefined;
  const active = todaysSessions.find((s) => !s.end);

  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState<string>("");

  React.useEffect(() => {
    if (!editing) return;
    const current = latestToday?.start;
    setEditValue(toLocalInputValue(current));
  }, [editing, latestToday?.start]);

  const pifCount = (completions ?? []).filter((c) => c.outcome === "PIF").length;
  const doneCount = (completions ?? []).filter((c) => c.outcome === "Done").length;
  const daCount = (completions ?? []).filter((c) => c.outcome === "DA").length;
  const arrCount = (completions ?? []).filter((c) => c.outcome === "ARR").length;

  return (
    <div className={`day-panel ${active ? "day-panel-active" : ""}`}>
      <div className="day-panel-content">
        <div className="day-panel-info">
          <div>
            <strong>Today:</strong> {today}
          </div>
          {latestToday ? (
            <div>
              <strong>Start:</strong>{" "}
              {new Date(latestToday.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {latestToday.end ? (
                <>
                  {" "}• <strong>End:</strong>{" "}
                  {new Date(latestToday.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {typeof latestToday.durationSeconds === "number" ? (
                    <> • <strong>Dur:</strong> {Math.floor(latestToday.durationSeconds / 3600)}h {Math.floor((latestToday.durationSeconds % 3600) / 60)}m</>
                  ) : null}
                </>
              ) : (
                <span className="pill pill-active" style={{ marginLeft: 8 }}>Active</span>
              )}
            </div>
          ) : (
            <div className="muted">No session yet today</div>
          )}

          <div className="day-stats">
            <span className="pill pill-pif">💷 PIF {pifCount}</span>
            <span className="pill pill-done">✅ Done {doneCount}</span>
            <span className="pill pill-da">🚫 DA {daCount}</span>
            <span className="pill pill-active">📅 ARR {arrCount}</span>
          </div>
        </div>

        <div className="day-panel-actions">
          {!active ? (
            <button className="btn btn-primary" onClick={startDay}>▶️ Start Day</button>
          ) : (
            <button className="btn btn-danger" onClick={endDay}>⏹️ Finish Day</button>
          )}

          {latestToday && (
            !editing ? (
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>✏️ Edit start</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="datetime-local"
                  className="input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  style={{ maxWidth: 240 }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const newISO = fromLocalInputToISO(editValue);
                    if (!newISO) {
                      alert("Invalid date/time");
                      return;
                    }
                    onEditStart(today, newISO);
                    setEditing(false);
                  }}
                >
                  💾 Save
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}