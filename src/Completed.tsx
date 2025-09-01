// src/Completed.tsx
import * as React from "react";
import type { AddressRow, Completion, Outcome } from "./types";

type Props = {
  addresses: AddressRow[];
  completions: Completion[];
  currentListVersion: number;
  onChangeOutcome: (index: number, outcome: Outcome, amount?: string, listVersion?: number) => void;
  onDeleteCompletion?: (index: number, listVersion: number) => void;
};

function labelForCompletion(
  c: Completion,
  currentLV: number,
  addresses: AddressRow[]
): string {
  const idx = Number(c?.index);

  if (c?.addressSnapshot && c.addressSnapshot.trim()) return c.addressSnapshot;
  if (typeof c?.address === "string" && c.address.trim()) return c.address;

  if (c?.listVersion === currentLV) {
    const rec = addresses[idx];
    if (rec?.address) return rec.address;
  }

  const ver = typeof c?.listVersion === "number" ? c.listVersion : "–";
  return `#${isFinite(idx) ? idx + 1 : "?"} (v${ver})`;
}

export function Completed({
  addresses,
  completions,
  currentListVersion,
  onChangeOutcome,
  onDeleteCompletion,
}: Props) {
  const rows = React.useMemo(() => {
    return completions
      .slice()
      .sort((a, b) => (a.completedAt || "").localeCompare(b.completedAt || ""));
  }, [completions]);

  return (
    <div className="completed-list">
      {rows.length === 0 && (
        <div className="p-4 text-sm opacity-70">No completions yet.</div>
      )}

      {rows.map((c, i) => {
        const label = labelForCompletion(c, currentListVersion, addresses);
        const idx = Number(c.index);
        const ver = typeof c.listVersion === "number" ? c.listVersion : undefined;

        return (
          <div key={`${ver ?? "legacy"}-${idx}-${i}`} className="border rounded-xl p-3 mb-2">
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs opacity-70">
              Outcome: {c.outcome}
              {c.amount ? ` · £${c.amount}` : ""}
              {ver !== undefined ? ` · v${ver}` : " · v–"}
              {c.completedAt ? ` · ${new Date(c.completedAt).toLocaleString()}` : ""}
            </div>

            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => onChangeOutcome(idx, "PIF", c.amount, ver)} className="px-2 py-1 rounded border">
                Set PIF
              </button>
              <button type="button" onClick={() => onChangeOutcome(idx, "DA", undefined, ver)} className="px-2 py-1 rounded border">
                Set DA
              </button>
              <button type="button" onClick={() => onChangeOutcome(idx, "DONE", undefined, ver)} className="px-2 py-1 rounded border">
                Set Done
              </button>
              {onDeleteCompletion && ver !== undefined && (
                <button type="button" onClick={() => onDeleteCompletion(idx, ver)} className="px-2 py-1 rounded border">
                  Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Completed;
