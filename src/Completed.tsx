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
          } catch {
            /* ignore */
          }
          return 0;
        })();
      hoursMap.set(k, (hoursMap.get(k) || 0) + (sec || 0));
    }
    return hoursMap;
  }, [state.daySessions]);

  // Outcomes summary across filtered set
  const totals = React.useMemo(() => {
    const out: Record<Outcome, number> = { PIF: 0, DA: 0, Done: 0 };
    let totalPifAmount = 0;
    
    for (const c of filtered) {
      out[c.outcome] = (out[c.outcome] || 0) + 1;
      if (c.outcome === "PIF" && c.amount) {
        totalPifAmount += parseFloat(c.amount) || 0;
      }
    }
    
    return { ...out, totalPifAmount };
  }, [filtered]);

  // Export JSON per day (hours + addresses + outcomes)
  const onExportJSON = () => {
    const fromLabel = range?.from ? format(range.from, "yyyyMMdd") : "all";
    const toLabel = range?.to ? format(range.to, "yyyyMMdd") : fromLabel;

    const payload = grouped.map(([k, items]) => {
      const dayDate = new Date(`${k}T00:00:00Z`);
      const sec = dayHours.get(k) ?? null;
      const outcomes: Record<Outcome, number> = { PIF: 0, DA: 0, Done: 0 };
      let dayPifTotal = 0;
      
      for (const c of items) {
        outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
        if (c.outcome === "PIF" && c.amount) {
          dayPifTotal += parseFloat(c.amount) || 0;
        }
      }

      return {
        date: k,
        prettyDate: format(dayDate, "EEEE d MMM yyyy"),
        durationSeconds: sec,
        hoursText: secsToText(sec),
        outcomesSummary: outcomes,
        totalPifAmount: dayPifTotal,
        addresses: items.map((c) => ({
          index: c.index,
          address: c.address,
          lat: c.lat,
          lng: c.lng,
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

  const clearDateRange = () => {
    setRange(undefined);
  };

  return (
    <div className="completed-wrap">
      {/* Summary Stats */}
      <div className="top-row">
        <div className="stat-item">
          <div className="stat-label">📍 Total Completed</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-label">💰 PIF</div>
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {totals.PIF}
            {totals.totalPifAmount > 0 && (
              <div style={{ fontSize: "0.75rem", fontWeight: 500, opacity: 0.8 }}>
                £{totals.totalPifAmount.toFixed(2)}
              </div>
            )}
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-label">✅ Done</div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>{totals.Done}</div>
        </div>
        
        <div className="stat-item">
          <div className="stat-label">❌ DA</div>
          <div className="stat-value" style={{ color: "var(--danger)" }}>{totals.DA}</div>
        </div>

        <div className="stat-actions">
          <div className="btn-group">
            <button className="btn btn-primary" onClick={onExportJSON}>
              📤 Export Data
            </button>
            {range && (
              <button className="btn btn-ghost" onClick={clearDateRange}>
                🗓️ Clear Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="calendar-row">
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ 
            margin: "0 0 0.5rem 0", 
            fontSize: "1.125rem",
            fontWeight: 700,
            color: "var(--text-primary)"
          }}>
            📅 Filter by Date Range
          </h3>
          <p style={{ 
            margin: 0, 
            fontSize: "0.875rem", 
            color: "var(--text-secondary)",
            lineHeight: 1.5
          }}>
            {range?.from ? (
              range.to ? (
                `Showing completions from ${format(range.from, "MMM d")} to ${format(range.to, "MMM d, yyyy")}`
              ) : (
                `Showing completions for ${format(range.from, "MMM d, yyyy")}`
              )
            ) : (
              "Click dates below to filter results, or select a range by clicking start and end dates"
            )}
          </p>
        </div>
        
        <div style={{ 
          background: "var(--bg-tertiary)", 
          borderRadius: "var(--radius)",
          padding: "1rem",
          display: "flex",
          justifyContent: "center"
        }}>
          <DayPicker
            mode="range"
            selected={range}
            onSelect={setRange}
            captionLayout="buttons"
            showOutsideDays
            style={{
              fontSize: "0.875rem"
            }}
          />
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="days-list">
        {grouped.length === 0 ? (
          <div className="empty-box">
            <div style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              📊 No completions found
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
              {range?.from 
                ? "No addresses were completed in the selected date range" 
                : "Complete some addresses to see your progress here"
              }
            </div>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "1rem"
            }}>
              📈 Daily Breakdown ({grouped.length} day{grouped.length === 1 ? '' : 's'})
            </div>
            
            {grouped.map(([k, items]) => {
              const dayDate = new Date(`${k}T00:00:00Z`);
              const sec = dayHours.get(k) ?? null;
              const outcomes: Record<Outcome, number> = { PIF: 0, DA: 0, Done: 0 };
              let dayPifTotal = 0;
              
              for (const c of items) {
                outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
                if (c.outcome === "PIF" && c.amount) {
                  dayPifTotal += parseFloat(c.amount) || 0;
                }
              }

              return (
                <div className="day-card fade-in-up" key={k}>
                  <div className="day-header">
                    <div>
                      <div className="day-title">
                        📅 {format(dayDate, "EEEE, d MMM yyyy")}
                      </div>
                      <div className="muted">
                        ⏱️ {secsToText(sec)} • 📍 {items.length} address{items.length === 1 ? '' : 'es'}
                        {dayPifTotal > 0 && ` • 💰 £${dayPifTotal.toFixed(2)} PIF`}
                      </div>
                    </div>
                    
                    <div className="day-stats">
                      {outcomes.PIF > 0 && (
                        <span className="pill pill-pif">
                          💰 {outcomes.PIF} PIF
                        </span>
                      )}
                      {outcomes.Done > 0 && (
                        <span className="pill pill-done">
                          ✅ {outcomes.Done} Done
                        </span>
                      )}
                      {outcomes.DA > 0 && (
                        <span className="pill pill-da">
                          ❌ {outcomes.DA} DA
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="day-body">
                    {items.map((c, idx) => {
                      const t = format(parseISO(c.timestamp), "HH:mm");
                      return (
                        <div className="day-row" key={idx}>
                          <div className="row-left">
                            <div className="addr">
                              <span style={{ 
                                color: "var(--text-muted)", 
                                fontSize: "0.8125rem",
                                marginRight: "0.5rem"
                              }}>
                                {c.index + 1}.
                              </span>
                              {c.address}
                            </div>
                            <div className="muted">🕐 {t}</div>
                          </div>
                          <div className="row-right">
                            {c.outcome === "PIF" ? (
                              <span className="pill pill-pif">
                                💰 PIF{c.amount ? ` £${c.amount}` : ""}
                              </span>
                            ) : c.outcome === "DA" ? (
                              <span className="pill pill-da">❌ DA</span>
                            ) : (
                              <span className="pill pill-done">✅ Done</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}