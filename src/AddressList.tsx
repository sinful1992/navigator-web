// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  complete: (index: number, outcome: Outcome, amount?: string) => void;
  /** Optional: navigate to Arrangements tab and preselect this index. */
  onCreateArrangement?: (addressIndex: number) => void;
  /** Optional: search filter text */
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  onCreateArrangement,
  filterText = "",
}: Props) {
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];

  // Hide rows already completed (for this list)
  const completedIdx = React.useMemo(
    () => new Set(completions.map((c) => Number(c.index))),
    [completions]
  );

  // Lightweight search that preserves order and duplicates
  const q = (filterText ?? "").trim().toLowerCase();
  const visible = React.useMemo(() => {
    const base = addresses.map((a, i) => ({ a, i }));
    const searched = q
      ? base.filter(({ a }) => String(a.address ?? "").toLowerCase().includes(q))
      : base;
    return searched.filter(({ i }) => !completedIdx.has(i));
  }, [addresses, q, completedIdx]);

  // Which row currently shows the outcomes bar
  const [openCompleteFor, setOpenCompleteFor] = React.useState<number | null>(null);
  // PIF amount per row (local input)
  const [pifAmountByIndex, setPifAmountByIndex] = React.useState<Record<number, string>>({});

  const activeIndex = state.activeIndex;

  const toggleCompleteBar = (rowIndex: number) => {
    setOpenCompleteFor((cur) => (cur === rowIndex ? null : rowIndex));
  };

  const doArrangement = (rowIndex: number) => {
    // 1) mark as completed with outcome ARR
    complete(rowIndex, "ARR");
    // 2) open the arrangement flow
    if (onCreateArrangement) {
      onCreateArrangement(rowIndex);
    } else {
      // fallback: notify Arrangements component via the custom event you already use
      setTimeout(() => {
        const event = new CustomEvent("auto-create-arrangement", {
          detail: { addressIndex: rowIndex },
        });
        window.dispatchEvent(event);
      }, 0);
    }
    // close complete bar
    setOpenCompleteFor(null);
  };

  const onSavePIF = (rowIndex: number) => {
    const raw = pifAmountByIndex[rowIndex] ?? "";
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      alert("Enter a valid PIF amount (e.g. 50)");
      return;
    }
    complete(rowIndex, "PIF", n.toFixed(2));
    setOpenCompleteFor(null);
  };

  if (visible.length === 0) {
    return (
      <div className="empty-box">
        <div>Nothing to show</div>
        <p>All matching addresses are completed, or your search hides them.</p>
      </div>
    );
  }

  return (
    <div className="list">
      {visible.map(({ a, i }) => {
        const isActive = activeIndex === i;
        const isBarOpen = openCompleteFor === i;

        return (
          <div key={`addr_${i}`} className={`row-card ${isActive ? "card-active" : ""}`}>
            {/* Row header */}
            <div className="row-head">
              <div className="row-index">{i + 1}</div>

              <div className="row-title" title={a.address}>
                {a.address}
              </div>

              {isActive ? <span className="active-badge">ACTIVE</span> : null}
            </div>

            {/* Row actions */}
            <div className="row-actions">
              {!isActive ? (
                <button className="btn btn-outline btn-sm" onClick={() => setActive(i)}>
                  🎯 Set Active
                </button>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={cancelActive}>
                    ✖ Cancel
                  </button>

                  {/* Complete button appears only when row is active */}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => toggleCompleteBar(i)}
                    aria-expanded={isBarOpen}
                    aria-controls={`complete-panel-${i}`}
                    title="Complete this call"
                  >
                    ✅ Complete
                  </button>
                </>
              )}
            </div>

            {/* Outcomes bar (only when Complete is pressed) */}
            {isActive && isBarOpen && (
              <div id={`complete-panel-${i}`} className="complete-bar fade-in-up">
                <div className="complete-btns">
                  <button
                    className="btn btn-success"
                    onClick={() => {
                      complete(i, "Done");
                      setOpenCompleteFor(null);
                    }}
                    title="Mark as Done"
                  >
                    ✅ Done
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      complete(i, "DA");
                      setOpenCompleteFor(null);
                    }}
                    title="No Answer / DA"
                  >
                    🚫 DA
                  </button>

                  {/* Arrangement sits next to DA, as requested */}
                  <button
                    className="btn btn-ghost"
                    onClick={() => doArrangement(i)}
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
                    value={pifAmountByIndex[i] ?? ""}
                    onChange={(e) =>
                      setPifAmountByIndex((m) => ({ ...m, [i]: e.target.value }))
                    }
                  />
                  <button className="btn btn-primary" onClick={() => onSavePIF(i)}>
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