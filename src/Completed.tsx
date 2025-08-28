// src/Completed.tsx
import * as React from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, parseISO, isSameDay, eachDayOfInterval } from "date-fns";
import type { AppState, Completion, Outcome } from "./types";

type Props = { state: AppState };

function secsToText(total: number | null | undefined) {
  if (!total || total <= 0) return "N/A";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}

export function Completed({ state }: Props) {
  // Date range picker state
  const [range, setRange] = React.useState<DateRange>();

  // Build list of days in selected range (if any)
  const selectedDays = React.useMemo(() => {
    if (!range?.from && !range?.to) return null;
    const from = range!.from!;
    const to = range!.to ?? range!.from!;
    return eachDayOfInterval({ start: from, end: to });
  }, [range]);

  // Filter completions by range (if any)
  const filtered: Completion[] = React.useMemo(() => {
    if (!selectedDays) return state.completions;
    return state.completions.filter((c) => {
      const d = parseISO(c.timestamp);
      return selectedDays.some((sd) => isSameDay(sd, d));
    });
  }, [state.completions, selectedDays]);

  // Group completions by day (only days that have completions)
  const grouped = React.useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of filtered) {
      const k = c.timestamp.slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    // newest first
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  // Compute hours per day from sessions
  const dayHours = React.useMemo(() => {
    const hoursMap = new Map<string, number>();
    for (const s of state.daySessions) {
      const k = s.date;
      if (!k) continue;
      const sec =
        s.durationSeconds ??
        (() => {
          try {
            if (s.start && s.end) {
              const a = new Date(s.start).getTime();
              const b = new Date(s.end).getTime();
              if (b > a) return Math.floor((b - a) / 1000);
            }
          } catch {}
          return 0;
        })();
      hoursMap.set(k, (hoursMap.get(k) || 0) + (sec || 0));
    }
    return hoursMap;
  }, [state.daySessions]);

  // Outcomes summary across filtered set
  const totals = React.useMemo(() => {
    const out: Record<Outcome, number> = { PIF: 0, DA: 0, Done: 0 };
    for (const c of filtered) out[c.outcome] = (out[c.outcome] || 0) + 1;
    return out;
  }, [filtered]);

  // Export JSON per day (hours + addresses + outcomes)
  const onExportJSON = () => {
    const fromLabel = range?.from ? format(range.from, "yyyyMMdd") : "all";
    const toLabel = range?.to ? format(range.to, "yyyyMMdd") : fromLabel;

    const payload = grouped.map(([k, items]) => {
      const dayDate = new Date(`${k}T00:00:00Z`);
      const sec = dayHours.get(k) ?? null;
      const outcomes: Record<Outcome, number> = { PIF: 0, DA: 0, Done: 0 };
      for (const c of items) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;

      return {
        date: k,
        prettyDate: format(dayDate, "EEEE d MMM yyyy"),
        durationSeconds: sec,
        hoursText: secsToText(sec),
        outcomesSummary: outcomes,
        addresses: items.map((c) => ({
          index: c.index,
          address: c.address,
          lat: c.lat, // optional
          lng: c.lng, // optional
          outcome: c.outcome,
          amount: c.amount,
          timestamp: c.timestamp,
        })),
      };
    });

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `completed_${fromLabel}-${toLabel}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="completedWrap">
      <div className="topRow">
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Completed (filtered)</div>
          <div style={{ fontWeight: 700 }}>{filtered.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>PIF</div>
          <div style={{ fontWeight: 700 }}>{totals.PIF}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Done</div>
          <div style={{ fontWeight: 700 }}>{totals.Done}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>DA</div>
          <div style={{ fontWeight: 700 }}>{totals.DA}</div>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button className="btn" onClick={onExportJSON}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="calendarRow">
        <DayPicker
          mode="range"
          selected={range}
          onSelect={setRange}
          captionLayout="buttons"
          showOutsideDays
        />
      </div>

      <div className="daysList">
        {grouped.length === 0 ? (
          <div className="emptyBox">
            <div style={{ fontSize: 14, opacity: 0.75 }}>
              No completions{range?.from ? " in the selected range" : ""}.
            </div>
          </div>
        ) : (
          grouped.map(([k, items]) => {
            const dayDate = new Date(`${k}T00:00:00Z`);
            const sec = dayHours.get(k) ?? null;
            const outcomes: Record<Outcome, number> = { PIF: 0, DA: 0, Done: 0 };
            for (const c of items) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;

            return (
              <div className="dayCard" key={k}>
                <div className="dayHeader">
                  <div>
                    <div className="dayTitle">
                      {format(dayDate, "EEEE d MMM yyyy")}
                    </div>
                    <div className="muted">Hours: {secsToText(sec)}</div>
                  </div>
                  <div className="dayStats">
                    <span>
                      PIF: <b>{outcomes.PIF}</b>
                    </span>
                    <span>
                      Done: <b>{outcomes.Done}</b>
                    </span>
                    <span>
                      DA: <b>{outcomes.DA}</b>
                    </span>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="emptyBox" style={{ marginTop: 8 }}>
                    <div className="muted">No completions this day.</div>
                  </div>
                ) : (
                  <div className="dayBody">
                    {items.map((c, idx) => {
                      const t = format(parseISO(c.timestamp), "HH:mm");
                      return (
                        <div className="row" key={idx}>
                          <div className="rowLeft">
                            <div className="addr">{c.address}</div>
                            <div className="muted">{t}</div>
                          </div>
                          <div className="rowRight">
                            {c.outcome === "PIF" ? (
                              <span className="pill pillPif">
                                PIF{c.amount ? ` £${c.amount}` : ""}
                              </span>
                            ) : c.outcome === "DA" ? (
                              <span className="pill pillDa">DA</span>
                            ) : (
                              <span className="pill pillDone">Done</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```0