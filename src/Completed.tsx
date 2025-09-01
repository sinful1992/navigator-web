import * as React from "react";
import type { AddressRow, Completion, Outcome } from "./types";

type Props = {
  state: {
    addresses: AddressRow[];
    completions: Completion[];
    arrangements: unknown[];
    daySessions: unknown[];
    activeIndex: number | null;
    currentListVersion: number;
  };
  /** Update a specific completion’s outcome (by completion array index) */
  onChangeOutcome: (completionIndex: number, outcome: Outcome, amount?: string) => void;
};

const OUTCOME_OPTIONS: Outcome[] = ["PIF", "Done", "DA", "ARR"];

export function Completed({ state, onChangeOutcome }: Props) {
  const { addresses, completions, currentListVersion } = state;

  // Keep original index so we can update by completion index
  const items = React.useMemo(
    () =>
      completions
        .map((c, originalIndex) => ({ c, originalIndex }))
        .filter(({ c }) => c.listVersion === currentListVersion)
        // newest first if timestamps exist; otherwise preserve input order
        .sort((a, b) => {
          const ta = (a.c as any)?.timestamp ? Date.parse((a.c as any).timestamp) : 0;
          const tb = (b.c as any)?.timestamp ? Date.parse((b.c as any).timestamp) : 0;
          return tb - ta;
        }),
    [completions, currentListVersion]
  );

  if (items.length === 0) {
    return (
      <div style={{ marginTop: "2rem", color: "var(--text-secondary)" }}>
        No completed addresses for the current list.
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
      {items.map(({ c, originalIndex }) => {
        const addr = addresses[c.index];
        const addressText = addr?.address ?? `#${c.index + 1}`;
        const showAmount = c.outcome === "PIF" || c.outcome === "ARR";
        const [localAmount, setLocalAmount] = React.useState<string>(c.amount ?? "");

        return (
          <div
            key={originalIndex}
            className="card"
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
              background: "var(--surface)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {c.index + 1}. {addressText}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {c.outcome}
                {c.amount ? ` · £${c.amount}` : ""}
                {typeof (c as any).timestamp === "string"
                  ? ` · ${new Date((c as any).timestamp).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={c.outcome}
                onChange={(e) => {
                  const next = e.target.value as Outcome;
                  onChangeOutcome(originalIndex, next, next === "PIF" || next === "ARR" ? localAmount : undefined);
                }}
                className="input"
                style={{ minWidth: 120 }}
              >
                {OUTCOME_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              {showAmount && (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="Amount"
                  value={localAmount}
                  onChange={(e) => setLocalAmount(e.target.value)}
                  onBlur={() => onChangeOutcome(originalIndex, c.outcome, localAmount)}
                  className="input"
                  style={{ width: 110 }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Completed;