// src/Completed.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";
import { sumHours } from "./utils";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";

type Props = { state: AppState };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function Completed({ state }: Props) {
  // Default: no range selected (shows a hint). Select 1 day or a range.
  const [range, setRange] = React.useState<DateRange | undefined>();

  // Build filtered list based on selected range
  const filtered = React.useMemo(() => {
    if (!range || !range.from) return [];
    const from = startOfDay(range.from);
    const to = endOfDay(range.to ?? range.from);
    return state.completions.filter((c) => {
      const dt = new Date(c.timestamp);
      return dt >= from && dt <= to;
    });
  }, [range, state.completions]);

  // Totals by outcome
  const counts = filtered.reduce(
    (acc, c) => {
      acc.total++;
      acc[c.outcome as Outcome] = (acc[c.outcome as Outcome] ?? 0) + 1;
      return acc;
    },
    { total: 0, PIF: 0, Done: 0, DA: 0 } as Record<"total" | Outcome, number>
  );

  // Group by day (YYYY-MM-DD)
  const byDay = React.useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const key = c.timestamp.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [filtered]);

  // Export JSON for current selection
  const onExportJSON = () => {
    if (!range?.from) return;
    const fromStr = range.from.toISOString().slice(0, 10);
    const toStr = (range.to ?? range.from).toISOString().slice(0, 10);

    const days = Array.from(byDay.entries()).map(([date, items]) => {
      const perOutcome: Record<Outcome, number> = { PIF: 0, Done: 0, DA: 0 };
      for (const it of items) perOutcome[it.outcome]++;
      return {
        date,
        hoursText: sumHours(items),
        outcomes: perOutcome,
        addresses: items.map((it) => ({
          index: it.index,
          address: it.address,
          lat: it.lat ?? undefined,
          lng: it.lng ?? undefined,
          outcome: it.outcome,
          amount: it.amount ?? undefined,
          timestamp: it.timestamp,
        })),
      };
    });

    const payload = {
      range: { from: fromStr, to: toStr },
      totals: counts,
      days,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `completed_${fromStr}_to_${toStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      {/* Calendar */}
      <div className="panel">
        <div className="panel-title">Pick a date or drag to select a range</div>
        <div className="calendar-wrap">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            captionLayout="dropdown"  // month/year dropdowns (nice on mobile)
            weekStartsOn={1}          // Monday
          />
        </div>
      </div>

      {/* Summary + Export */}
      <div className="panel">
        <div className="panel-row">
          <div className="kpis">
            <div className="kpi"><div className="label">Total</div><div className="value">{counts.total}</div></div>
            <div className="kpi"><div className="label">PIF</div><div className="value">{counts.PIF}</div></div>
            <div className="kpi"><div className="label">Done</div><div className="value">{counts.Done}</div></div>
            <div className="kpi"><div className="label">DA</div><div className="value">{counts.DA}</div></div>
          </div>
          <button className="btn primary" disabled={!range?.from} onClick={onExportJSON}>
            Export JSON
          </button>
        </div>
      </div>

      {/* Results */}
      {!range?.from ? (
        <div className="panel muted">Select a date (or range) on the calendar above.</div>
      ) : byDay.size === 0 ? (
        <div className="panel muted">No completions within the selected dates.</div>
      ) : (
        <div className="day-grid">
          {Array.from(byDay.entries())
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([d, items]) => {
              const oc: Record<Outcome, number> = { PIF: 0, Done: 0, DA: 0 };
              for (const it of items) oc[it.outcome]++;
              return (
                <div key={d} className="day-card">
                  <div className="day-header">
                    <div><strong>{d}</strong></div>
                    <div className="day-hours">Hours (est): <b>{sumHours(items)}</b></div>
                  </div>
                  <div className="day-outcomes">
                    PIF: <b>{oc.PIF}</b> • Done: <b>{oc.Done}</b> • DA: <b>{oc.DA}</b>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {items.map((it) => (
                      <div key={`${d}-${it.index}-${it.timestamp}`} className="addr-line">
                        {it.address} • {it.outcome}
                        {it.outcome === "PIF" && it.amount ? ` £${it.amount}` : ""} •{" "}
                        {new Date(it.timestamp).toLocaleTimeString()}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}