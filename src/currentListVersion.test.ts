import { describe, expect, it } from "vitest";

import { normalizeState } from "./utils/normalizeState";
import { mergeStatePreservingActiveIndex } from "./useCloudSync";
import type { AppState } from "./types";

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
});
