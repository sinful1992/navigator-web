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

  // 🔒 Build a Set of completed indices (cast to number to avoid "string vs number")
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

  // ✅ Exclude completed rows from the visible list
  const rows = React.useMemo(
    () =>
      addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !q || String(a?.address ?? "").toLowerCase().includes(q))
        .filter(({ i }) => !completedIdx.has(i)),
    [addresses, q, completedIdx]
  );

  const onNavigate = (addr: string) => {
    const url =
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(addr || "");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const quickComplete = (i: number) => {
    const input = window.prompt(
      "Quick Complete:\n\n• Leave empty → Done\n• Type 'DA' → Mark as DA\n• Type a number (e.g. 50) → PIF £amount"
    );
    if (input === null) return;
    const text = input.trim();
    if (!text) {
      complete(i, "Done");
    } else if (text.toUpperCase() === "DA") {
      complete(i, "DA");
    } else {
      const n = Number(text);
      if (Number.isFinite(n) && n > 0) {
        complete(i, "PIF", n.toFixed(2));
      } else {
        alert("Invalid amount. Use a number (e.g., 50) or leave empty for Done.");
      }
    }
  };

  return (
    <div className="list">
      {rows.map(({ a, i }) => {
        const isActive = activeIndex === i;
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

            {/* Actions */}
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
                  <button
                    className="btn btn-primary"
                    onClick={() => quickComplete(i)}
                    title="Complete (quick)"
                  >
                    ✅ Complete
                  </button>

                  <button
                    className="btn btn-ghost"
                    onClick={() => cancelActive()}
                    title="Cancel active"
                  >
                    ⛔ Cancel
                  </button>

                  {/* Keep Arrange visible when active */}
                  <button
                    className="btn btn-outline"
                    onClick={() => onCreateArrangement(i)}
                    title="Create arrangement"
                  >
                    📅 Arrange
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
          </div>
        );
      })}
    </div>
  );
}