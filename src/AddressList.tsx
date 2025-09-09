// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome, AddressRow, Arrangement } from "./types";
import FullScreenArrangementForm from "./components/FullScreenArrangementForm";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
  onAddArrangement?: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  filterText: string;
  ensureDayStarted: () => void; // auto-start day on first Navigate
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

const AddressListComponent = function AddressList({
  state,
  setActive,
  cancelActive,
  onComplete,
  onCreateArrangement: _onCreateArrangement, // Keep for backward compatibility but unused
  onAddArrangement,
  onAddAddress: _onAddAddress, // Unused in current implementation
  filterText,
  ensureDayStarted,
}: Props) {
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const activeIndex = state.activeIndex;

  // Hide only items completed for the CURRENT list version.
  // If a completion has no listVersion (older backups), treat it as the current one.
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of completions) {
      const lv =
        typeof c?.listVersion === "number"
          ? c.listVersion
          : state.currentListVersion;
      if (lv === state.currentListVersion) set.add(Number(c.index));
    }
    return set;
  }, [completions, state.currentListVersion]);

  const lowerQ = (filterText ?? "").trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      addresses
        .map((a, i) => ({ a, i }))
        .filter(
          ({ a }) =>
            !lowerQ || (a.address ?? "").toLowerCase().includes(lowerQ)
        )
        .filter(({ i }) => !completedIdx.has(i)),
    [addresses, lowerQ, completedIdx]
  );

  // local UI for outcome panel & PIF
  const [outcomeOpenFor, setOutcomeOpenFor] = React.useState<number | null>(
    null
  );
  const [pifAmount, setPifAmount] = React.useState<string>("");
  
  // Arrangement form state
  const [showArrangementForm, setShowArrangementForm] = React.useState<number | null>(null);

  // closing outcomes when active changes
  React.useEffect(() => {
    if (activeIndex === null) {
      setOutcomeOpenFor(null);
      setPifAmount("");
      setShowArrangementForm(null);
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
    <>
      <div className="list">
        {visible.map(({ a, i }, displayIndex) => {
          const isActive = activeIndex === i;
          const mapHref = makeMapsHref(a);

          return (
            <div key={i} className={`row-card ${isActive ? "card-active" : ""}`}>
              {/* Row header */}
              <div className="row-head">
                <div className="row-index" title={`Display #${displayIndex + 1} (Original index ${i + 1})`}>{displayIndex + 1}</div>
                <div className="row-title" title={a.address}>
                  {a.address}
                </div>
                {isActive && <span className="active-badge">Active</span>}
              </div>

              {/* Actions row */}
              <div className="row-actions">
                <a
                  className="btn btn-outline btn-sm"
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Maps"
                  onClick={() => ensureDayStarted()}
                >
                  🧭 Navigate
                </a>

                {!isActive ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setActive(i)}
                  >
                    ▶️ Set Active
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={cancelActive}
                  >
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

              {/* Outcome bar (only when active + Complete pressed) */}
              {isActive && outcomeOpenFor === i && (
                <div className="card-body">
                  <div className="complete-bar">
                    <div className="complete-btns">
                      <button
                        className="btn btn-success"
                        onClick={() => {
                          onComplete(i, "Done");
                          setOutcomeOpenFor(null);
                        }}
                        title="Mark as Done"
                      >
                        ✅ Done
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          onComplete(i, "DA");
                          setOutcomeOpenFor(null);
                        }}
                        title="Mark as DA"
                      >
                        🚫 DA
                      </button>

                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setOutcomeOpenFor(null);
                          setShowArrangementForm(i);
                        }}
                        title="Create arrangement and mark completed"
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
                          onComplete(i, "PIF", n.toFixed(2));
                          setOutcomeOpenFor(null);
                        }}
                        title="Save PIF amount"
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
      
      {/* Full-Screen Arrangement Form - Rendered at root level for proper overlay */}
      {showArrangementForm !== null && onAddArrangement && addresses[showArrangementForm] && (
        <FullScreenArrangementForm
          address={addresses[showArrangementForm].address}
          addressIndex={showArrangementForm}
          onSave={async (arrangementData) => {
            await onAddArrangement(arrangementData);
            // Mark the address as ARR completed
            onComplete(showArrangementForm, "ARR");
            setShowArrangementForm(null);
          }}
          onCancel={() => setShowArrangementForm(null)}
        />
      )}
    </>
  );
};

// Memoize component to prevent unnecessary re-renders
export const AddressList = React.memo(AddressListComponent);
