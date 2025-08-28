// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (i: number) => void;
  cancelActive: () => void;
  complete: (index: number, outcome: Outcome, amount?: string) => void;
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
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

  if (rows.length === 0) {
    return (
      <div className="emptyBox">
        <div style={{ fontSize: 14, opacity: 0.75 }}>
          {state.addresses.length === 0
            ? "No addresses loaded yet. Import an Excel file to get started."
            : "No addresses match your search (or everything is completed)."}
        </div>
      </div>
    );
  }

  return (
    <div className="listCol">
      {rows.map(({ i, address, lat, lng }) => {
        const active = state.activeIndex === i;
        const open = openCompleteFor === i;

        return (
          <div className={`card ${active ? "cardActive" : ""}`} key={i}>
            {/* Top: address + pill */}
            <div className="cardHeader">
              <div className="addrTitle">
                <span className="idx">{i + 1}.</span> {address}
              </div>
              {active && <span className="pill activePill">ACTIVE</span>}
            </div>

            {/* Optional body (reserved for future info) */}
            <div className="cardBody" />

            {/* Bottom: actions */}
            <div className="cardFooter">
              {!open ? (
                // Normal action row
                <div className="btnRow">
                  <button
                    className="btn btnGhost"
                    onClick={() => openMaps(address, lat, lng)}
                    title="Open in Google Maps"
                  >
                    Navigate
                  </button>

                  <div className="btnSpacer" />

                  {active ? (
                    <>
                      <button
                        className="btn btnPrimary"
                        onClick={() => setOpenCompleteFor(i)}
                      >
                        Complete
                      </button>
                      <button className="btn btnDanger" onClick={cancelActive}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="btn" onClick={() => setActive(i)}>
                      Set Active
                    </button>
                  )}
                </div>
              ) : (
                // Completion choices open
                <div className="completeBar">
                  <div className="completeBtns">
                    <button
                      className="btn btnPrimary"
                      onClick={() => {
                        complete(i, "Done");
                        setOpenCompleteFor(null);
                      }}
                    >
                      Done
                    </button>
                    <button
                      className="btn btnDanger"
                      onClick={() => {
                        complete(i, "DA");
                        setOpenCompleteFor(null);
                      }}
                    >
                      DA
                    </button>
                  </div>

                  <div className="pifGroup">
                    <input
                      className="amountInput"
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
                    <button className="btn btnGhost" onClick={() => onConfirmPIF(i)}>
                      PIF
                    </button>
                  </div>

                  <div className="btnSpacer" />

                  <button
                    className="btn"
                    onClick={() => setOpenCompleteFor(null)}
                    title="Close options"
                  >
                    Back
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