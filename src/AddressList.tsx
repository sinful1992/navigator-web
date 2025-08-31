// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  complete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
  filterText: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  onCreateArrangement,
  filterText,
}: Props) {
  const [showOutcomesFor, setShowOutcomesFor] = React.useState<number | null>(null);
  const [pifAmountByIndex, setPifAmountByIndex] = React.useState<Record<number, string>>({});

  const lowerQ = (filterText ?? "").trim().toLowerCase();

  // Hide addresses that have a completion in the current list version
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of state.completions ?? []) {
      if ((c.listVersion ?? 1) === state.currentListVersion) {
        set.add(c.index);
      }
    }
    return set;
  }, [state.completions, state.currentListVersion]);

  const visible = React.useMemo(
    () =>
      state.addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !lowerQ || (a.address ?? "").toLowerCase().includes(lowerQ))
        .filter(({ i }) => !completedIdx.has(i)),
    [state.addresses, lowerQ, completedIdx]
  );

  return (
    <div className="list">
      {visible.length === 0 ? (
        <div className="empty-box">
          <div>No pending addresses</div>
          <p>All addresses in this list are completed for the current import.</p>
        </div>
      ) : (
        visible.map(({ a, i }) => {
          const isActive = state.activeIndex === i;
          const showCompleteBar = showOutcomesFor === i;
          const pifVal = pifAmountByIndex[i] ?? "";

          return (
            <div className={`row-card ${isActive ? "card-active" : ""}`} key={i}>
              <div className="row-head">
                <div className="row-index">{i + 1}</div>
                <div className="row-title" title={a.address}>
                  {a.address}
                </div>
                {!isActive ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setActive(i)}>
                    Set Active
                  </button>
                ) : (
                  <div className="btn-group">
                    <span className="active-badge">Active</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        setShowOutcomesFor((cur) => (cur === i ? null : i))
                      }
                    >
                      Complete
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setShowOutcomesFor(null);
                        cancelActive();
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {isActive && showCompleteBar && (
                <div className="row-actions">
                  {/* Outcomes cluster */}
                  <div className="btn-group">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        complete(i, "Done");
                        setShowOutcomesFor(null);
                      }}
                    >
                      ✅ Done
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        complete(i, "DA");
                        setShowOutcomesFor(null);
                      }}
                    >
                      🚫 DA
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => onCreateArrangement(i)}
                      title="Create payment arrangement for this address"
                    >
                      📅 Arrangement
                    </button>
                  </div>

                  {/* PIF group */}
                  <div className="pif-group">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="input amount-input"
                      placeholder="PIF £"
                      value={pifVal}
                      onChange={(e) =>
                        setPifAmountByIndex((m) => ({ ...m, [i]: e.target.value }))
                      }
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const n = Number(pifVal);
                        if (!Number.isFinite(n) || n <= 0) {
                          alert("Enter a valid PIF amount (e.g. 50)");
                          return;
                        }
                        complete(i, "PIF", n.toFixed(2));
                        setShowOutcomesFor(null);
                      }}
                    >
                      💷 Save PIF
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}