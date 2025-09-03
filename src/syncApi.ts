// src/syncApi.ts
import type { SyncOp, ApplyOpsResult } from "./syncTypes";

/**
 * Temporary stub. Step 3 will replace this with a Supabase-backed RPC.
 * For now, it pretends the server accepted the batch.
 */
export async function applyOps(_ops: SyncOp[]): Promise<ApplyOpsResult> {
  // Simulate small network latency
  await new Promise((r) => setTimeout(r, 50));
  // Always succeed in Step 2
  return { ok: true };
}
