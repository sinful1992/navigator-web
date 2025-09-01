// src/AddressCard.tsx
import * as React from "react";
import type { AddressRow, Outcome } from "./types";

type Props = {
  index: number;
  row: AddressRow;
  mapsHref?: string;
  setActive: () => void;
  cancelActive: () => void;
  onComplete: (outcome: Outcome, amount?: string) => void;
  onCreateArrangement: () => void;
};

export function AddressCard({
  index,
  row,
  mapsHref,
  setActive,
  cancelActive,
  onComplete,
  onCreateArrangement,
}: Props) {
  const [amount, setAmount] = React.useState<string>("");

  return (
    <div className="border rounded-xl p-3 mb-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{index + 1}. {row.address ?? "(no address)"}</div>
          <div className="text-xs opacity-70">{row.postcode ?? ""}</div>
          {mapsHref && (
            <a className="text-xs underline" href={mapsHref} target="_blank" rel="noreferrer">
              Open in Maps
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <button className="border rounded px-2 py-1 text-sm" onClick={setActive}>Navigate</button>
          <button className="border rounded px-2 py-1 text-sm" onClick={cancelActive}>Cancel</button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          className="border rounded px-2 py-1 text-sm"
          placeholder="£ Amount (for PIF)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="border rounded px-2 py-1 text-sm" onClick={() => onComplete("PIF", amount || undefined)}>
          PIF
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={() => onComplete("DA")}>
          DA
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={() => onComplete("DONE")}>
          Done
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={() => onComplete("ARR")}>
          ARR
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={onCreateArrangement}>
          New Arrangement
        </button>
      </div>
    </div>
  );
}
