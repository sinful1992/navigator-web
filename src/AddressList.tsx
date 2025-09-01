// src/AddressList.tsx
import * as React from "react";
import { Virtuoso } from "react-virtuoso";
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

/** Only the indices completed for the *current* list version. */
function getCompletedIdxForCurrentVersion(
  completions: Completion[] | undefined,
  currentLV: number
) {
  const set = new Set<number>();
  if (!completions?.length) return set;
  for (const c of completions) {
    if (c && typeof c.index !== "undefined" && c.listVersion === currentLV) {
      set.add(Number(c.index));
    }
  }
  return set;
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
  const completions = state.completions ?? [];
  const currentLV = state.currentListVersion;

  const completedIdx = React.useMemo(
    () => getCompletedIdxForCurrentVersion(completions, currentLV),
    [completions, currentLV]
  );

  // Keep original index for stable references (completions use original index)
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
      // Auto-start the day on first navigate if not already started
      if (!state.day?.startTime) {
        ensureDayStarted();
      }
      setActive(originalIndex);
    },
    [ensureDayStarted, setActive, state.day?.startTime]
  );

  const handleComplete = React.useCallback(
    (originalIndex: number, outcome: Outcome, amount?: string) => {
      onComplete(originalIndex, outcome, amount);
    },
    [onComplete]
  );

  const itemContent = React.useCallback(
    (i: number) => {
      const { row, index: originalIndex } = visible[i];
      return (
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
      );
    },
    [visible, cancelActive, handleComplete, handleNavigate, onCreateArrangement]
  );

  if (!items.length) {
    return (
      <div className="p-4 text-sm opacity-70">
        No addresses loaded yet. Import a list to begin.
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="p-4 text-sm opacity-70">
        No results to show. Clear filters or check if all current-list items are completed.
      </div>
    );
  }

  return (
    <Virtuoso
      totalCount={visible.length}
      itemContent={itemContent}
      useWindowScroll
      increaseViewportBy={{ top: 400, bottom: 600 }} // smoother near edges
    />
  );
}

export default AddressList;
