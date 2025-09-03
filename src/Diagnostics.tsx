// src/Diagnostics.tsx
import * as React from "react";

type Props = {
  deviceId: string;
  opSeq: number;
  queueLength: number;
  lastSyncAt: string | null;
  onPull?: () => void;
};

export default function Diagnostics({
  deviceId,
  opSeq,
  queueLength,
  lastSyncAt,
  onPull,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  return (
    <div style={{ position: "fixed", bottom: 12, right: 12, zIndex: 9999 }}>
      {open ? (
        <div
          style={{
            minWidth: 260,
            padding: 12,
            borderRadius: 10,
            boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
            background: "#0f172a",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Diagnostics</strong>
            <span
              style={{
                marginLeft: "auto",
                padding: "2px 8px",
                borderRadius: 999,
                background: online ? "#16a34a" : "#ef4444",
                fontSize: 12,
              }}
              title={online ? "Online" : "Offline"}
            >
              {online ? "Online" : "Offline"}
            </span>
          </div>
          <div style={{ lineHeight: 1.6 }}>
            <div><b>Device</b>: {deviceId}</div>
            <div><b>Op Seq</b>: {opSeq}</div>
            <div><b>Queue</b>: {queueLength}</div>
            <div><b>Last Sync</b>: {lastSyncAt ?? "—"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={onPull}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #38bdf8",
                background: "transparent",
                color: "#38bdf8",
                cursor: "pointer",
              }}
            >
              Force Pull
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #94a3b8",
                background: "transparent",
                color: "#94a3b8",
                marginLeft: "auto",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title="Open diagnostics"
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #e2e8f0",
            background: "white",
            color: "#0f172a",
            cursor: "pointer",
            fontSize: 13,
            boxShadow: "0 6px 16px rgba(2,6,23,0.10)",
          }}
        >
          Diagnostics
        </button>
      )}
    </div>
  );
}
