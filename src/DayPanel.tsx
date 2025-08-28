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

function getTodayOutcomes(comps: Completion[]) {
  const today = new Date();
  const todayComps = comps.filter((c) => isSameDay(parseISO(c.timestamp), today));
  
  const outcomes = { PIF: 0, Done: 0, DA: 0 };
  todayComps.forEach(c => {
    outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
  });
  
  return outcomes;
}

function formatDuration(start: string) {
  const startTime = new Date(start);
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
};

export const DayPanel: React.FC<Props> = ({ sessions, completions, startDay, endDay }) => {
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const active = activeSession(sessions);
  const todayCount = countToday(completions);
  const todayOutcomes = getTodayOutcomes(completions);

  // Update time every minute when session is active
  React.useEffect(() => {
    if (!active) return;
    
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className={`day-panel ${active ? 'day-panel-active' : ''}`}>
      <div className="day-panel-content">
        {active ? (
          <>
            <div className="day-panel-info">
              <div className="stat-item">
                <div className="stat-label">🕐 Started</div>
                <div className="stat-value" style={{ fontSize: "1.125rem" }}>
                  {format(parseISO(active.start), "HH:mm")}
                </div>
              </div>
              
              <div className="stat-item">
                <div className="stat-label">⏱️ Duration</div>
                <div className="stat-value" style={{ fontSize: "1.125rem" }}>
                  {formatDuration(active.start)}
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-label">📍 Completed Today</div>
                <div className="stat-value" style={{ fontSize: "1.125rem" }}>
                  {todayCount}
                </div>
              </div>

              {todayCount > 0 && (
                <div className="stat-item">
                  <div className="stat-label">📊 Today's Mix</div>
                  <div style={{ 
                    display: "flex", 
                    gap: "0.5rem", 
                    fontSize: "0.875rem",
                    fontWeight: 600
                  }}>
                    {todayOutcomes.PIF > 0 && (
                      <span className="pill pill-pif" style={{ fontSize: "0.75rem" }}>
                        💰 {todayOutcomes.PIF}
                      </span>
                    )}
                    {todayOutcomes.Done > 0 && (
                      <span className="pill pill-done" style={{ fontSize: "0.75rem" }}>
                        ✅ {todayOutcomes.Done}
                      </span>
                    )}
                    {todayOutcomes.DA > 0 && (
                      <span className="pill pill-da" style={{ fontSize: "0.75rem" }}>
                        ❌ {todayOutcomes.DA}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="day-panel-actions">
              <button className="btn btn-danger" onClick={endDay}>
                🛑 End Day
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "0.75rem",
              flex: 1
            }}>
              <div style={{ 
                width: "3rem", 
                height: "3rem",
                borderRadius: "50%",
                background: "var(--bg-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem"
              }}>
                ⏰
              </div>
              <div>
                <div style={{ 
                  fontWeight: 700, 
                  fontSize: "1.125rem",
                  color: "var(--text-primary)",
                  marginBottom: "0.25rem"
                }}>
                  Ready to start your day?
                </div>
                <div style={{ 
                  color: "var(--text-secondary)", 
                  fontSize: "0.875rem" 
                }}>
                  Track your time and progress with day sessions
                </div>
              </div>
            </div>

            <div className="day-panel-actions">
              <button className="btn btn-primary" onClick={startDay}>
                🚀 Start Day
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};