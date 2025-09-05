// src/ImportExcel.tsx
import * as React from "react";
import * as XLSX from "xlsx";
import type { AddressRow } from "./types";

type Props = {
  /** Called with normalized rows: { address: string, lat?: number, lng?: number }[] */
  onImported: (rows: AddressRow[]) => void | Promise<void>;
};

export function ImportExcel({ onImported }: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handlePick = () => inputRef.current?.click();

  const handleFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // First sheet
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];

      // Parse to JSON, keep headers
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        raw: true,
      });

      // Normalize column names case-insensitively
      const normKey = (k: string) => k.trim().toLowerCase();

      const rows: AddressRow[] = raw
        .map((r) => {
          const keys = Object.keys(r).reduce<Record<string, any>>((acc, k) => {
            acc[normKey(k)] = r[k];
            return acc;
          }, {});

          // Accept header variants like "address", "Address", "ADDRESS"
          const addrRaw = String(keys["address"] ?? "").trim();

          if (!addrRaw) return null;

          // lat/lng parse (if present)
          const latVal = keys["lat"];
          const lngVal = keys["lng"];

          const lat =
            latVal === undefined || latVal === ""
              ? undefined
              : Number.isFinite(Number(latVal))
              ? Number(latVal)
              : undefined;

          const lng =
            lngVal === undefined || lngVal === ""
              ? undefined
              : Number.isFinite(Number(lngVal))
              ? Number(lngVal)
              : undefined;

          const row: AddressRow = { address: addrRaw };
          if (typeof lat === "number") row.lat = lat;
          if (typeof lng === "number") row.lng = lng;

          return row;
        })
        .filter((r): r is AddressRow => !!r);

      await onImported(rows);
    } catch (err) {
      console.error("Import failed:", err);
      alert("Import failed. Please check your file format.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button className="btn btn-primary" onClick={handlePick} disabled={busy}>
        {busy ? "Importing..." : "Import Excel"}
      </button>
    </>
  );
}