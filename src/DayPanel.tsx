// src/DayPanel.tsx
import * as React from "react";
import { format, isSameDay, parseISO } from "date-fns";
import type { Completion, DaySession } from "./types";

function activeSession(sessions: DaySession[]) {
  return sessions.find((s) => !s.end);
}
function countToday(comps: Completion[]) {
  const today = new Date();
  return comps.filter((c) => isSameDay(parseISO(c.timestamp), today)).length;
}

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
};

export const DayPanel: React.FC<Props> = ({ sessions, completions, startDay, endDay }) => {
  const active = activeSession(sessions);
  return (
    <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 12, display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      {active ? (
        <>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Day started</div>
            <div style={{ fontWeight: 700 }}>{format(parseISO(active.start), "HH:mm")}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Completed today</div>
            <div style={{ fontWeight: 700 }}>{countToday(completions)}</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={endDay}>End Day</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600 }}>No active day session</div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={startDay}>Start Day</button>
          </div>
        </>
      )}
    </div>
  );
};
