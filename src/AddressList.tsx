// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome, AddressRow } from "./types";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  complete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
  filterText: string;
  ensureDayStarted: () => void; // ✅ new
};

function makeMapsHref(row: AddressRow) {
  if (typeof row.lat === "number" && typeof row.lng === "number" && !Number.isNaN(row.lat) && !Number.isNaN(row.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.lat},${row.lng}`)}`;
  }
  const q = encodeURIComponent(row?.address ?? "");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  onCreateArrangement,
  filterText,
  ensureDayStarted,
}: Props) {
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const activeIndex = state.activeIndex;

  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of completions) {
      if (c && c.listVersion === state.currentListVersion) set.add(Number(c.index));
    }
    return set;
  }, [completions, state.currentListVersion]);

  const lowerQ = (filterText ?? "").trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !lowerQ || (a.address ?? "").toLowerCase().includes(lowerQ))
        .filter(({ i }) => !completedIdx.has(i)),
    [addresses, lowerQ, completedIdx]
  );

  const [outcomeOpenFor, setOutcomeOpenFor] = React.useState<number | null>(null);
  const [pifAmount, setPifAmount] = React.useState<string>("");

  React.useEffect(() => {
    if (activeIndex === null) {
      setOutcomeOpenFor(null);
      setPifAmount("");
    }
  }, [activeIndex]);

  if (visible.length === 0) {
    return (
      <div className="empty-box">
        <div>No pending addresses</div>
        <p>Import a list or clear filters to see items.</p>
      </div>
    );
  }

  return (
    <div className="list">
      {visible.map(({ a, i }) => {
        const isActive = activeIndex === i;
        const mapHref = makeMapsHref(a);

        return (
          <div key={i} className={`row-card ${isActive ? "card-active" : ""}`}>
            <div className="row-head">
              <div className="row-index">{i + 1}</div>
              <div className="row-title" title={a.address}>{a.address}</div>
              {isActive && <span className="active-badge">Active</span>}
            </div>

            <div className="row-actions">
              <a
                className="btn btn-outline btn-sm"
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                title="Open in Google Maps"
                onClick={() => ensureDayStarted()} // ✅ auto-start on first navigate of the day
              >
                🧭 Navigate
              </a>

              {!isActive ? (
                <button className="btn btn-primary btn-sm" onClick={() => setActive(i)}>
                  ▶️ Set Active
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={cancelActive}>
                  ❎ Cancel
                </button>
              )}

              {isActive && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => {
                    const willOpen = outcomeOpenFor !== i;
                    setOutcomeOpenFor(willOpen ? i : null);
                    setPifAmount("");
                  }}
                >
                  ✅ Complete
                </button>
              )}
            </div>

            {isActive && outcomeOpenFor === i && (
              <div className="card-body">
                <div className="complete-bar">
                  <div className="complete-btns">
                    <button className="btn btn-success" onClick={() => { complete(i, "Done"); setOutcomeOpenFor(null); }}>
                      ✅ Done
                    </button>
                    <button className="btn btn-danger" onClick={() => { complete(i, "DA"); setOutcomeOpenFor(null); }}>
                      🚫 DA
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        complete(i, "ARR");
                        setOutcomeOpenFor(null);
                        onCreateArrangement(i);
                      }}
                    >
                      📅 Arrangement
                    </button>
                  </div>

                  <div className="pif-group">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="input amount-input"
                      placeholder="PIF £"
                      value={pifAmount}
                      onChange={(e) => setPifAmount(e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const n = Number(pifAmount);
                        if (!Number.isFinite(n) || n <= 0) {
                          alert("Enter a valid PIF amount (e.g. 50)");
                          return;
                        }
                        complete(i, "PIF", n.toFixed(2));
                        setOutcomeOpenFor(null);
                      }}
                    >
                      💷 Save PIF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}