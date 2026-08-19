export const SYNC_STREAMS = [
  "auth_snapshot",
  "master_data",
  "inventory",
  "purchasing",
] as const;

export type SyncStream = (typeof SYNC_STREAMS)[number];

export const SYNC_OPERATIONS = ["UPSERT", "DELETE", "EVENT"] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export const SYNC_PUSH_BATCH_SIZE = 100;
export const SYNC_PULL_BATCH_SIZE = 200;
export const SYNC_MAX_BODY_BYTES = 1024 * 1024;
export const SYNC_MAX_PAYLOAD_BYTES = 64 * 1024;

export type MasterDataEntityType =
  | "unit"
  | "brand"
  | "category"
  | "warehouse"
  | "vendor_group"
  | "product"
  | "product_sku"
  | "vendor"
  | "vendor_sku";

export type InventoryEntityType =
  | "inventory_movement"
  | "inventory_stock";

export type PurchasingEntityType =
  | "purchase_order"
  | "goods_receipt"
  | "inventory_out";

export type SyncEntityType =
  | MasterDataEntityType
  | InventoryEntityType
  | PurchasingEntityType
  | "auth_snapshot";

export interface SyncChangeInput {
  changeId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  baseEntityVersion: number;
  payload: Record<string, unknown>;
}

export interface SyncPushRequest {
  stream: SyncStream;
  changes: SyncChangeInput[];
}

export type SyncPushItemStatus = "acked" | "duplicate" | "rejected" | "conflict";

export interface SyncPushItemResult {
  changeId: string;
  status: SyncPushItemStatus;
  seq?: string;
  message?: string;
  retryable?: boolean;
}

export interface SyncPushResponse {
  results: SyncPushItemResult[];
}

export interface SyncChangeDto {
  seq: string;
  changeId: string;
  originDeviceId: string;
  stream: SyncStream;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  entityVersion: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncPullResponse {
  changes: SyncChangeDto[];
  nextCursor: string;
  hasMore: boolean;
  serverSeq: string;
}

export interface SyncStreamStatus {
  stream: SyncStream;
  serverSeq: string;
  deviceCursor: string;
  lag: number;
  pendingConflicts: number;
}

export interface SyncStatusResponse {
  tenantId: string;
  deviceId: string;
  deviceStatus: string;
  lastSyncAt: string | null;
  lastError: string | null;
  needsFullResync: boolean;
  streams: SyncStreamStatus[];
}

export interface SyncConflictAckRequest {
  conflictId: string;
  resolution: "accepted_local" | "accepted_cloud" | "merged";
}

export function streamForEntity(entityType: SyncEntityType): SyncStream {
  if (entityType === "auth_snapshot") return "auth_snapshot";
  if (
    entityType === "inventory_movement" ||
    entityType === "inventory_stock"
  ) {
    return "inventory";
  }
  if (
    entityType === "purchase_order" ||
    entityType === "goods_receipt" ||
    entityType === "inventory_out"
  ) {
    return "purchasing";
  }
  return "master_data";
}
