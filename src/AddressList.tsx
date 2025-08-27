import * as React from "react";
import type { AppState, Outcome } from "./types";

type Props = {
  state: AppState;
  setActive: (idx: number) => void;
  cancelActive: () => void;
  complete: (idx: number, outcome: Outcome, amount?: string) => void;
  undo: (idx: number) => void; // kept for API consistency; not shown in List view
  filterText?: string;
};

export function AddressList({
  state,
  setActive,
  cancelActive,
  complete,
  // undo, // not used in List (completed items are hidden here)
  filterText = "",
}: Props) {
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    index: number | null;
    address: string;
  }>({ open: false, index: null, address: "" });

  const normalizedFilter = filterText.trim().toLowerCase();

  // Set of completed indices for quick lookups
  const completedIdx = React.useMemo(
    () => new Set(state.completions.map((c) => c.index)),
    [state.completions]
  );

  // Only show NOT completed rows in List view, with search filter
  const rows = React.useMemo(() => {
    const base = state.addresses.map((a, i) => ({ ...a, __index: i }));
    const notCompleted = base.filter((r) => !completedIdx.has(r.__index as number));
    if (!normalizedFilter) return notCompleted;
    return notCompleted.filter((r) => r.address.toLowerCase().includes(normalizedFilter));
  }, [state.addresses, normalizedFilter, completedIdx]);

  const openDialog = (idx: number, address: string) => {
    setDialog({ open: true, index: idx, address });
  };

  const closeDialog = () => setDialog({ open: false, index: null, address: "" });

  const handleConfirm = (outcome: Outcome, amount?: string) => {
    if (dialog.index == null) return;
    complete(dialog.index, outcome, amount);
    closeDialog();
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!rows.length ? (
        <div
          style={{
            border: "1px dashed #d1d5db",
            borderRadius: 8,
            padding: 16,
            textAlign: "center",
            opacity: 0.8,
          }}
        >
          No addresses to show (they may be completed or filtered out).
        </div>
      ) : null}

      {rows.map((row) => {
        const idx = row.__index as number;
        const active = state.activeIndex === idx;

        return (
          <div
            key={idx}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 12,
              display: "grid",
              gap: 6,
              background: active ? "#f0f7ff" : "#fff",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 700, flex: 1 }}>
                {idx + 1}. {row.address}
              </div>

              {active ? (
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#e0f2fe",
                    border: "1px solid #bae6fd",
                  }}
                >
                  Active
                </span>
              ) : null}
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {row.lat != null && row.lng != null ? `GPS: ${row.lat}, ${row.lng}` : ""}
            </div>

            {/* Action buttons aligned to the RIGHT */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 4,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {!active && (
                <button onClick={() => setActive(idx)}>Set Active</button>
              )}

              {active && (
                <>
                  <button onClick={() => openDialog(idx, row.address)}>Complete</button>
                  <button onClick={cancelActive}>Cancel Active</button>
                </>
              )}
            </div>
          </div>
        );
      })}

      <CompleteDialog
        open={dialog.open}
        address={dialog.address}
        onClose={closeDialog}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

/** Small, dependency-free dialog for choosing outcome and entering PIF amount */
function CompleteDialog({
  open,
  address,
  onClose,
  onConfirm,
}: {
  open: boolean;
  address: string;
  onClose: () => void;
  onConfirm: (outcome: Outcome, amount?: string) => void;
}) {
  const [pifAmount, setPifAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setPifAmount("");
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirmPIF = () => {
    const val = pifAmount.trim();
    if (!val) {
      setError("Please enter an amount.");
      return;
    }
    const num = Number(val);
    if (!isFinite(num) || num <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    setError(null);
    onConfirm("PIF", num.toFixed(2));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          padding: 16,
          display: "grid",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>Complete Address</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>{address}</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => onConfirm("Done")} title="Mark as Done">
              Done
            </button>
            <button onClick={() => onConfirm("DA")} title="Debtor Absent / No Result">
              DA
            </button>
          </div>

          <div
            style={{
              borderTop: "1px solid #f1f5f9",
              marginTop: 4,
              paddingTop: 8,
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7 }}>PIF (Paid In Full)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="Amount (£)"
                value={pifAmount}
                onChange={(e) => setPifAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmPIF();
                }}
                style={{
                  flex: "1 1 180px",
                  maxWidth: 220,
                  padding: "8px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                }}
              />
              <button onClick={confirmPIF}>Confirm PIF</button>
            </div>
            {error ? (
              <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
