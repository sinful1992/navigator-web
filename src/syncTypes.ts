// src/syncTypes.ts

export type OpAction = "create" | "update" | "delete";
export type OpEntity = "arrangement" | "session" | "completion" | "address";

export interface SyncOp {
  /** Global idempotency key: `${deviceId}:${opSeq}` */
  id: string;
  deviceId: string;
  opSeq: number;
  entity: OpEntity;
  action: OpAction;
  /** App-level payload (the row or minimal change) */
  payload: any;
  createdAt: string;      // ISO
  /** (Optional) Link to your optimistic update id */
  optimisticId?: string;
}

export type ApplyOpsConflict = {
  entity: OpEntity;
  id: string;
  server: any;
  client: any;
};

export type ApplyOpsResult =
  | { ok: true }
  | { ok: false; retryAfterMs?: number; conflicts?: ApplyOpsConflict[] };
