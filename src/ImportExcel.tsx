// src/ImportExcel.tsx
import * as React from "react";
import * as XLSX from "xlsx";
import type { AddressRow } from "./types";
import { LoadingButton } from "./components/LoadingButton";

type Props = {
  onImported: (rows: AddressRow[]) => void;
};

export function ImportExcel({ onImported }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file) return;
    
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (!rows.length) {
        alert("📄 File appears to be empty. Please check your Excel file.");
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

      if (out.length === 0) {
        alert("🚫 No valid addresses found in the file. Please check the format.");
        return;
      }

      onImported(out);
      
      // Success feedback
      const hasCoords = out.some(row => row.lat != null && row.lng != null);
      const message = `✅ Successfully imported ${out.length} address${out.length === 1 ? '' : 'es'}${
        hasCoords ? ' with GPS coordinates' : ''
      }!`;
      
      // Use a subtle notification instead of alert
      console.log(message);
      
      // You could implement a toast notification here instead
    } catch (err) {
      console.error(err);
      alert("❌ Failed to read Excel file. Please ensure it's a valid .xlsx or .xls file.");
    } finally {
      setLoading(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(file => 
      file.name.endsWith('.xlsx') || 
      file.name.endsWith('.xls') ||
      file.type.includes('spreadsheet')
    );

    if (excelFile) {
      await processFile(excelFile);
    } else {
      alert("📋 Please drop an Excel file (.xlsx or .xls)");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      {/* File Input Button */}
      <div className="file-input-wrapper">
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".xlsx,.xls" 
          onChange={onFile}
          className="file-input"
          id="excel-input"
          disabled={loading}
          style={{ display: 'none' }}
        />
        <LoadingButton
          className="file-input-label btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          isLoading={loading}
          loadingText="Processing..."
          disabled={loading}
        >
          📊 Load Excel
        </LoadingButton>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          padding: "0.75rem 1rem",
          border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border-light)'}`,
          borderRadius: "var(--radius)",
          background: dragActive ? 'var(--primary-light)' : 'var(--bg-tertiary)',
          color: dragActive ? 'var(--primary-dark)' : 'var(--text-muted)',
          fontSize: "0.8125rem",
          textAlign: "center",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
          userSelect: "none",
          minWidth: "140px",
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        {dragActive ? (
          <div>📥 Drop Excel file here</div>
        ) : (
          <div>🖱️ Or drag & drop</div>
        )}
      </div>
    </div>
  );
}

function toNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
