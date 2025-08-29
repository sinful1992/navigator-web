import * as React from "react";

type Outcome = "Done" | "DA" | "PIF";

type Props = {
  state: any;
  setActive: (index: number) => void;
  cancelActive: () => void;
  complete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
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
  const addresses: any[] = Array.isArray(state?.addresses) ? state.addresses : [];
  const activeIndex: number | null =
    typeof state?.activeIndex === "number" ? state.activeIndex : null;

  // Build a Set of completed indices so we can hide them from the main list
  const completionsArr: any[] = Array.isArray(state?.completions) ? state.completions : [];
  const completedIdx = React.useMemo(
    () =>
      new Set(
        completionsArr
          .map((c) => Number(c?.index))
          .filter((n) => Number.isFinite(n) && n >= 0)
      ),
    [completionsArr]
  );

  const q = filterText.trim().toLowerCase();

  // Visible rows (exclude completed)
  const rows = React.useMemo(
    () =>
      addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !q || String(a?.address ?? "").toLowerCase().includes(q))
        .filter(({ i }) => !completedIdx.has(i)),
    [addresses, q, completedIdx]
  );

  // State: which active row has its outcomes panel open
  const [openOutcomesFor, setOpenOutcomesFor] = React.useState<number | null>(null);

  // Reset outcomes panel when active row changes
  React.useEffect(() => {
    setOpenOutcomesFor(null);
  }, [activeIndex]);

  // Local PIF input per row
  const [pifAmounts, setPifAmounts] = React.useState<Record<number, string>>({});

  const onNavigate = (addr: string) => {
    const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr || "");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const submitPIF = (i: number) => {
    const raw = (pifAmounts[i] ?? "").trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      alert("Enter a valid PIF amount (e.g. 50).");
      return;
    }
    complete(i, "PIF", n.toFixed(2));
    setPifAmounts((m) => ({ ...m, [i]: "" }));
    setOpenOutcomesFor(null); // collapse after completion
  };

  const markDone = (i: number) => {
    complete(i, "Done");
    setOpenOutcomesFor(null);
  };

  const markDA = (i: number) => {
    complete(i, "DA");
    setOpenOutcomesFor(null);
  };

  return (
    <div className="list">
      {rows.map(({ a, i }) => {
        const isActive = activeIndex === i;
        const showOutcomes = isActive && openOutcomesFor === i;
        const label = String(a?.address ?? "");

        return (
          <div key={i} className="row-card">
            {/* Header */}
            <div className="row-head">
              <div className="row-index">{i + 1}</div>
              <div className="row-title" title={label}>
                {label}
              </div>
              {isActive && <span className="active-badge">ACTIVE</span>}
            </div>

            {/* Top action bar */}
            <div className="row-actions">
              <button
                className="btn btn-ghost"
                onClick={() => onNavigate(label)}
                title="Open in Google Maps"
              >
                🌐 Navigate
              </button>

              {isActive ? (
                <>
                  {/* When active, hide Arrange here (it will move next to DA in outcomes panel) */}
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setOpenOutcomesFor(null);
                      cancelActive();
                    }}
                    title="Cancel active"
                  >
                    ⛔ Cancel
                  </button>

                  {/* Show only 'Complete' here; outcomes appear after pressing it */}
                  <button
                    className="btn btn-primary"
                    onClick={() => setOpenOutcomesFor(i)}
                    title="Show outcomes"
                  >
                    ✅ Complete
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => setActive(i)}
                    title="Set active"
                  >
                    Set Active
                  </button>

                  {/* When NOT active, Arrange sits here in the action bar */}
                  <button
                    className="btn btn-outline"
                    onClick={() => onCreateArrangement(i)}
                    title="Create arrangement"
                  >
                    📅 Arrange
                  </button>
                </>
              )}
            </div>

            {/* Outcomes panel: only after pressing 'Complete' on the active row */}
            {showOutcomes && (
              <div className="complete-bar fade-in-up" role="group" aria-label="Complete outcome">
                <div className="complete-btns">
                  <button
                    className="btn btn-success"
                    onClick={() => markDone(i)}
                    title="Mark Done"
                  >
                    ✅ Done
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => markDA(i)}
                    title="Mark DA"
                  >
                    🚫 DA
                  </button>

                  {/* 🔁 Arrange moved next to DA when outcomes are shown */}
                  <button
                    className="btn btn-outline"
                    onClick={() => onCreateArrangement(i)}
                    title="Create arrangement"
                  >
                    📅 Arrange
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
                    value={pifAmounts[i] ?? ""}
                    onChange={(e) => setPifAmounts((m) => ({ ...m, [i]: e.target.value }))}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => submitPIF(i)}
                    title="Record PIF"
                  >
                    💷 PIF
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