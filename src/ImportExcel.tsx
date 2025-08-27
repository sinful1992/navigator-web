// src/ImportExcel.tsx
import * as React from "react";
import * as XLSX from "xlsx";
import type { AddressRow } from "./types";

type Props = {
  onImported: (rows: AddressRow[]) => void;
};

export function ImportExcel({ onImported }: Props) {
  const onFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (!rows.length) {
        alert("File is empty.");
        return;
      }

      const header = (rows[0] || []).map((x) =>
        String(x ?? "").trim().toLowerCase()
      );

      // address column: best effort
      let addrIdx = header.findIndex((h) => h.includes("address"));
      if (addrIdx === -1) addrIdx = 0; // fallback to first column

      // detect lat/lng columns
      const latRaw = header.findIndex(
        (h) => h === "lat" || h.includes("latitude")
      );
      const lngRaw = header.findIndex(
        (h) => h === "lng" || h === "lon" || h.includes("longitude")
      );

      // Convert to union types once (number | undefined)
      const latCol: number | undefined = latRaw === -1 ? undefined : latRaw;
      const lngCol: number | undefined = lngRaw === -1 ? undefined : lngRaw;

      const out: AddressRow[] = [];

      // data rows
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const address = String(row[addrIdx] ?? "").trim();
        if (!address) continue;

        const lat =
          latCol !== undefined && row[latCol] != null && row[latCol] !== ""
            ? toNumber(row[latCol])
            : undefined;

        const lng =
          lngCol !== undefined && row[lngCol] != null && row[lngCol] !== ""
            ? toNumber(row[lngCol])
            : undefined;

        out.push({ address, lat, lng });
      }

      onImported(out);
    } catch (err) {
      console.error(err);
      alert("Failed to read Excel file.");
    } finally {
      // allow re-selecting the same file later
      e.target.value = "";
    }
  };

  return (
    <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span>Load Excel</span>
      <input type="file" accept=".xlsx,.xls" onChange={onFile} />
    </label>
  );
}

function toNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
