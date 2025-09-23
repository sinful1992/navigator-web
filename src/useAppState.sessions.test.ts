import { describe, expect, it } from "vitest";

import { prepareEndDaySessions, prepareStartDaySessions } from "./useAppState";
import type { DaySession } from "./types";

describe("prepareStartDaySessions", () => {
  it("closes stale sessions from previous days and starts a new session", () => {
    const today = "2024-03-10";
    const now = new Date(`${today}T09:00:00.000Z`);
    const yesterday = "2024-03-09";

    const sessions: DaySession[] = [
      { date: yesterday, start: `${yesterday}T08:30:00.000Z` },
    ];

    const result = prepareStartDaySessions(sessions, today, now);

    expect(result.alreadyActive).toBe(false);
    expect(result.newSession).toBeDefined();
    expect(result.closedSessions).toHaveLength(1);
    expect(result.updatedSessions).toHaveLength(2);

    const closed = result.closedSessions[0];
    expect(closed.end).toBe(`${yesterday}T23:59:59.999Z`);
    expect(result.updatedSessions[0]).toBe(closed);
    expect(result.updatedSessions[1]).toBe(result.newSession);
  });

  it("prevents duplicate sessions when today's session is still active", () => {
    const today = "2024-03-10";
    const now = new Date(`${today}T13:00:00.000Z`);
    const yesterday = "2024-03-09";

    const todaySession: DaySession = {
      date: today,
      start: `${today}T07:45:00.000Z`,
    };

    const sessions: DaySession[] = [
      { date: yesterday, start: `${yesterday}T08:30:00.000Z` },
      todaySession,
    ];

    const result = prepareStartDaySessions(sessions, today, now);

    expect(result.alreadyActive).toBe(true);
    expect(result.newSession).toBeUndefined();
    expect(result.closedSessions).toHaveLength(1);
    expect(result.updatedSessions).toHaveLength(2);
    expect(result.updatedSessions[1]).toBe(todaySession);
  });

  it("keeps future-dated sessions open when starting today", () => {
    const today = "2024-03-10";
    const now = new Date(`${today}T09:00:00.000Z`);
    const tomorrow = "2024-03-11";

    const futureSession: DaySession = {
      date: tomorrow,
      start: `${tomorrow}T08:00:00.000Z`,
    };

    const sessions: DaySession[] = [futureSession];

    const result = prepareStartDaySessions(sessions, today, now);

    expect(result.alreadyActive).toBe(false);
    expect(result.closedSessions).toHaveLength(0);
    expect(result.newSession).toBeDefined();
    expect(result.updatedSessions).toHaveLength(2);
    expect(result.updatedSessions[0]).toBe(futureSession);
    expect(result.updatedSessions[0].end).toBeUndefined();
    expect(result.updatedSessions[1]).toBe(result.newSession);
    expect(result.newSession?.date).toBe(today);
    expect(result.newSession?.start).toBe(now.toISOString());
  });
});

describe("prepareEndDaySessions", () => {
  it("closes stale sessions and ends the latest open session for today", () => {
    const today = "2024-03-10";
    const yesterday = "2024-03-09";
    const now = new Date(`${today}T18:30:00.000Z`);

    const staleSession: DaySession = {
      date: yesterday,
      start: `${yesterday}T08:00:00.000Z`,
    };

    const previousTodaySession: DaySession = {
      date: today,
      start: `${today}T06:30:00.000Z`,
      end: `${today}T12:00:00.000Z`,
      durationSeconds: 19800,
    };

    const activeTodaySession: DaySession = {
      date: today,
      start: `${today}T13:15:00.000Z`,
    };

    const sessions: DaySession[] = [
      staleSession,
      previousTodaySession,
      activeTodaySession,
    ];

    const result = prepareEndDaySessions(sessions, today, now);

    expect(result.closedSessions).toHaveLength(1);
    const [closedStale] = result.closedSessions;
    expect(closedStale.end).toBe(`${yesterday}T23:59:59.999Z`);

    expect(result.endedSession).toBeDefined();
    expect(result.endedSession?.start).toBe(activeTodaySession.start);
    expect(result.updatedSessions).toHaveLength(3);
    expect(result.updatedSessions[2]).toBe(result.endedSession);
    expect(result.endedSession?.end).toBe(now.toISOString());
  });
});
