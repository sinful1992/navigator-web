import * as React from "react";
import type { AppState, AddressRow, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (idx: number) => void;
  cancelActive: () => void;
  complete: (idx: number, outcome: Outcome, amount?: string) => void;
  /** optional search filter */
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  filterText = "",
}: Props) {
  const pifAmounts = React.useRef<Record<number, string>>({});

  // completed indexes (we hide completed from the List view)
  const completedIdx = React.useMemo(() => {
    const s = new Set<number>();
    for (const c of state.completions) s.add(c.index);
    return s;
  }, [state.completions]);

  const filter = filterText.trim().toLowerCase();

  const rows = state.addresses
    .map((a, i) => ({ row: a, i }))
    .filter(({ row, i }) => {
      if (completedIdx.has(i)) return false;
      if (!filter) return true;
      return row.address.toLowerCase().includes(filter);
    });

  const openMaps = (r: AddressRow) => {
    const hasGps =
      typeof r.lat === "number" &&
      !isNaN(r.lat) &&
      typeof r.lng === "number" &&
      !isNaN(r.lng);

    const url = hasGps
      ? `https://www.google.com/maps/search/${r.lat},${r.lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(r.address)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="cards">
      {rows.map(({ row, i }) => {
        const isActive = state.activeIndex === i;

        return (
          <div
            key={i}
            className={`card${isActive ? " active" : ""}`}
            aria-label={`Address ${i + 1}`}
          >
            {/* TOP: number + address */}
            <div>
              <div className="card-title">
                {i + 1}. {row.address}
              </div>
              {typeof row.lat === "number" && typeof row.lng === "number" ? (
                <div className="card-gps">
                  GPS: {row.lat.toFixed(6)}, {row.lng.toFixed(6)}
                </div>
              ) : (
                <div className="card-gps">GPS: —</div>
              )}
            </div>

            {/* BOTTOM: actions */}
            <div className="card-actions">
              <button className="btn" onClick={() => openMaps(row)}>
                Navigate
              </button>

              {isActive ? (
                <>
                  <button
                    className="btn success"
                    onClick={() => complete(i, "Done")}
                  >
                    Done
                  </button>

                  <button
                    className="btn danger"
                    onClick={() => complete(i, "DA")}
                  >
                    DA
                  </button>

                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="PIF £"
                      value={pifAmounts.current[i] ?? ""}
                      onChange={(e) => {
                        pifAmounts.current[i] = e.target.value;
                        // force repaint without state; input keeps value
                        (e.target as HTMLInputElement).value =
                          pifAmounts.current[i];
                      }}
                      style={{ width: 110 }}
                    />
                    <button
                      className="btn success"
                      onClick={() => {
                        const raw = pifAmounts.current[i];
                        const n = Number(raw);
                        if (!raw || !isFinite(n) || n <= 0) {
                          alert("Enter a valid PIF amount");
                          return;
                        }
                        const amt = n.toFixed(2);
                        complete(i, "PIF", amt);
                        pifAmounts.current[i] = "";
                      }}
                    >
                      PIF
                    </button>
                  </div>

                  <button className="btn" onClick={cancelActive}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn primary" onClick={() => setActive(i)}>
                  Set Active
                </button>
              )}
            </div>
          </div>
        );
      })}

      {rows.length === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
          No addresses match your search (or all are completed).
        </p>
      )}
    </div>
  );
}