// src/syncApi.ts
import type { SyncOp, ApplyOpsResult, ApplyOpsConflict } from "./syncTypes";
import { supabase } from "./supabaseClient";

type RpcResponse = {
  ok: boolean;
  conflicts?: any[]; // server returns JSONB; we’ll map to typed conflicts
};

export async function applyOps(ops: SyncOp[]): Promise<ApplyOpsResult> {
  try {
    // Guard
    if (!ops || ops.length === 0) return { ok: true };

    // Call RPC
    const { data, error } = await supabase.rpc("apply_ops", { ops });

    if (error) {
      console.warn("[applyOps] RPC error:", error);
      // Suggest a small retry; you can tune this
      return { ok: false, retryAfterMs: 1000 };
    }

    const resp = (data || {}) as RpcResponse;

    // Map conflicts
    const conflicts: ApplyOpsConflict[] | undefined = Array.isArray(resp.conflicts)
      ? resp.conflicts.map((c: any) => ({
          entity: c?.entity,
          id: c?.id,
          server: c?.server,
          client: c?.client,
        }))
      : undefined;

    return { ok: !!resp.ok, ...(conflicts && conflicts.length ? { conflicts } : {}) };
  } catch (e) {
    console.warn("[applyOps] exception:", e);
    return { ok: false, retryAfterMs: 1500 };
  }
}
