import { describe, expect, it } from "vitest";

import { normalizeState } from "./utils/normalizeState";
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
});
