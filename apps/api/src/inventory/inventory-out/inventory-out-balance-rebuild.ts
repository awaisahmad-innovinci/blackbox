import type { EntityManager } from "typeorm";
import {
  InventoryOut,
  InventoryOutItem,
  InventoryOutLine,
  InventoryOutReturn,
  InventoryOutReturnItem,
  Sale,
  SaleLine,
  SaleReturn,
  SaleReturnLine,
} from "../../db/entities";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type BalanceAgg = {
  warehouseId: string;
  productSkuId: string;
  qty: number;
  unitCost: number;
};

function balanceKey(warehouseId: string, productSkuId: string): string {
  return `${warehouseId}\0${productSkuId}`;
}

/**
 * Rebuilds POS floor balance (inventory_out_items) from posted documents.
 * Mirrors desktop rebuildInventoryOutBalanceFromDocumentsLocal.
 */
export async function rebuildInventoryOutBalanceFromDocuments(
  manager: EntityManager,
  tenantId: string,
): Promise<void> {
  const net = new Map<string, BalanceAgg>();

  const bump = (
    warehouseId: string,
    productSkuId: string,
    delta: number,
    unitCost: number,
  ): void => {
    if (!warehouseId || !productSkuId) return;
    const d = round4(delta);
    if (d === 0) return;
    const key = balanceKey(warehouseId, productSkuId);
    const cur = net.get(key) ?? {
      warehouseId,
      productSkuId,
      qty: 0,
      unitCost: 0,
    };
    cur.qty = round4(cur.qty + d);
    if (unitCost > 0) cur.unitCost = round4(unitCost);
    net.set(key, cur);
  };

  const postedOuts = await manager.find(InventoryOut, {
    where: { tenantId, status: "POSTED" },
    select: { id: true, warehouseId: true },
  });
  if (postedOuts.length > 0) {
    const outIds = postedOuts.map((o) => o.id);
    const warehouseByOut = new Map(postedOuts.map((o) => [o.id, o.warehouseId]));
    const outLines = await manager
      .createQueryBuilder(InventoryOutLine, "l")
      .where("l.tenant_id = :tenantId", { tenantId })
      .andWhere("l.inventory_out_id IN (:...outIds)", { outIds })
      .getMany();
    for (const line of outLines) {
      const warehouseId = warehouseByOut.get(line.inventoryOutId);
      if (!warehouseId) continue;
      bump(
        warehouseId,
        line.productSkuId,
        toNum(line.quantity),
        toNum(line.unitCost),
      );
    }
  }

  const postedOutReturns = await manager.find(InventoryOutReturn, {
    where: { tenantId, status: "POSTED" },
    select: { id: true, warehouseId: true },
  });
  if (postedOutReturns.length > 0) {
    const returnIds = postedOutReturns.map((r) => r.id);
    const warehouseByReturn = new Map(
      postedOutReturns.map((r) => [r.id, r.warehouseId]),
    );
    const returnItems = await manager
      .createQueryBuilder(InventoryOutReturnItem, "i")
      .where("i.tenant_id = :tenantId", { tenantId })
      .andWhere("i.inventory_out_return_id IN (:...returnIds)", { returnIds })
      .getMany();
    for (const item of returnItems) {
      const warehouseId = warehouseByReturn.get(item.inventoryOutReturnId);
      if (!warehouseId) continue;
      bump(
        warehouseId,
        item.productSkuId,
        -toNum(item.quantity),
        toNum(item.unitCost),
      );
    }
  }

  const postedSales = await manager.find(Sale, {
    where: { tenantId, status: "POSTED" },
    select: { id: true, warehouseId: true },
  });
  if (postedSales.length > 0) {
    const saleIds = postedSales.map((s) => s.id);
    const warehouseBySale = new Map(
      postedSales.map((s) => [s.id, s.warehouseId]),
    );
    const saleLines = await manager
      .createQueryBuilder(SaleLine, "l")
      .where("l.tenant_id = :tenantId", { tenantId })
      .andWhere("l.sale_id IN (:...saleIds)", { saleIds })
      .getMany();
    for (const line of saleLines) {
      const warehouseId = warehouseBySale.get(line.saleId);
      if (!warehouseId) continue;
      const inventoryQty = round4(
        toNum(line.quantity) + toNum(line.focQuantity),
      );
      bump(
        warehouseId,
        line.productSkuId,
        -inventoryQty,
        toNum(line.unitPrice),
      );
    }
  }

  const openReturns = await manager
    .createQueryBuilder(SaleReturn, "r")
    .where("r.tenant_id = :tenantId", { tenantId })
    .andWhere("r.status != :status", { status: "COMPLETED" })
    .getMany();
  if (openReturns.length > 0) {
    const returnIds = openReturns.map((r) => r.id);
    const warehouseByReturn = new Map(
      openReturns.map((r) => [r.id, r.warehouseId]),
    );
    const returnLines = await manager
      .createQueryBuilder(SaleReturnLine, "l")
      .where("l.tenant_id = :tenantId", { tenantId })
      .andWhere("l.sale_return_id IN (:...returnIds)", { returnIds })
      .getMany();
    for (const line of returnLines) {
      const warehouseId = warehouseByReturn.get(line.saleReturnId);
      if (!warehouseId) continue;
      bump(
        warehouseId,
        line.productSkuId,
        toNum(line.quantity),
        toNum(line.unitPrice),
      );
    }
  }

  await manager.delete(InventoryOutItem, { tenantId });

  for (const row of net.values()) {
    if (!(row.qty > 0)) continue;
    await manager.save(
      manager.create(InventoryOutItem, {
        tenantId,
        warehouseId: row.warehouseId,
        productSkuId: row.productSkuId,
        quantity: String(round4(row.qty)),
        unitCost: String(round4(row.unitCost)),
      }),
    );
  }
}