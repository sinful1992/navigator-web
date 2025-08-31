// src/DayPanel.tsx
import * as React from "react";
import { isSameDay } from "date-fns";
import type { DaySession, Completion } from "./types";

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
};

type Tally = { PIF: number; Done: number; DA: number; ARR: number };

export function DayPanel({ sessions, completions, startDay, endDay }: Props) {
  const today = new Date();
  const active = sessions.some((s) => !s.end);

  // Only today's completions; de-dupe by address index (latest keeps)
  const todaysLatestByIndex = React.useMemo(() => {
    const map = new Map<number, Completion>();
    for (const c of completions ?? []) {
      const ts = c?.timestamp;
      if (!ts) continue;
      const d = new Date(ts);
      if (!isNaN(d as any) && isSameDay(d, today)) {
        const prev = map.get(c.index);
        if (!prev || new Date(prev.timestamp).getTime() < d.getTime()) {
          map.set(c.index, c);
        }
      }
    }
    return Array.from(map.values());
  }, [completions, today]);

  const tally: Tally = React.useMemo(() => {
    const t: Tally = { PIF: 0, Done: 0, DA: 0, ARR: 0 };
    for (const c of todaysLatestByIndex) {
      if (c.outcome in t) {
        // @ts-expect-error key is safe
        t[c.outcome] += 1;
      }
    }
    return t;
  }, [todaysLatestByIndex]);

  return (
    <div className={`day-panel ${active ? "day-panel-active" : ""}`}>
      <div className="day-panel-content">
        <div className="day-panel-info">
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {today.toLocaleDateString()}
            </div>
            <div className="muted">
              {active ? "Day in progress" : "Day not started"}
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