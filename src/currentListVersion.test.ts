import { describe, expect, it } from "vitest";

import { normalizeState } from "./utils/normalizeState";
import { mergeStatePreservingActiveIndex } from "./useCloudSync";
import { applyCompletionLedger } from "./useAppState";
import type { AppState, CompletionLedgerEntry } from "./types";

describe("list version normalization", () => {
  function computeHiddenIndices(state: AppState): Set<number> {
    const completions = Array.isArray(state.completions) ? state.completions : [];
    const hidden = new Set<number>();

    for (const completion of completions) {
      const listVersion =
        typeof completion?.listVersion === "number"
          ? completion.listVersion
          : state.currentListVersion;

      if (listVersion === state.currentListVersion) {
        hidden.add(Number(completion.index));
      }
    }

    return hidden;
  }

  it("keeps current completions hidden when restoring a string list version", () => {
    const rawState = {
      addresses: [
        { address: "1 Test Street" },
        { address: "2 Example Road" },
      ],
      completions: [
        {
          index: 0,
          address: "1 Test Street",
          outcome: "Done",
          timestamp: "2024-02-01T10:00:00.000Z",
          listVersion: 2,
        },
        {
          index: 1,
          address: "2 Example Road",
          outcome: "Done",
          timestamp: "2024-01-30T17:00:00.000Z",
          listVersion: 1,
        },
      ],
      currentListVersion: "2",
    } as const;

    const normalized = normalizeState(rawState);

    expect(normalized.currentListVersion).toBe(2);
    expect(typeof normalized.currentListVersion).toBe("number");

    const hidden = computeHiddenIndices(normalized as AppState);

    expect(hidden.has(0)).toBe(true);
    expect(hidden.has(1)).toBe(false);
  });

  it("preserves numeric list versions for historical completions when normalizing", () => {
    const rawState = {
      addresses: [{ address: "1 Test Street" }],
      completions: [
        {
          index: 0,
          address: "1 Test Street",
          outcome: "Done",
          timestamp: "2024-01-01T00:00:00.000Z",
          listVersion: "3",
        },
      ],
      currentListVersion: "5",
    } as const;

    const normalized = normalizeState(rawState) as AppState;

    expect(normalized.currentListVersion).toBe(5);
    expect(normalized.completions[0]?.listVersion).toBe(3);
    expect(typeof normalized.completions[0]?.listVersion).toBe("number");
  });

  it("merges multi-device state without promoting older completion versions", () => {
    const baseState = normalizeState({
      addresses: [{ address: "1" }],
      completions: [
        {
          index: 0,
          address: "1",
          outcome: "Done",
          timestamp: "2024-02-01T10:00:00.000Z",
          listVersion: 5,
        },
        {
          index: 1,
          address: "2",
          outcome: "Done",
          timestamp: "2024-01-10T12:00:00.000Z",
          listVersion: 4,
        },
      ],
      currentListVersion: 5,
    }) as AppState;

    const incomingState = normalizeState({
      addresses: [{ address: "1" }],
      completions: [
        {
          index: 2,
          address: "3",
          outcome: "Done",
          timestamp: "2024-02-02T08:00:00.000Z",
          listVersion: "5",
        },
        {
          index: 3,
          address: "4",
          outcome: "Done",
          timestamp: "2024-01-05T08:00:00.000Z",
          listVersion: "3",
        },
      ],
      currentListVersion: "5",
    }) as AppState;

    const merged = mergeStatePreservingActiveIndex(baseState, incomingState);

    const versions = merged.completions.map((c) => c.listVersion);

    expect(merged.currentListVersion).toBe(5);
    expect(versions).toContain(5);
    expect(versions).toContain(4);
    expect(versions).toContain(3);
    expect(versions.every((v) => typeof v === "number")).toBe(true);
  });

  it("never downgrades the active list version when merging older cloud state", () => {
    const baseState = normalizeState({
      addresses: [
        { address: "1" },
        { address: "2" },
      ],
      completions: [
        {
          index: 0,
          address: "1",
          outcome: "Done",
          timestamp: "2024-02-01T10:00:00.000Z",
          listVersion: 4,
        },
      ],
      currentListVersion: 4,
    }) as AppState;

    const incomingState = normalizeState({
      addresses: [
        { address: "1" },
        { address: "2" },
      ],
      completions: [],
      currentListVersion: 2,
    }) as AppState;

    const merged = mergeStatePreservingActiveIndex(baseState, incomingState);

    expect(merged.currentListVersion).toBe(4);
    expect(
      merged.completions.every((completion) => completion.listVersion === 4)
    ).toBe(true);
  });

  it("prefers the newest completion event for the same address across devices", () => {
    const listVersion = 6;
    const baseCompletion = {
      index: 0,
      address: "1 High Street",
      outcome: "Done" as const,
      timestamp: "2024-03-10T08:07:21.000Z",
      listVersion,
    };

    const freshLedger: CompletionLedgerEntry = {
      index: 0,
      listVersion,
      status: "completed",
      eventTimestamp: baseCompletion.timestamp,
      completion: baseCompletion,
    };

    const baseState = applyCompletionLedger({
      addresses: [{ address: "1 High Street" }],
      completions: [baseCompletion],
      completionLedger: [freshLedger],
      arrangements: [],
      daySessions: [],
      activeIndex: null,
      currentListVersion: listVersion,
    } as AppState);

    const staleCompletion = {
      ...baseCompletion,
      timestamp: "2024-03-10T08:05:00.000Z",
    };

    const staleLedger: CompletionLedgerEntry = {
      index: 0,
      listVersion,
      status: "completed",
      eventTimestamp: staleCompletion.timestamp,
      completion: staleCompletion,
    };

    const incomingState = applyCompletionLedger({
      addresses: [{ address: "1 High Street" }],
      completions: [staleCompletion],
      completionLedger: [staleLedger],
      arrangements: [],
      daySessions: [],
      activeIndex: null,
      currentListVersion: listVersion,
    } as AppState);

    const merged = mergeStatePreservingActiveIndex(baseState, incomingState);

    expect(merged.completions).toHaveLength(1);
    expect(merged.completions[0]?.timestamp).toBe(baseCompletion.timestamp);
  });

  it("honors a newer undo event even if another device still has the completion", () => {
    const listVersion = 7;
    const completion = {
      index: 1,
      address: "2 Oak Lane",
      outcome: "Done" as const,
      timestamp: "2024-03-11T09:00:00.000Z",
      listVersion,
    };

    const completionLedgerEntry: CompletionLedgerEntry = {
      index: 1,
      listVersion,
      status: "completed",
      eventTimestamp: completion.timestamp,
      completion,
    };

    const baseState = applyCompletionLedger({
      addresses: [{ address: "2 Oak Lane" }],
      completions: [completion],
      completionLedger: [completionLedgerEntry],
      arrangements: [],
      daySessions: [],
      activeIndex: null,
      currentListVersion: listVersion,
    } as AppState);

    const undoLedgerEntry: CompletionLedgerEntry = {
      index: 1,
      listVersion,
      status: "undone",
      eventTimestamp: "2024-03-11T09:05:00.000Z",
      completion,
    };

    const incomingState = applyCompletionLedger({
      addresses: [{ address: "2 Oak Lane" }],
      completions: [completion],
      completionLedger: [undoLedgerEntry],
      arrangements: [],
      daySessions: [],
      activeIndex: null,
      currentListVersion: listVersion,
    } as AppState);

    const merged = mergeStatePreservingActiveIndex(baseState, incomingState);

    expect(merged.completions).toHaveLength(0);
    expect(merged.completionLedger?.find((entry) => entry.index === 1)?.status).toBe(
      "undone"
    );
  });
});
