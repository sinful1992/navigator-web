// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (idx: number) => void;
  cancelActive: () => void;
  complete: (idx: number, outcome: Outcome, amount?: string) => void;
  undo: (idx: number) => void;
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  undo,
  filterText = "",
}: Props) {
  const completedSet = React.useMemo(
    () => new Set(state.completions.map((c) => c.index)),
    [state.completions]
  );

  const rows = state.addresses
    .map((a, i) => ({ ...a, __i: i }))
    .filter((r) => !completedSet.has(r.__i))
    .filter((r) =>
      filterText.trim()
        ? r.address.toLowerCase().includes(filterText.trim().toLowerCase())
        : true
    );

  const openMaps = (addr: string, lat?: number, lng?: number) => {
    const url =
      lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            addr
          )}`;
    // open in new tab / or handoff to Maps app on mobile
    window.open(url, "_blank");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 && (
        <div style={{ opacity: 0.7, textAlign: "center" }}>
          No addresses match your search.
        </div>
      )}

      {rows.map((row) => {
        const i = row.__i as number;
        const isActive = state.activeIndex === i;

        return (
          <div
            key={i}
            style={{
              border: "1px solid #e7e7e7",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            {/* left: index + address */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  fontSize: 18,
                  marginBottom: 6,
                }}
              >
                {i + 1}. {row.address}
              </div>
              {(row.lat != null || row.lng != null) && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  GPS: {row.lat ?? "?"}, {row.lng ?? "?"}
                </div>
              )}
            </div>

            {/* right: action buttons */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              {/* Navigate is always available */}
              <button
                onClick={() => openMaps(row.address, row.lat ?? undefined, row.lng ?? undefined)}
                style={{ whiteSpace: "nowrap" }}
              >
                Navigate
              </button>

              {!isActive && (
                <button onClick={() => setActive(i)} style={{ whiteSpace: "nowrap" }}>
                  Set Active
                </button>
              )}

              {isActive && (
                <>
                  <button onClick={() => cancelActive()} style={{ whiteSpace: "nowrap" }}>
                    Cancel
                  </button>
                  {/* Complete options */}
                  <button onClick={() => complete(i, "Done")} style={{ whiteSpace: "nowrap" }}>
                    Done
                  </button>
                  <button onClick={() => complete(i, "DA")} style={{ whiteSpace: "nowrap" }}>
                    DA
                  </button>
                  <button
                    onClick={() => {
                      const amt = window.prompt("Enter PIF amount (£):", "");
                      if (amt && amt.trim()) complete(i, "PIF", amt.trim());
                    }}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    PIF £
                  </button>
                </>
              )}

              {/* If you want an Undo on the list for already-completed items,
                  you'd render them in this list. We hide completed items here,
                  and Undo is available in the Completed view. */}
            </div>
          </div>
        );
      })}
    </div>
  );
}