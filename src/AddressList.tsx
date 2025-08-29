// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (i: number) => void;
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
  const [openCompleteFor, setOpenCompleteFor] = React.useState<number | null>(
    null
  );
  const [pifAmount, setPifAmount] = React.useState<Record<number, string>>({});

  const completedIdx = React.useMemo(() => {
    const s = new Set<number>();
    for (const c of state.completions) s.add(c.index);
    return s;
  }, [state.completions]);

  const needle = filterText.trim().toLowerCase();

  // Build visible rows = not completed + matches search
  const rows = React.useMemo(() => {
    const out: Array<{ i: number; address: string; lat?: number; lng?: number }> = [];
    state.addresses.forEach((row, i) => {
      if (completedIdx.has(i)) return; // hide completed from this list
      const addr = row.address || "";
      if (needle && !addr.toLowerCase().includes(needle)) return;
      out.push({
        i,
        address: addr,
        lat: row.lat ?? undefined,
        lng: row.lng ?? undefined,
      });
    });
    return out;
  }, [state.addresses, completedIdx, needle]);

  const openMaps = (addr: string, lat?: number, lng?: number) => {
    let url: string;
    if (typeof lat === "number" && typeof lng === "number") {
      url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        addr
      )}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onConfirmPIF = (index: number) => {
    const amt = (pifAmount[index] || "").trim();
    if (!amt) {
      alert("Please enter an amount for PIF.");
      return;
    }
    complete(index, "PIF", amt);
    setOpenCompleteFor(null);
  };

  // Clear completion form when active index changes
  React.useEffect(() => {
    setOpenCompleteFor(null);
  }, [state.activeIndex]);

  if (rows.length === 0) {
    return (
      <div className="empty-box">
        <div style={{ fontSize: "1rem", marginBottom: "0.5rem", fontWeight: 600 }}>
          {state.addresses.length === 0 ? "📍 No addresses loaded" : "🔍 No matching addresses"}
        </div>
        <div style={{ fontSize: "0.875rem", opacity: 0.75 }}>
          {state.addresses.length === 0
            ? "Import an Excel file to get started with address navigation"
            : "Try adjusting your search terms or check if all addresses are completed"}
        </div>
      </div>
    );
  }

  return (
    <div className="list-col">
      {rows.map(({ i, address, lat, lng }) => {
        const active = state.activeIndex === i;
        const open = openCompleteFor === i && active; // Only show completion if BOTH active AND openCompleteFor match

        return (
          <div 
            className={`card address-card fade-in-up ${active ? "card-active" : ""}`} 
            key={i}
          >
            {/* Card Header */}
            <div className="card-header">
              <div className="addr-title">
                <span className="addr-index">{i + 1}</span>
                {address}
              </div>
              {active && (
                <span className="pill pill-active">
                  🎯 Active
                </span>
              )}
            </div>

            {/* Card Body - Reserved for future content */}
            <div className="card-body" style={{ padding: 0 }} />

            {/* Card Footer */}
            <div className="card-footer">
              {!open ? (
                // Normal action row
                <div className="btn-row btn-row-end">
                  <button
                    className="btn btn-ghost"
                    onClick={() => openMaps(address, lat, lng)}
                    title="Open in Google Maps"
                  >
                    🗺️ Navigate
                  </button>

                  <div className="btn-spacer" />

                  {active ? (
                    <div className="btn-group">
                      <button
                        className="btn btn-primary"
                        onClick={() => setOpenCompleteFor(i)}
                      >
                        ✅ Complete
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        onClick={() => {
                          cancelActive();
                          setOpenCompleteFor(null); // Also clear completion form
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="btn-group">
                      <button 
                        className="btn btn-primary" 
                        onClick={() => setActive(i)}
                      >
                        Set Active
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => onCreateArrangement(i)}
                        title="Create payment arrangement"
                      >
                        📅 Arrange
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Completion choices open
                <div className="complete-bar">
                  <div className="complete-btns">
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        complete(i, "Done");
                        setOpenCompleteFor(null);
                      }}
                    >
                      ✅ Done
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        complete(i, "DA");
                        setOpenCompleteFor(null);
                      }}
                    >
                      ❌ DA
                    </button>
                  </div>

                  <div className="pif-group">
                    <input
                      className="input amount-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount (£)"
                      value={pifAmount[i] || ""}
                      onChange={(e) =>
                        setPifAmount((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    />
                    <button 
                      className="btn btn-success" 
                      onClick={() => onConfirmPIF(i)}
                    >
                      💰 PIF
                    </button>
                  </div>

                  <button
                    className="btn btn-ghost"
                    onClick={() => onCreateArrangement(i)}
                    title="Create payment arrangement instead"
                  >
                    📅 Arrange
                  </button>

                  <div className="btn-spacer" />

                  <button
                    className="btn btn-ghost"
                    onClick={() => setOpenCompleteFor(null)}
                    title="Close options"
                  >
                    ← Back
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}