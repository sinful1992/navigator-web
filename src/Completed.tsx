// src/Completed.tsx
import type { AppState, Completion, Outcome, DaySession } from "./types";

type Props = {
  state: AppState;
};

type DayExport = {
  date: string; // YYYY-MM-DD
  durationSeconds: number | null;
  hoursText: string; // e.g., "7h 15m" or "N/A"
  sessions?: Array<{
    start?: string;
    end?: string;
    durationSeconds?: number;
  }>;
  outcomesSummary: Record<Outcome | string, number>;
  addresses: Array<{
    index: number;
    address: string;
    lat?: number;
    lng?: number;
    outcome: Outcome;
    amount?: string;
    timestamp: string;
  }>;
};

export function Completed({ state }: Props) {
  const { completions } = state;

  const counts = completions.reduce(
    (acc, c) => {
      acc[c.outcome] = (acc[c.outcome] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const exportJson = () => {
    const payload = buildDailyExport(state);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `completed_summary_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Completed</h2>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={exportJson}>Export JSON</button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0,1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Total</div>
          <div style={{ fontWeight: 700 }}>{completions.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>PIF</div>
          <div style={{ fontWeight: 700 }}>{counts["PIF"] ?? 0}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Done</div>
          <div style={{ fontWeight: 700 }}>{counts["Done"] ?? 0}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>DA</div>
          <div style={{ fontWeight: 700 }}>{counts["DA"] ?? 0}</div>
        </div>
      </div>

      {!completions.length ? (
        <p style={{ opacity: 0.7 }}>No completions yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {completions.map((c: Completion, i) => (
            <div
              key={`${c.index}-${c.timestamp}-${i}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 10,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <strong style={{ flex: 1 }}>
                  {c.index + 1}. {c.address}
                </strong>
                <span>
                  {c.outcome}
                  {c.amount ? ` £${c.amount}` : ""}
                </span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {c.timestamp}
                {c.lat != null && c.lng != null ? ` • GPS: ${c.lat},${c.lng}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- helpers -----

function buildDailyExport(state: AppState) {
  const byDay = groupByDay(state.completions);
  const allDays = new Set<string>([
    ...Object.keys(byDay),
    ...state.daySessions.map((s) => s.date),
  ]);

  const days: DayExport[] = Array.from(allDays)
    .sort()
    .map((date) => {
      const comps = (byDay[date] ?? []).slice().sort((a, b) =>
        (a.timestamp || "").localeCompare(b.timestamp || "")
      );
      const outcomes = summarizeOutcomes(comps);

      const sessions = state.daySessions.filter((s) => s.date === date);
      const durationSecondsFromSessions = sumSessionSeconds(sessions);

      let durationSeconds: number | null = null;
      if (durationSecondsFromSessions > 0) {
        durationSeconds = durationSecondsFromSessions;
      } else if (comps.length > 0) {
        const first = comps[0].timestamp ? Date.parse(comps[0].timestamp) : NaN;
        const last = comps[comps.length - 1].timestamp
          ? Date.parse(comps[comps.length - 1].timestamp)
          : NaN;
        if (Number.isFinite(first) && Number.isFinite(last) && last > first) {
          durationSeconds = Math.floor((last - first) / 1000);
        } else {
          durationSeconds = null;
        }
      }

      return {
        date,
        durationSeconds,
        hoursText: secondsToHhMm(durationSeconds),
        sessions: sessions.length
          ? sessions.map((s) => ({
              start: s.start,
              end: s.end,
              durationSeconds: s.durationSeconds,
            }))
          : undefined,
        outcomesSummary: outcomes,
        addresses: comps.map((c) => ({
          index: c.index,
          address: c.address,
          // coerce null to undefined to satisfy type
          lat: c.lat ?? undefined,
          lng: c.lng ?? undefined,
          outcome: c.outcome,
          amount: c.amount,
          timestamp: c.timestamp,
        })),
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    days,
  };
}

function groupByDay(completions: Completion[]) {
  const map: Record<string, Completion[]> = {};
  for (const c of completions) {
    const day = (c.timestamp || "").slice(0, 10);
    if (!day) continue;
    (map[day] ??= []).push(c);
  }
  return map;
}

function summarizeOutcomes(comps: Completion[]) {
  const counts: Record<Outcome | string, number> = { PIF: 0, Done: 0, DA: 0 };
  for (const c of comps) counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
  return counts;
}

function sumSessionSeconds(sessions: DaySession[]) {
  let total = 0;
  for (const s of sessions) {
    if (typeof s.durationSeconds === "number" && s.durationSeconds > 0) {
      total += s.durationSeconds;
    } else if (s.start && s.end) {
      const start = Date.parse(s.start);
      const end = Date.parse(s.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        total += Math.floor((end - start) / 1000);
      }
    }
  }
  return total;
}

function secondsToHhMm(sec: number | null) {
  if (!sec || sec <= 0) return "N/A";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
