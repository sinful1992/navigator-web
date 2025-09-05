// src/AddressList.tsx
import * as React from "react";
import type { AppState, AddressRow, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (idx: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (index: number) => void;
  filterText?: string;
  ensureDayStarted?: () => void;
};

function matchesQuery(text: string, query: string) {
  if (!query) return true;
  try {
    return (text || "").toLowerCase().includes(query.toLowerCase());
  } catch {
    return true;
  }
}

export function AddressList({
  state,
  setActive,
  cancelActive,
  onComplete,
  onCreateArrangement,
  filterText = "",
  ensureDayStarted,
}: Props) {
  const addresses: AddressRow[] = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const currentVersion = typeof state.currentListVersion === "number" ? state.currentListVersion : 1;

  // Only treat addresses as completed if they have a completion *for the current list version*
  const completedIdx = React.useMemo(() => {
    const s = new Set<number>();
    for (const c of completions) {
      const ver = typeof (c as any)?.listVersion === "number" ? (c as any).listVersion : 1;
      if (ver === currentVersion) s.add(Number(c.index));
    }
    return s;
  }, [completions, currentVersion]);

  // Apply search first
  const filtered = addresses
    .map((row, i) => ({ i, row }))
    .filter(({ row }) => matchesQuery(row.address ?? "", filterText));

  // Show **pending only** in the List tab
  const pending = filtered.filter(({ i }) => !completedIdx.has(i));

  if (pending.length === 0) {
    return (
      <div className="muted" style={{ padding: "0.75rem 0.75rem 0" }}>
        {addresses.length === 0
          ? "No addresses loaded. Import a file to get started."
          : filterText
          ? "No pending addresses match your search."
          : "No pending addresses for the current list."}
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "0.25rem 0.5rem" }}>
      {pending.map(({ i, row }) => (
        <li
          key={i}
          style={{
            border: "1px solid var(--border-light)",
            borderRadius: 10,
            padding: "0.5rem 0.75rem",
            marginBottom: "0.5rem",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{row.address}</div>
              {row.lat != null && row.lng != null && (
                <div className="muted" style={{ fontSize: 12 }}>
                  ({row.lat}, {row.lng})
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
              <button
                className="btn btn-ghost btn-sm"
                title="Mark Done"
                onClick={() => {
                  ensureDayStarted?.();
                  onComplete(i, "Done");
                }}
              >
                Done
              </button>
              <button
                className="btn btn-ghost btn-sm"
                title="Mark DA"
                onClick={() => {
                  ensureDayStarted?.();
                  onComplete(i, "DA");
                }}
              >
                DA
              </button>
              <button
                className="btn btn-ghost btn-sm"
                title="Mark PIF"
                onClick={() => {
                  ensureDayStarted?.();
                  const val = window.prompt("Amount received (£):");
                  if (val != null) onComplete(i, "PIF", val || undefined);
                }}
              >
                PIF
              </button>
              <button
                className="btn btn-ghost btn-sm"
                title="Create arrangement"
                onClick={() => onCreateArrangement(i)}
              >
                Arrange
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}