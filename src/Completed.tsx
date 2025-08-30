import * as React from "react";

type Outcome = "Done" | "DA" | "PIF";

type Props = {
  state: any;
  /** Change the outcome for a completed address (by address index). */
  onChangeOutcome: (index: number, outcome: Outcome, amount?: string) => void;
  /** Optional: expose undo on each row (kept for convenience). */
  onUndo?: (index: number) => void;
};

export function Completed({ state, onChangeOutcome, onUndo }: Props) {
  const completions: any[] = Array.isArray(state?.completions) ? state.completions : [];
  const addresses: any[] = Array.isArray(state?.addresses) ? state.addresses : [];

  // Which address index is being edited?
  const [editingFor, setEditingFor] = React.useState<number | null>(null);
  // PIF amount local state when editing
  const [pifAmount, setPifAmount] = React.useState<string>("");

  if (completions.length === 0) {
    return (
      <div className="completed-wrap">
        <div className="empty-box">
          <div>No completed calls yet</div>
          <p>When you complete a call it will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="completed-wrap">
      {completions.map((c) => {
        const idx = Number(c?.index);
        const rec = addresses[idx] ?? {};
        const label = String(rec?.address ?? `#${idx + 1}`);
        const when = c.ts || c.time;
        const isEditing = editingFor === idx;

        return (
          <div key={idx} className="card">
            <div className="card-header">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={label}
                >
                  {label}
                </div>

                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  <span
                    className={
                      "pill " +
                      (c.outcome === "PIF"
                        ? "pill-pif"
                        : c.outcome === "DA"
                        ? "pill-da"
                        : "pill-done")
                    }
                  >
                    {c.outcome}
                    {c.outcome === "PIF" && c.amount ? ` £${c.amount}` : ""}
                  </span>
                  {when ? (
                    <span style={{ marginLeft: 8 }}>
                      {new Date(when).toLocaleString?.() ?? String(when)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="btn-group">
                {onUndo && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onUndo(idx)}
                    title="Undo this completion"
                  >
                    ↩️ Undo
                  </button>
                )}

                {!isEditing ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setEditingFor(idx);
                      setPifAmount(c.outcome === "PIF" ? String(c.amount ?? "") : "");
                    }}
                    title="Edit outcome"
                  >
                    ✏️ Edit
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingFor(null)}
                    title="Close editor"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {isEditing && (
              <div className="card-body">
                <div className="complete-bar">
                  <div className="complete-btns">
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        onChangeOutcome(idx, "Done");
                        setEditingFor(null);
                      }}
                      title="Mark as Done"
                    >
                      ✅ Done
                    </button>

                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        onChangeOutcome(idx, "DA");
                        setEditingFor(null);
                      }}
                      title="Mark as DA"
                    >
                      🚫 DA
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
                      className="btn btn-primary"
                      onClick={() => {
                        const n = Number(pifAmount);
                        if (!Number.isFinite(n) || n <= 0) {
                          alert("Enter a valid PIF amount (e.g. 50)");
                          return;
                        }
                        onChangeOutcome(idx, "PIF", n.toFixed(2));
                        setEditingFor(null);
                      }}
                      title="Save PIF"
                    >
                      💷 Save PIF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}