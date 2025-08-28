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