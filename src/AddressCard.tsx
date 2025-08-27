import * as React from "react";
import { openMaps } from "./maps";
import type { AddressRow, Completion, Outcome } from "./types";

type Props = {
  index: number;
  row: AddressRow;
  completion?: Completion;
  isActive: boolean;
  onActivate: (i: number) => void;
  onCancelActive: () => void;
  onComplete: (i: number, outcome: Outcome, amount?: string) => void;
  onUndo: (i: number) => void;
};

const statusStyle = (p: Props) => {
  if (p.isActive) return { color: "#1976d2", fontWeight: 600 };         // ACTIVE
  if (p.completion?.outcome === "PIF") return { color: "#2e7d32" };      // green
  if (p.completion?.outcome === "DA") return { color: "#c62828" };       // red
  if (p.completion?.outcome === "Done") return { color: "#1565c0" };     // blue-ish
  return { color: "#777" };                                              // pending
};

export const AddressCard: React.FC<Props> = (p) => {
  const left = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 600 }}>
        {p.index + 1}. {p.row.address}
      </div>
      <div style={{ fontSize: 12, ...statusStyle(p) }}>
        {p.isActive
          ? "ACTIVE"
          : p.completion
          ? p.completion.outcome === "PIF" && p.completion.amount
            ? `PIF £${p.completion.amount}`
            : p.completion.outcome
          : "PENDING"}
      </div>
    </div>
  );

  const onPIF = () => {
    const raw = window.prompt("Enter amount (£):", "");
    if (!raw) return;
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      alert("Please enter a valid amount > 0");
      return;
    }
    p.onComplete(p.index, "PIF", num.toFixed(2));
  };

  const actions = () => {
    if (p.completion) {
      return (
        <button onClick={() => p.onUndo(p.index)}>Undo</button>
      );
    }
    if (p.isActive) {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => p.onComplete(p.index, "Done")}>Done</button>
          <button onClick={() => p.onComplete(p.index, "DA")}>DA</button>
          <button onClick={onPIF}>PIF</button>
          <button onClick={p.onCancelActive}>Cancel</button>
        </div>
      );
    }
    return <button onClick={() => p.onActivate(p.index)}>Set Active</button>;
  };

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      {left}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => openMaps(p.row.address, p.row.lat ?? undefined, p.row.lng ?? undefined)}>
          Navigate
        </button>
        {actions()}
      </div>
    </div>
  );
};
