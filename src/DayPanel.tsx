// src/DayPanel.tsx
import * as React from "react";
import { isSameDay } from "date-fns";
import type { Outcome } from "./types";

type Props = {
  sessions: any[];
  completions: any[];
  startDay: () => void;
  endDay: () => void;
};

export function DayPanel({ sessions, completions, startDay, endDay }: Props) {
  const activeSession = React.useMemo(
    () => (Array.isArray(sessions) ? sessions.find((s) => !s?.end) : null),
    [sessions]
  );

  // Today's completions (using timestamp || ts || time)
  const today = new Date();
  const todays = React.useMemo(() => {
    if (!Array.isArray(completions)) return [];
    return completions.filter((c) => {
      const raw = c?.timestamp ?? c?.ts ?? c?.time ?? null;
      if (!raw) return false;
      const d = new Date(raw);
      return !isNaN(d as any) && isSameDay(d, today);
    });
  }, [completions]);

  // Outcome counts: include ARR
  const counts: Record<Outcome, number> = React.useMemo(
    () => ({ PIF: 0, Done: 0, DA: 0, ARR: 0 }),
    []
  );

  for (const c of todays) {
    const o: Outcome | undefined = c?.outcome;
    if (o && o in counts) counts[o] += 1;
  }

  const startedAt = activeSession?.start
    ? new Date(activeSession.start)
    : null;

  return (
    <div className={`day-panel ${activeSession ? "day-panel-active" : ""}`}>
      <div className="day-panel-content">
        <div className="day-panel-info">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {activeSession ? (
              <>
                <span className="pill pill-active">Day Active</span>
                {startedAt && (
                  <span className="muted">
                    since {startedAt.toLocaleTimeString()}
                  </span>
                )}
              </>
            ) : (
              <span className="muted">Day not started</span>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="pill pill-done">Today: {todays.length}</span>
            <span className="pill pill-pif">PIF: {counts.PIF}</span>
            <span className="pill pill-done">Done: {counts.Done}</span>
            <span className="pill pill-da">DA: {counts.DA}</span>
            <span className="pill pill-arr">ARR: {counts.ARR}</span>
          </div>
        </div>

        <div className="day-panel-actions">
          {activeSession ? (
            <button className="btn btn-danger" onClick={endDay} title="End day">
              ⏹ End Day
            </button>
          ) : (
            <button className="btn btn-success" onClick={startDay} title="Start day">
              ▶️ Start Day
            </button>
          )}
        </div>
      </div>
    </div>
  );
}