import { BadRequestException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { InventoryOutItem } from "../../db/entities";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Apply a signed delta to the POS out balance row for warehouse + SKU. */
export async function applyInventoryOutBalanceDelta(
  manager: EntityManager,
  tenantId: string,
  warehouseId: string,
  productSkuId: string,
  deltaQty: number,
  unitCost: number,
): Promise<InventoryOutItem | null> {
  const delta = round4(deltaQty);
  if (!(delta !== 0)) return null;

  const repo = manager.getRepository(InventoryOutItem);
  let balance = await repo.findOne({
    where: { tenantId, warehouseId, productSkuId },
    lock: { mode: "pessimistic_write" },
  });

  if (delta > 0) {
    if (balance) {
      const nextQty = round4(toNum(balance.quantity) + delta);
      balance.quantity = String(nextQty);
      balance.unitCost = String(round4(unitCost));
      return repo.save(balance);
    }
    return repo.save(
      repo.create({
        tenantId,
        warehouseId,
        productSkuId,
        quantity: String(delta),
        unitCost: String(round4(unitCost)),
      }),
    );
  }

  const abs = round4(-delta);
  if (!balance) {
    throw new BadRequestException(
      "No inventory out balance for this SKU in the selected warehouse",
    );
  }
  const current = toNum(balance.quantity);
  if (abs > current) {
    throw new BadRequestException(
      `Return quantity exceeds out balance: requested ${abs}, available ${current}`,
    );
  }
  const nextQty = round4(current - abs);
  if (nextQty <= 0) {
    await repo.remove(balance);
    return null;
  }
  balance.quantity = String(nextQty);
  return repo.save(balance);
}

export async function getInventoryOutBalanceQty(
  manager: EntityManager,
  tenantId: string,
  warehouseId: string,
  productSkuId: string,
): Promise<number> {
  const balance = await manager.getRepository(InventoryOutItem).findOne({
    where: { tenantId, warehouseId, productSkuId },
  });
  return balance ? toNum(balance.quantity) : 0;
}
