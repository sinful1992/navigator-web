import * as React from "react";
import { useAppState } from "./useAppState";

type Form = {
  address: string;
  lat?: string;
  lng?: string;
  notes?: string;
};

export default function ManualAddressFAB() {
  const { addAddress } = useAppState();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<Form>({ address: "" });

  const canSave = form.address.trim().length > 0 && !saving;

  const onSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const lat = form.lat?.trim() ? Number(form.lat) : undefined;
      const lng = form.lng?.trim() ? Number(form.lng) : undefined;

      await addAddress({
        address: form.address.trim(),
        lat: Number.isFinite(lat!) ? lat : undefined,
        lng: Number.isFinite(lng!) ? lng : undefined,
        notes: form.notes?.trim() || undefined,
      } as any);

      setOpen(false);
      setForm({ address: "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen(true)}
        title="Add manual address"
        style={{
          position: "fixed",
          right: 16,
          bottom: 80,
          zIndex: 1000,
          borderRadius: 999,
          padding: "12px 16px",
          border: "none",
          background: "#0ea5e9",
          color: "white",
          boxShadow: "0 10px 24px rgba(2,6,23,.2)",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        + Address
      </button>

      {/* Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, .45)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 92vw)",
              borderRadius: 12,
              background: "white",
              padding: 16,
              boxShadow: "0 14px 40px rgba(2,6,23,.25)",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>Add address</h3>
            <form onSubmit={onSave}>
              <label style={labelStyle}>Address</label>
              <input
                autoFocus
                required
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="e.g. 10 Downing St, London SW1A 2AA"
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Latitude (optional)</label>
                  <input
                    value={form.lat ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                    placeholder="51.5034"
                    inputMode="decimal"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Longitude (optional)</label>
                  <input
                    value={form.lng ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                    placeholder="-0.1276"
                    inputMode="decimal"
                    style={inputStyle}
                  />
                </div>
              </div>

              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setOpen(false)} style={btnSecondary}>
                  Cancel
                </button>
                <button type="submit" disabled={!canSave} style={{ ...btnPrimary, opacity: canSave ? 1 : 0.6 }}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#334155",
  marginTop: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  marginBottom: 4,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #0284c7",
  background: "#0ea5e9",
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#0f172a",
  cursor: "pointer",
};