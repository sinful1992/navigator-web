// src/components/BackupsPanel.tsx
import * as React from "react";
import { listUserBackups, getBackupSignedUrl } from "../backup/listBackups";
import { downloadSnapshot, applySnapshotReplace } from "../backup/restore";
import type { AppState } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
};

export function BackupsPanel({ open, onClose, setState }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<Awaited<ReturnType<typeof listUserBackups>>>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUserBackups(200);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to list backups");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-[min(900px,95vw)] max-h-[85vh] rounded-xl shadow p-4 overflow-hidden flex flex-col">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Backups</h3>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={refresh} disabled={loading} className="border rounded px-3 py-1 text-sm">
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button onClick={onClose} className="border rounded px-3 py-1 text-sm">Close</button>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-3 overflow-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left p-2">Day</th>
                <th className="text-left p-2">Created</th>
                <th className="text-left p-2">Size</th>
                <th className="text-left p-2">Path</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const created = new Date(r.created_at).toLocaleString();
                const kb = Math.max(1, Math.round(r.size_bytes / 1024));
                const working = busyId === r.id;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.day_key}</td>
                    <td className="p-2 whitespace-nowrap">{created}</td>
                    <td className="p-2">{kb} KB</td>
                    <td className="p-2 break-all">{r.object_path}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button
                          className="border rounded px-2 py-1"
                          disabled={working}
                          onClick={async () => {
                            setBusyId(r.id);
                            try {
                              const url = await getBackupSignedUrl(r.object_path, 60);
                              window.open(url, "_blank", "noopener,noreferrer");
                            } catch {
                              alert("Failed to create download link.");
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          {working ? "..." : "Download"}
                        </button>

                        <button
                          className="border rounded px-2 py-1"
                          disabled={working}
                          onClick={async () => {
                            if (!confirm(`Restore snapshot from ${r.day_key}? This will replace current addresses & completions.`)) {
                              return;
                            }
                            setBusyId(r.id);
                            try {
                              const snap = await downloadSnapshot(r.object_path);
                              setState((s) => applySnapshotReplace(s, snap));
                              alert("Restore complete.");
                            } catch (e) {
                              console.error(e);
                              alert("Restore failed.");
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          {working ? "..." : "Restore"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={5}>
                    No backups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Access is restricted by RLS to your own user folder. Links expire quickly for safety.
        </div>
      </div>
    </div>
  );
}
