import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { mergeStatePreservingActiveIndex } from "./useCloudSync";

const createState = (overrides: Partial<AppState>): AppState => ({
  addresses: [],
  activeIndex: null,
  completions: [],
  daySessions: [],
  arrangements: [],
  currentListVersion: 1,
  ...overrides,
});

describe("mergeStatePreservingActiveIndex", () => {
  it("keeps local addresses when incoming snapshot is newer but empty", () => {
    const localState = createState({
      addresses: [
        { address: "123 Test Street" },
        { address: "456 Another Ave" },
      ],
      currentListVersion: 1,
    });

    const incomingState = createState({
      addresses: [],
      currentListVersion: 2,
    });

    const merged = mergeStatePreservingActiveIndex(localState, incomingState);

    expect(merged.addresses).toEqual(localState.addresses);
  });

  it("prefers incoming addresses when they contain data", () => {
    const localState = createState({
      addresses: [{ address: "123 Test Street" }],
      currentListVersion: 1,
    });

    const incomingState = createState({
      addresses: [
        { address: "789 New Road" },
        { address: "1011 Updated Way" },
      ],
      currentListVersion: 2,
    });

    const merged = mergeStatePreservingActiveIndex(localState, incomingState);

    expect(merged.addresses).toEqual(incomingState.addresses);
  });
});
