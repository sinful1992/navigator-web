import * as React from "react";
import { format, isSameDay } from "date-fns";
import type { DaySession, Completion, Outcome } from "./types";

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
};

type Tally = { PIF: number; Done: number; DA: number; ARR: number };

export function DayPanel({ sessions, completions, startDay, endDay }: Props) {
  const today = new Date();

  const todaysCompletions = React.useMemo(() => {
    return (Array.isArray(completions) ? completions : []).filter((c) => {
      const ts = c?.timestamp;
      if (!ts) return false;
      const d = new Date(ts);
      return !isNaN(d as any) && isSameDay(d, today);
    });
  }, [completions, today]);

  const tally: Tally = React.useMemo(() => {
    const t: Tally = { PIF: 0, Done: 0, DA: 0, ARR: 0 };
    for (const c of todaysCompletions) {
      if (c.outcome === "PIF") t.PIF++;
      else if (c.outcome === "Done") t.Done++;
      else if (c.outcome === "DA") t.DA++;
      else if (c.outcome === "ARR") t.ARR++;
    }
    return t;
  }, [todaysCompletions]);

  const activeIdx = sessions.findIndex((s) => !s.end);
  const active = activeIdx >= 0 ? sessions[activeIdx] : null;

  return (
    <div className={`day-panel ${active ? "day-panel-active" : ""}`}>
      <div className="day-panel-content">
        <div className="day-panel-info">
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {format(today, "EEEE, d MMM yyyy")}
            </div>
            <div className="muted">
              {active ? "Day started" : "Day not started"}
              {active?.start ? ` • ${new Date(active.start).toLocaleTimeString()}` : ""}
            </div>
          </div>

          <div className="btn-group">
            <span className="pill pill-pif">PIF: {tally.PIF}</span>
            <span className="pill pill-done">Done: {tally.Done}</span>
            <span className="pill pill-da">DA: {tally.DA}</span>
            <span className="pill pill-arr">ARR: {tally.ARR}</span>
          </div>
        </div>

        <div className="day-panel-actions">
          {!active ? (
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