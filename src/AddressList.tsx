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

  const q = filterText.trim().toLowerCase();
  const rows = React.useMemo(
    () =>
      addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !q || String(a.address ?? "").toLowerCase().includes(q)),
    [addresses, q]
  );

  const onNavigate = (addr: string) => {
    const url =
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(addr || "");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Keep the same "Quick complete" behavior used elsewhere
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
            {/* Row header: index, address, active badge */}
            <div className="row-head">
              <div className="row-index">{i + 1}</div>
              <div className="row-title" title={label}>
                {label}
              </div>
              {isActive && <span className="active-badge">ACTIVE</span>}
            </div>

            {/* Row actions: ALWAYS show Navigate + Arrange.
                When active, also show Complete + Cancel. When not, show Set Active. */}
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

                  {/* Keep Arrange visible even when active */}
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