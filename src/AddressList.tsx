// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome, AddressRow, Completion } from "./types";

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

/** Only hide indices completed for the *current* list version. */
function completedForCurrent(completions: Completion[] | undefined, currentLV: number) {
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
    () => completedForCurrent(completions, currentLV),
    [completions, currentLV]
  );

  const tuples = React.useMemo(() => items.map((row, index) => ({ row, index })), [items]);
  const q = filterText.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    if (!q) return tuples;
    return tuples.filter(({ row }) => {
      const a = (row.address ?? "").toLowerCase();
      const p = (row.postcode ?? "").toLowerCase();
      return a.includes(q) || p.includes(q);
    });
  }, [tuples, q]);

  const visible = React.useMemo(
    () => filtered.filter(({ index }) => !completedIdx.has(index)),
    [filtered, completedIdx]
  );

  const [pifAmount, setPifAmount] = React.useState<string>("");

  if (!items.length) {
    return (
      <div className="empty-box">
        <div>No addresses yet</div>
        <div>Import a list to begin.</div>
      </div>
    );
  }
  if (!visible.length) {
    return (
      <div className="empty-box">
        <div>No results</div>
        <div>Clear the search or all visible items may be completed.</div>
      </div>
    );
  }

  return (
    <div className="list">
      {visible.map(({ row, index }) => {
        const isActive = state.activeIndex === index;
        const mapsHref = makeMapsHref(row);

        return (
          <div key={row.id ?? index} className={`row-card ${isActive ? "card-active" : ""}`}>
            {/* Row head */}
            <div className="row-head">
              <div className="row-index">{index + 1}</div>
              <div className="row-title" title={row.address ?? ""}>
                {row.address ?? "(no address)"}{" "}
                {row.postcode ? <span style={{ color: "var(--text-secondary)" }}> · {row.postcode}</span> : null}
                {isActive && <span className="active-badge">Active</span>}
              </div>
              <div className="row-actions">
                <a
                  className="btn btn-outline btn-sm"
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Maps"
                  onClick={() => {
                    if (!state.day?.startTime) {
                      // auto-start day when navigating first time
                      ensureDayStarted();
                    }
                  }}
                >
                  🧭 Navigate
                </a>

                {!isActive ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setActive(index)}>
                    ▶️ Set Active
                  </button>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={cancelActive}>
                    ✖ Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Completion bar */}
            <div className="card-body">
              <div className="complete-bar">
                <div className="complete-btns">
                  <button
                    className="btn btn-success"
                    onClick={() => onComplete(index, "DA")}
                    title="Door answered / agreed action"
                  >
                    👍 DA
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      // Mark outcome as ARR and open/create arrangement for this address
                      onComplete(index, "ARR");
                      onCreateArrangement(index);
                    }}
                    title="Payment arrangement"
                  >
                    📅 ARR
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => onComplete(index, "DONE")}
                    title="No further action"
                  >
                    ✅ Done
                  </button>
                </div>

                <div className="pif-group">
                  <input
                    className="input amount-input"
                    placeholder="£ Amount"
                    value={pifAmount}
                    onChange={(e) => setPifAmount(e.target.value)}
                    inputMode="decimal"
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => onComplete(index, "PIF", pifAmount || undefined)}
                    title="Save PIF amount"
                  >
                    💷 Save PIF
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AddressList;
