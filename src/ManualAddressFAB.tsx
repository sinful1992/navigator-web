// src/ManualAddressFAB.tsx
import * as React from "react";
import { Modal } from "./components/Modal";
import type { AddressRow } from "./types";

type Props = {
  onAdd: (row: AddressRow) => Promise<number>;
  /** If true, shows a normal inline button instead of floating FAB. */
  inline?: boolean;
};

export default function ManualAddressFAB({ onAdd, inline }: Props) {
  const [open, setOpen] = React.useState(false);
  const [address, setAddress] = React.useState("");
  const [lat, setLat] = React.useState<string>("");
  const [lng, setLng] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [err, setErr] = React.useState<string | null>(null);

  const reset = () => {
    setAddress("");
    setLat("");
    setLng("");
    setErr(null);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busyRef.current) return;
    setErr(null);

    const trimmed = address.trim();
    if (!trimmed) return setErr("Address is required.");

    let latNum: number | null = null;
    let lngNum: number | null = null;

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

    busyRef.current = true;
    setBusy(true);
    try {
      await onAdd({ address: trimmed, lat: latNum, lng: lngNum } as AddressRow);
      reset();
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const trigger = inline ? (
    <button type="button" className="btn" onClick={() => setOpen(true)}>
      + Add address
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Add address"
      className="fab-add-address"
    >
      +
    </button>
  );

  return (
    <>
      {trigger}

      <Modal
        isOpen={open}
        onClose={() => {
          reset();
          setOpen(false);
        }}
        title="Add Address"
        size="md"
      >
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="manual-address">Address *</label>
            <textarea
              id="manual-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder="e.g. 10 Example St, City, POSTCODE"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label htmlFor="manual-lat">Lat (optional)</label>
              <input
                id="manual-lat"
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="51.5034"
              />
            </div>
            <div className="form-group">
              <label htmlFor="manual-lng">Lng (optional)</label>
              <input
                id="manual-lng"
                type="text"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-0.1276"
              />
            </div>
          </div>

          {err && (
            <div className="info-box info-box-error" style={{ marginTop: "0.5rem" }}>
              {err}
            </div>
          )}

          <div className="modal-actions">
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
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
