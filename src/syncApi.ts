// src/syncApi.ts - FIXED VERSION
import type { SyncOp, ApplyOpsResult, ApplyOpsConflict } from "./syncTypes";
// 🔧 FIXED: Changed import to use the correct supabase client
import { supabase } from "./lib/supabaseClient";

type RpcResponse = {
  ok?: boolean;
  conflicts?: any[]; // JSONB array from SQL
};

export async function applyOps(ops: SyncOp[]): Promise<ApplyOpsResult> {
  try {
    if (!ops || ops.length === 0) return { ok: true };

    // Cast through `any` because we don't have generated Database typings.
    const { data, error } = await (supabase as any).rpc(
      "apply_ops",
      { ops } as any
    );

    if (error) {
      console.warn("[applyOps] RPC error:", error);
      return { ok: false, retryAfterMs: 1000 };
    }

    // Supabase can return JSON already parsed; rarely it may be a string.
    let resp: RpcResponse = data as RpcResponse;
    if (typeof resp === "string") {
      try { resp = JSON.parse(resp) as RpcResponse; } catch { /* ignore */ }
    }

    const conflicts: ApplyOpsConflict[] | undefined = Array.isArray(resp?.conflicts)
      ? resp!.conflicts.map((c: any) => ({
          entity: c?.entity,
          id: c?.id,
          server: c?.server,
          client: c?.client,
        }))
      : undefined;

    return { ok: !!resp?.ok, ...(conflicts && conflicts.length ? { conflicts } : {}) };
  } catch (e) {
    console.warn("[applyOps] exception:", e);
    return { ok: false, retryAfterMs: 1500 };
  }
}