// src/DayPanel.tsx - FIXED VERSION - Removed conflicting styles
import * as React from "react";
import type { DaySession, Completion, Outcome } from "./types";
import { useBackupLoading } from "./hooks/useBackupLoading";
import { useSettings } from "./hooks/useSettings";
import { Modal } from "./components/Modal";
import { LoadingSpinner } from "./components/LoadingButton";

import { logger } from './utils/logger';

// ElapsedTimer component - shows live elapsed time
function ElapsedTimer({ startISO }: { startISO: string }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const updateElapsed = () => {
      const start = new Date(startISO).getTime();
      const now = Date.now();
      const seconds = Math.floor((now - start) / 1000);
      setElapsed(seconds);
    };

    // Update immediately
    updateElapsed();

    // Update every second
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startISO]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  return (
    <span className="elapsed-timer">
      ⏱️ {hours}h {minutes.toString().padStart(2, '0')}m {seconds.toString().padStart(2, '0')}s
    </span>
  );
}

type Props = {
  sessions: DaySession[];
  completions: Completion[];
  startDay: () => void;
  endDay: () => void;
  /** Called with a Date or ISO string. App will update (or create) today's session start. */
  onEditStart: (newStart: string | Date) => void;
  /** Called with a Date or ISO string. App will update (or create) today's session end. */
  onEditEnd: (newEnd: string | Date) => void;
  /** Optional backup function called when ending day if backup is enabled */
  onBackup?: () => Promise<void>;
};

// 🔧 FIXED: Create local time instead of UTC
function toISO(dateStr: string, timeStr: string) {
  // dateStr "YYYY-MM-DD"; timeStr "HH:MM"
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  try {
    // ✅ Use local time constructor instead of Date.UTC()
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
    return dt.toISOString();
  } catch {
    return "";
  }
}

// 🔧 FIXED: Extract time in local timezone
function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    // ✅ Use toLocaleTimeString to respect local timezone
    return d.toLocaleTimeString("en-GB", { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/London'
    });
  } catch {
    return "—";
  }
}

// 🔧 FIXED: Convert ISO to local time for form inputs
function isoToLocalTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

function isoToLocalDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

const DayPanelComponent = function DayPanel({
  sessions,
  completions,
  startDay,
  endDay,
  onEditStart,
  onEditEnd,
  onBackup,
}: Props) {
  const { settings } = useSettings();
  const { isLoading, executeBackup, forceReset } = useBackupLoading();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Prefer an active session; else the most recent for today
  const todaySessions = sessions.filter((s) => s.date === todayStr);
  const active = todaySessions.find((s) => !s.end) || null;
  const latestToday =
    active ||
    todaySessions.slice().sort((a, b) => {
      const ta = new Date(a.start || a.date + "T00:00:00.000Z").getTime();
      const tb = new Date(b.start || b.date + "T00:00:00.000Z").getTime();
      return tb - ta;
    })[0];

  const isActive = !!active;

  // Enhanced end day function with backup functionality and timeout protection
  const handleEndDay = async () => {
    try {
      if (settings.backupOnEndOfDay && onBackup) {
        await executeBackup(onBackup);
      }
      endDay();
    } catch (error) {
      logger.error('Failed to complete backup during end day:', error);
      // CRITICAL FIX: Always end the day even if backup fails/times out
      // This prevents permanent button disable on backup failure
      endDay();
    }
  };

  // Today's completions summary
  const todays = completions.filter((c) => (c.timestamp || "").slice(0, 10) === todayStr);
  const outcomeCounts = todays.reduce<Record<Outcome, number>>(
    (acc, c) => {
      if (c.outcome === "PIF" || c.outcome === "DA" || c.outcome === "Done" || c.outcome === "ARR") {
        acc[c.outcome] += 1;
      }
      return acc;
    },
    { PIF: 0, DA: 0, Done: 0, ARR: 0 }
  );

  // --- Edit start controls ---
  const [editingStart, setEditingStart] = React.useState(false);
  const [startDate, setStartDate] = React.useState<string>(todayStr);
  const [startTime, setStartTime] = React.useState<string>(() => {
    if (latestToday?.start) {
      return isoToLocalTime(latestToday.start);
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    if (latestToday?.start) {
      setStartDate(isoToLocalDate(latestToday.start) || latestToday.date);
      setStartTime(isoToLocalTime(latestToday.start));
    } else {
      setStartDate(todayStr);
      const now = new Date();
      setStartTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [latestToday?.start, latestToday?.date, todayStr]);

  const saveStart = React.useCallback(() => {
    const iso = toISO(startDate, startTime);
    if (iso) onEditStart(iso);
    setEditingStart(false);
  }, [startDate, startTime, onEditStart]);

  // --- Edit finish controls ---
  const [editingEnd, setEditingEnd] = React.useState(false);
  const [endDate, setEndDate] = React.useState<string>(todayStr);
  const [endTime, setEndTime] = React.useState<string>(() => {
    if (latestToday?.end) {
      return isoToLocalTime(latestToday.end);
    }
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  React.useEffect(() => {
    if (latestToday?.end) {
      setEndDate(isoToLocalDate(latestToday.end) || latestToday.date);
      setEndTime(isoToLocalTime(latestToday.end));
    } else {
      setEndDate(todayStr);
      const now = new Date();
      setEndTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    }
  }, [latestToday?.end, latestToday?.date, todayStr]);

  const saveEnd = React.useCallback(() => {
    const iso = toISO(endDate, endTime);
    if (iso) onEditEnd(iso);
    setEditingEnd(false);
  }, [endDate, endTime, onEditEnd]);

  return (
    <div className={`day-panel-modern ${isActive ? "day-panel-active" : ""}`}>
      <div className="day-panel-header">
        <div className="day-status">
          <div className="day-status-icon">
            {isActive ? "🟢" : latestToday ? "🔴" : "⚫"}
          </div>
          <div className="day-status-text">
            <div className="day-status-title">
              {isActive ? "Day Running" : latestToday ? "Day Completed" : "No Session Today"}
            </div>
            <div className="day-status-subtitle">
              {latestToday?.start ? (
                <>
                  {fmtTime(latestToday.start)}
                  {latestToday?.end && (
                    <> → {fmtTime(latestToday.end)}</>
                  )}
                  {isActive && !latestToday?.end && latestToday.start && (
                    <> • <ElapsedTimer startISO={latestToday.start} /></>
                  )}
                </>
              ) : (
                "Click 'Start Day' to begin tracking"
              )}
            </div>
          </div>
        </div>

        {/* Today's quick stats */}
        <div className="day-stats-modern">
          <div className="stat-pill stat-pill-pif">
            <span className="stat-number">{outcomeCounts.PIF}</span>
            <span className="stat-label">PIF</span>
          </div>
          <div className="stat-pill stat-pill-done">
            <span className="stat-number">{outcomeCounts.Done}</span>
            <span className="stat-label">Done</span>
          </div>
          <div className="stat-pill stat-pill-da">
            <span className="stat-number">{outcomeCounts.DA}</span>
            <span className="stat-label">DA</span>
          </div>
          <div className="stat-pill stat-pill-arr">
            <span className="stat-number">{outcomeCounts.ARR}</span>
            <span className="stat-label">ARR</span>
          </div>
        </div>
      </div>

      <div className="day-panel-actions">
        <div className="primary-actions">
          {!isActive ? (
            <button className="btn btn-primary btn-modern" onClick={startDay}>
              <span className="btn-icon">▶️</span>
              Start Day
            </button>
          ) : (
            <button
              className="btn btn-danger btn-modern"
              onClick={handleEndDay}
              disabled={isLoading}
            >
              <span className="btn-icon">{isLoading ? "⏳" : "⏹️"}</span>
              {isLoading ? "Ending Day..." : "End Day"}
            </button>
          )}
        </div>

        <div className="edit-actions">
          {/* Edit START */}
          {!editingStart ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingStart(true)} title="Edit today's start time">
              ✏️ Edit start
            </button>
          ) : (
            <div className="day-edit-group">
              <input
                id="start-date"
                name="startDate"
                type="date"
                className="input input-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                autoComplete="off"
              />
              <input
                id="start-time"
                name="startTime"
                type="time"
                className="input input-sm"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                autoComplete="off"
              />
              <button className="btn btn-primary btn-sm" onClick={saveStart}>💾</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingStart(false)}>✕</button>
            </div>
          )}

          {/* Edit END */}
          {!editingEnd ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingEnd(true)} title="Edit today's finish time">
              ✏️ Edit finish
            </button>
          ) : (
            <div className="day-edit-group">
              <input
                id="end-date"
                name="endDate"
                type="date"
                className="input input-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                autoComplete="off"
              />
              <input
                id="end-time"
                name="endTime"
                type="time"
                className="input input-sm"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                autoComplete="off"
              />
              <button className="btn btn-primary btn-sm" onClick={saveEnd}>💾</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingEnd(false)}>✕</button>
            </div>
          )}
        </div>
      </div>

      {/* Loading Modal for Backup with Emergency Escape */}
      <Modal
        isOpen={isLoading}
        onClose={() => {
          // CRITICAL FIX: Allow emergency escape - graceful reset instead of page reload
          logger.warn('Emergency backup escape triggered by user');
          forceReset(); // Graceful reset of loading state
        }}
        title="Backing up data"
        showCloseButton={true} // CRITICAL FIX: Allow escape mechanism
        size="sm"
      >
        <div className="backup-loading-modal">
          <div className="backup-loading-content">
            <LoadingSpinner size="lg" />
            <h3 className="backup-loading-title">
              Backing up data, please wait...
            </h3>
            <p className="backup-loading-message">
              This usually takes 5-15 seconds. If stuck for more than 20 seconds, you can close this dialog to continue.
            </p>
            <div className="backup-loading-warning" style={{
              marginTop: '1rem',
              fontSize: '0.9rem',
              color: 'var(--warning)',
              textAlign: 'center'
            }}>
              ⚠️ If backup appears stuck, click the ✕ button to escape
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export const DayPanel = React.memo(DayPanelComponent);