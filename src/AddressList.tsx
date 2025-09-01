// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome, AddressRow, Completion } from "./types";
import { AddressCard } from "./AddressCard";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
  filterText: string;
  ensureDayStarted: () => void;
};

function makeMapsHref(row: AddressRow) {
  if (
    typeof row.lat === "number" &&
    typeof row.lng === "number" &&
    !Number.isNaN(row.lat) &&
    !Number.isNaN(row.lng)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${row.lat},${row.lng}`
    )}`;
  }
  const q = encodeURIComponent(row?.address ?? "");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function AddressList({
  state,
  setActive,
  cancelActive,
  onComplete,
  onCreateArrangement,
  filterText,
  ensureDayStarted,
}: Props) {
  const items = state.addresses ?? [];
  const completions: Completion[] = state.completions ?? [];
  const currentLV = state.currentListVersion;

  /**
   * ✅ FIX: Only hide completions that are explicitly tagged
   * with the current list version. Legacy completions without
   * listVersion are ignored (i.e., they won’t hide items in the new list).
   */
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of completions) {
      if (c && typeof c.index !== "undefined" && c.listVersion === currentLV) {
        set.add(Number(c.index));
      }
    }
    return set;
  }, [completions, currentLV]);

  // Prepare [row, originalIndex] tuples so we can filter safely
  // without losing the original index (which completions use).
  const tuples = React.useMemo(
    () => items.map((row, index) => ({ row, index })),
    [items]
  );

  const normalizedQuery = filterText.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    if (!normalizedQuery) return tuples;
    return tuples.filter(({ row }) => {
      const a = (row.address ?? "").toLowerCase();
      const p = (row.postcode ?? "").toLowerCase();
      return a.includes(normalizedQuery) || p.includes(normalizedQuery);
    });
  }, [tuples, normalizedQuery]);

  // Hide only those indices completed in *this* list version
  const visible = React.useMemo(
    () => filtered.filter(({ index }) => !completedIdx.has(index)),
    [filtered, completedIdx]
  );

  const handleNavigate = React.useCallback(
    (originalIndex: number) => {
      // Optionally: auto-start day on first navigate
      if (!state.day?.startTime) {
        ensureDayStarted();
      }
      setActive(originalIndex);
    },
    [ensureDayStarted, setActive, state.day?.startTime]
  );

  const handleComplete = React.useCallback(
    (originalIndex: number, outcome: Outcome, amount?: string) => {
      // Delegate to parent. Ensure your write path stamps listVersion (see note below).
      onComplete(originalIndex, outcome, amount);
    },
    [onComplete]
  );

  return (
    <div className="address-list">
      {visible.map(({ row, index: originalIndex }) => (
        <AddressCard
          key={row.id ?? originalIndex}
          index={originalIndex}
          row={row}
          mapsHref={makeMapsHref(row)}
          setActive={() => handleNavigate(originalIndex)}
          cancelActive={cancelActive}
          onComplete={(outcome, amount) => handleComplete(originalIndex, outcome, amount)}
          onCreateArrangement={() => onCreateArrangement(originalIndex)}
        />
      ))}
      {visible.length === 0 && (
        <div className="p-4 text-sm opacity-70">
          No results. Try clearing filters or check if all current-list items are completed.
        </div>
      )}
    </div>
  );
}

export default AddressList;
