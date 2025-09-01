// src/DayPanel.tsx
import * as React from "react";
import type { AppDay, Completion, Outcome } from "./types";

type Props = {
  day?: AppDay;
  completions: Completion[];
  currentListVersion: number;
};

function norm(o?: Outcome): "PIF" | "DA" | "DONE" | "ARR" | undefined {
  if (!o) return undefined;
  if (o === "Done") return "DONE";
  return o as any;
}

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function DayPanel({ day, completions, currentListVersion }: Props) {
  const counts = React.useMemo(() => {
    const acc = { PIF: 0, DA: 0, DONE: 0, ARR: 0 };
    for (const c of completions) {
      if (c.listVersion !== currentListVersion) continue;
      const o = norm(c.outcome);
      if (!o) continue;
      if (o in acc) (acc as any)[o] += 1;
    }
    return acc;
  }, [completions, currentListVersion]);

  const total = counts.PIF + counts.DA + counts.DONE + counts.ARR;

  const timing = React.useMemo(() => {
    const start = day?.startTime ? new Date(day.startTime).getTime() : undefined;
    const end = day?.endTime ? new Date(day.endTime).getTime() : Date.now();
    if (!start) return { label: "Not started", value: "" };
    return { label: day?.endTime ? "Duration" : "Elapsed", value: fmtDuration(end - start) };
  }, [day?.startTime, day?.endTime]);

  return (
    <div className="row-card" style={{ marginTop: 12 }}>
      <div className="row-head">
        <div className="row-index">⏱</div>
        <div className="row-title">Today</div>
      </div>
      <div className="card-body">
        <div className="complete-bar">
          <div className="complete-btns">
            <div className="btn btn-ghost btn-sm">PIF: <strong>{counts.PIF}</strong></div>
            <div className="btn btn-ghost btn-sm">DA: <strong>{counts.DA}</strong></div>
            <div className="btn btn-ghost btn-sm">Done: <strong>{counts.DONE}</strong></div>
            <div className="btn btn-ghost btn-sm">ARR: <strong>{counts.ARR}</strong></div>
            <div className="btn btn-outline btn-sm">Total: <strong>{total}</strong></div>
          </div>
          <div className="pif-group">
            <div className="btn btn-ghost btn-sm" title={day?.startTime || ""}>
              {timing.label}: <strong>{timing.value}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
