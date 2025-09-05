// src/ImportExcel.tsx
import * as React from "react";
import * as XLSX from "xlsx";
import type { AddressRow } from "./types";

type Props = {
  onImported: (rows: AddressRow[]) => void;
};

export function ImportExcel({ onImported }: Props) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<AddressRow[] | null>(null);

  const openPicker = () => fileRef.current?.click();
  const resetFeedback = () => {
    setMsg(null);
    setErr(null);
    setPreview(null);
  };

  const normalizeHeader = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ""); // “Address ” -> “address”

  const parseRows = (raw: any[]): AddressRow[] => {
    if (!Array.isArray(raw) || raw.length === 0) return [];

    // Map normalized header -> actual key
    const headerKeys = Object.keys(raw[0] ?? {});
    const headerMap = new Map<string, string>();
    for (const k of headerKeys) headerMap.set(normalizeHeader(k), k);

    const addrKey = headerMap.get("address");
    const latKey = headerMap.get("lat") ?? headerMap.get("latitude");
    const lngKey =
      headerMap.get("lng") ?? headerMap.get("lon") ?? headerMap.get("longitude");

    if (!addrKey) {
      throw new Error(
        'Missing required header "address" on the FIRST sheet. Expected headers: address, lat, lng (lat/lng optional).'
      );
    }

    const out: AddressRow[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;

      const addrRaw = r[addrKey];
      const address =
        typeof addrRaw === "string"
          ? addrRaw.trim()
          : String(addrRaw ?? "").trim();
      if (!address) continue; // skip empty rows

      let lat: number | null = null;
      let lng: number | null = null;

      if (latKey && r[latKey] != null && r[latKey] !== "") {
        const v = Number(r[latKey]);
        if (!Number.isNaN(v)) lat = v;
      }
      if (lngKey && r[lngKey] != null && r[lngKey] !== "") {
        const v = Number(r[lngKey]);
        if (!Number.isNaN(v)) lng = v;
      }

      out.push({ address, lat, lng } as AddressRow);
    }

    return out;
  };

  const handleFile = async (file: File) => {
    resetFeedback();
    setBusy(true);
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error("No sheets found in the file.");

      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("Unable to read the first sheet.");

      // Let SheetJS infer columns by header row
      const json = XLSX.utils.sheet_to_json(ws, {
        defval: "",
        raw: true,
      }) as any[];

      const rows = parseRows(json);
      if (rows.length === 0) {
        throw new Error(
          "No valid rows found. Ensure at least one row contains an address."
        );
      }

      onImported(rows);                 // <- updates your app state
      setPreview(rows.slice(0, 5));     // show a tiny preview
      setMsg(`Imported ${rows.length} addresses from "${file.name}".`);
      console.log("[ImportExcel] Success:", rows.length);
    } catch (e: any) {
      console.error("[ImportExcel] Error:", e);
      setErr(e?.message || "Failed to import file.");
    } finally {
      setBusy(false);
    }
  };

  const onChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFile(file);
    e.target.value = ""; // allow picking the same file again
  };

  const onDrop: React.DragEventHandler<HTMLSpanElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) await handleFile(f);
  };

  const onDrag: React.DragEventHandler<HTMLSpanElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  };

  return (
    <div style={{ display: "inline-block" }}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        onChange={onChange}
        hidden
      />
      <button className="btn" onClick={openPicker} disabled={busy} title="Load Excel">
        {busy ? "Loading..." : "📄 Load Excel"}
      </button>

      <span
        className="btn btn-ghost"
        style={{ marginLeft: 8 }}
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={onDrop}
        title="Drag a file onto this button"
      >
        {dragActive ? "📥 Drop here" : "Or drag & drop"}
      </span>

      {/* Feedback */}
      {msg && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--success)" }}>{msg}</div>
      )}
      {err && (
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--danger)" }}>{err}</div>
      )}

      {/* Tiny preview */}
      {preview && preview.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            border: "1px solid var(--border-light)",
            borderRadius: 8,
            background: "var(--surface)",
            fontSize: 12,
            maxWidth: 520,
          }}
        >
          <div style={{ opacity: 0.8, marginBottom: 4 }}>Preview (first 5 rows):</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {preview.map((r, i) => (
              <li key={i}>
                <strong>{r.address}</strong>
                {typeof r.lat === "number" && typeof r.lng === "number"
                  ? ` — (${r.lat}, ${r.lng})`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}