import type { InventoryOutDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertInventoryOutLocal(detail: InventoryOutDetail): void {
  const db = getLocalDb();
  // #region agent log
  {
    const conflict = db
      .prepare(
        `select id, out_number as outNumber, status, sync_status as syncStatus,
           (select count(*) from local_sync_outbox o
            where o.entity_id = inventory_outs.id and o.status != 'acked') as pendingOutbox
         from inventory_outs
         where tenant_id = @tenantId and out_number = @outNumber and id != @id`,
      )
      .get({
        tenantId: DEMO_STORE_TENANT_ID,
        outNumber: detail.outNumber,
        id: detail.id,
      }) as
      | {
          id: string;
          outNumber: string;
          status: string;
          syncStatus: string;
          pendingOutbox: number;
        }
      | undefined;
    const sameId = db
      .prepare(
        "select out_number as outNumber from inventory_outs where id = ?",
      )
      .get(detail.id) as { outNumber: string } | undefined;
    fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "5b973a",
      },
      body: JSON.stringify({
        sessionId: "5b973a",
        runId: "run1",
        hypothesisId: "A/B/E",
        location: "inventory-out-local.ts:upsertInventoryOutLocal",
        message: "inventory out upsert pre-check",
        data: {
          incomingId: detail.id.slice(0, 8),
          incomingNumber: detail.outNumber,
          sameIdExists: Boolean(sameId),
          sameIdNumber: sameId?.outNumber ?? null,
          conflict: conflict
            ? {
                id: conflict.id.slice(0, 8),
                status: conflict.status,
                syncStatus: conflict.syncStatus,
                pendingOutbox: conflict.pendingOutbox,
              }
            : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  const tx = db.transaction(() => {
    db.prepare(
      `insert into inventory_outs (
        id, tenant_id, out_number, warehouse_id, out_date, reference, notes,
        status, subtotal, total, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @outNumber, @warehouseId, @outDate, @reference, @notes,
        @status, @subtotal, @total, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )
      on conflict(id) do update set
        out_number = excluded.out_number,
        warehouse_id = excluded.warehouse_id,
        out_date = excluded.out_date,
        reference = excluded.reference,
        notes = excluded.notes,
        status = excluded.status,
        subtotal = excluded.subtotal,
        total = excluded.total,
        updated_at = excluded.updated_at,
        sync_status = 'synced',
        server_updated_at = excluded.server_updated_at`,
    ).run({
      id: detail.id,
      tenantId: DEMO_STORE_TENANT_ID,
      outNumber: detail.outNumber,
      warehouseId: detail.warehouseId,
      outDate: detail.outDate,
      reference: detail.reference,
      notes: detail.notes,
      status: detail.status,
      subtotal: detail.subtotal,
      total: detail.total,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      serverUpdatedAt: detail.updatedAt,
    });

    db.prepare("delete from inventory_out_lines where inventory_out_id = ?").run(
      detail.id,
    );

    const insertLine = db.prepare(
      `insert into inventory_out_lines (
        id, tenant_id, inventory_out_id, product_sku_id, quantity, unit_cost,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @inventoryOutId, @productSkuId, @quantity, @unitCost,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertLine.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        inventoryOutId: detail.id,
        productSkuId: item.productSkuId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}

export function upsertInventoryOutsLocal(rows: InventoryOutDetail[]): void {
  const db = getLocalDb();
  // #region agent log
  {
    const byNumber = new Map<string, number>();
    for (const row of rows) {
      byNumber.set(row.outNumber, (byNumber.get(row.outNumber) ?? 0) + 1);
    }
    const duplicateNumbers = [...byNumber.entries()]
      .filter(([, count]) => count > 1)
      .map(([outNumber, count]) => ({ outNumber, count }));
    fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "5b973a",
      },
      body: JSON.stringify({
        sessionId: "5b973a",
        runId: "run1",
        hypothesisId: "C/D",
        location: "inventory-out-local.ts:upsertInventoryOutsLocal",
        message: "inventory out batch received",
        data: {
          batchSize: rows.length,
          duplicateNumbers,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  const tx = db.transaction(() => {
    for (const row of rows) {
      try {
        upsertInventoryOutLocal(row);
      } catch (err) {
        // #region agent log
        fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "5b973a",
          },
          body: JSON.stringify({
            sessionId: "5b973a",
            runId: "run1",
            hypothesisId: "D",
            location: "inventory-out-local.ts:upsertInventoryOutsLocal:catch",
            message: "inventory out row failed and page will roll back",
            data: {
              failedId: row.id.slice(0, 8),
              failedNumber: row.outNumber,
              error: err instanceof Error ? err.message : String(err),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        throw err;
      }
    }
  });
  tx();
}
