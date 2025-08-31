import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (i: number) => void;
  cancelActive: () => void;
  complete: (i: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (i: number) => void;
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
  const [pifAmount, setPifAmount] = React.useState<string>("");

  const lowerQ = (filterText ?? "").trim().toLowerCase();

  // Build a set of indices completed in the CURRENT list version
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();
    const v = state.currentListVersion;
    for (const c of state.completions ?? []) {
      if (c.listVersion === v) set.add(c.index);
    }
    return set;
  }, [state.completions, state.currentListVersion]);

  // Visible rows = not completed for current list version + search filter
  const visible = React.useMemo(
    () =>
      (state.addresses ?? [])
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !lowerQ || (a.address ?? "").toLowerCase().includes(lowerQ))
        .filter(({ i }) => !completedIdx.has(i)),
    [state.addresses, lowerQ, completedIdx]
  );

  if (visible.length === 0) {
    return (
      <div className="empty-box">
        <div>No addresses to show</div>
        <p>
          {state.addresses.length === 0
            ? "Import a list to get started."
            : "All addresses for this list are completed or filtered out."}
        </p>
      </div>
    );
  }

  return (
    <div className="list">
      {visible.map(({ a, i }) => {
        const isActive = state.activeIndex === i;
        const showing = showOutcomesFor === i;

        return (
          <div key={i} className="row-card">
            <div className="row-head">
              <div className="row-index">{i + 1}</div>
              <div className="row-title" title={a.address}>
                {a.address}
              </div>
              {isActive && <span className="active-badge">ACTIVE</span>}
            </div>

            <div className="row-actions">
              {!isActive ? (
                <button className="btn btn-outline btn-sm" onClick={() => setActive(i)}>
                  🔵 Set Active
                </button>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={cancelActive}>
                    ✖ Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      setShowOutcomesFor((prev) => (prev === i ? null : i))
                    }
                  >
                    ✅ Complete
                  </button>
                </>
              )}
            </div>

            {isActive && showing && (
              <div className="complete-bar">
                <div className="complete-btns">
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
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      complete(i, "ARR");
                      onCreateArrangement(i);
                      setShowOutcomesFor(null);
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
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const n = Number(pifAmount);
                      if (!Number.isFinite(n) || n <= 0) {
                        alert("Enter a valid PIF amount (e.g. 50)");
                        return;
                      }
                      complete(i, "PIF", n.toFixed(2));
                      setPifAmount("");
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
      })}
    </div>
  );
}