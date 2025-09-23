import { describe, expect, it } from "vitest";
import { mergeStatePreservingActiveIndex } from "./useCloudSync";
import type { AppState } from "./types";

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
  it("adopts incoming addresses when a higher version snapshot initially lacked data", () => {
    const localState = createState({
      addresses: [
        { address: "123 Main St" },
        { address: "456 Oak St" },
      ],
      currentListVersion: 1,
    });

    const higherVersionWithoutAddresses = createState({
      addresses: [],
      currentListVersion: 2,
    });

    const afterEmptyMerge = mergeStatePreservingActiveIndex(
      localState,
      higherVersionWithoutAddresses
    );

    expect(afterEmptyMerge.addresses).toEqual(localState.addresses);
    expect(afterEmptyMerge.currentListVersion).toBe(localState.currentListVersion);

    const populatedSameVersionSnapshot = createState({
      addresses: [{ address: "789 Pine St" }],
      currentListVersion: 2,
    });

    const afterPopulatedMerge = mergeStatePreservingActiveIndex(
      afterEmptyMerge,
      populatedSameVersionSnapshot
    );

    expect(afterPopulatedMerge.addresses).toEqual(
      populatedSameVersionSnapshot.addresses
    );
    expect(afterPopulatedMerge.currentListVersion).toBe(2);
  });
});
