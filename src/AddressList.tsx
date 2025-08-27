import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (idx: number) => void;
  cancelActive: () => void;
  complete: (idx: number, outcome: Outcome, amount?: string) => void;
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  filterText = "",
}: Props) {
  const completedSet = React.useMemo(
    () => new Set(state.completions.map((c) => c.index)),
    [state.completions]
  );

  const rows = state.addresses
    .map((a, i) => ({ ...a, __i: i }))
    .filter((r) => !completedSet.has(r.__i))
    .filter((r) =>
      filterText.trim()
        ? r.address.toLowerCase().includes(filterText.trim().toLowerCase())
        : true
    );

  const openMaps = (addr: string, lat?: number, lng?: number) => {
    const url =
      lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            addr
          )}`;
    window.open(url, "_blank");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 && (
        <div style={{ opacity: 0.7, textAlign: "center" }}>
          No addresses match your search.
        </div>
      )}

      {rows.map((row) => {
        const i = row.__i as number;
        const isActive = state.activeIndex === i;

        return (
          <div key={i} className="card">
            {/* Left column: content */}
            <div>
              <div className="card-title">
                {i + 1}. {row.address}
              </div>
              {(row.lat != null || row.lng != null) && (
                <div className="card-gps">
                  GPS: {row.lat ?? "?"}, {row.lng ?? "?"}
                </div>
              )}
            </div>

            {/* Right column: actions (always aligned to the right) */}
            <div className="card-actions">
              <button
                className="btn"
                onClick={() =>
                  openMaps(row.address, row.lat ?? undefined, row.lng ?? undefined)
                }
              >
                Navigate
              </button>

              {!isActive ? (
                <button className="btn" onClick={() => setActive(i)}>
                  Set Active
                </button>
              ) : (
                <>
                  <button className="btn" onClick={cancelActive}>
                    Cancel
                  </button>
                  <button className="btn" onClick={() => complete(i, "Done")}>
                    Done
                  </button>
                  <button className="btn" onClick={() => complete(i, "DA")}>
                    DA
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const amt = window.prompt("Enter PIF amount (£):", "");
                      if (amt && amt.trim()) complete(i, "PIF", amt.trim());
                    }}
                  >
                    PIF £
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}