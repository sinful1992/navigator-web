import * as React from "react";
import type { AddressRow } from "./types";

type Props = {
  onAdd: (row: AddressRow) => Promise<number>;
};

export default function ManualAddressFAB({ onAdd }: Props) {
  const [open, setOpen] = React.useState(false);
  const [address, setAddress] = React.useState("");
  const [lat, setLat] = React.useState<string>("");
  const [lng, setLng] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const reset = () => {
    setAddress("");
    setLat("");
    setLng("");
    setErr(null);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);

    const trimmed = address.trim();
    if (!trimmed) {
      setErr("Address is required.");
      return;
    }

    let latNum: number | undefined;
    let lngNum: number | undefined;

    if (lat.trim()) {
      const v = Number(lat);
      if (Number.isNaN(v)) return setErr("Latitude must be a number.");
      latNum = v;
    }
    if (lng.trim()) {
      const v = Number(lng);
      if (Number.isNaN(v)) return setErr("Longitude must be a number.");
      lngNum = v;
    }

    setBusy(true);
    try {
      await onAdd({
        address: trimmed,
        lat: latNum ?? null,
        lng: lngNum ?? null,
      } as AddressRow);
      reset();
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add address"
        style={fabStyle}
        className="fab-add-address"
      >
        +
      </button>

      {/* Very small modal */}
      {open && (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Add Address</h3>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                disabled={busy}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submit} style={{ marginTop: "0.5rem" }}>
              <label className="label" htmlFor="manual-address">Address *</label>
              <textarea
                id="manual-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="input"
                rows={3}
                placeholder="e.g. 10 Downing Street, London, SW1A 2AA"
                required
              />

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <label className="label" htmlFor="manual-lat">Lat (optional)</label>
                  <input
                    id="manual-lat"
                    type="text"
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="input"
                    placeholder="51.5034"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label" htmlFor="manual-lng">Lng (optional)</label>
                  <input
                    id="manual-lng"
                    type="text"
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    className="input"
                    placeholder="-0.1276"
                  />
                </div>
              </div>

              {err && (
                <div
                  style={{
                    color: "var(--danger)",
                    fontSize: "0.875rem",
                    marginTop: "0.5rem",
                  }}
                >
                  {err}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* Inline styles to avoid CSS churn */
const fabStyle: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  width: 56,
  height: 56,
  borderRadius: "50%",
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontSize: 28,
  lineHeight: "56px",
  textAlign: "center",
  boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
  cursor: "pointer",
  zIndex: 50,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  zIndex: 60,
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "var(--surface)",
  borderRadius: 14,
  padding: 14,
  border: "1px solid var(--border-light)",
  boxShadow: "var(--shadow-lg)",
};
