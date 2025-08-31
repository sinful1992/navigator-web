import * as React from "react";
import type { Completion, DaySession, Outcome } from "./types";
import { isSameDay } from "date-fns";

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
};

export function DayPanel({ sessions, completions, startDay, endDay }: Props) {
  const isActive = React.useMemo(() => sessions.some((d) => !d.end), [sessions]);

  const today = new Date();
  const todayCompletions = React.useMemo(() => {
    return (completions ?? []).filter((c) => {
      const raw = (c as any).timestamp ?? (c as any).ts ?? (c as any).time;
      if (!raw) return false;
      const d = new Date(raw);
      return !isNaN(d as any) && isSameDay(d, today);
    });
  }, [completions, today]);

  // Tally outcomes (supports ARR)
  const counts = React.useMemo(() => {
    const tally: Record<Outcome, number> = {
      PIF: 0,
      Done: 0,
      DA: 0,
      ARR: 0,
    };
    for (const c of todayCompletions) {
      if (c.outcome in tally) {
        tally[c.outcome as Outcome] += 1;
      }
    }
    return tally;
  }, [todayCompletions]);

  const totalToday = todayCompletions.length;

  return (
    <div className={`day-panel ${isActive ? "day-panel-active" : ""}`}>
      <div className="day-panel-content">
        <div className="day-panel-info">
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {isActive ? "Day in progress" : "No active day"}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              Today’s actions: {totalToday} • PIF {counts.PIF} • Done {counts.Done} • DA{" "}
              {counts.DA} • ARR {counts.ARR}
            </div>
          </div>
        </div>

        <div className="day-panel-actions">
          {!isActive ? (
            <button className="btn btn-success" onClick={startDay}>
              ▶️ Start Day
            </button>
          ) : (
            <button className="btn btn-danger" onClick={endDay}>
              ⏹ End Day
            </button>
          )}
        </div>
      </div>
    </div>
  );
}