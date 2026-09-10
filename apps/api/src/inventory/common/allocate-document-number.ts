import type { EntityManager } from "typeorm";
import {
  nextSequentialCode,
  outNumberPrefix,
  poNumberPrefix,
  receiptNumberPrefix,
  vendorCodePrefix,
} from "@blackbox/shared";
import {
  GoodsReceipt,
  InventoryOut,
  PurchaseOrder,
  Tenant,
  Vendor,
} from "../../db/entities";
import { tenantInitials } from "./tenant-initials";

export async function allocateVendorCode(
  manager: EntityManager,
  tenantId: string,
): Promise<string> {
  const initials = await tenantInitials(manager, tenantId);
  const prefix = vendorCodePrefix(initials);
  const rows = await manager.getRepository(Vendor).find({
    where: { tenantId },
    select: { vendorCode: true },
  });
  return nextSequentialCode(
    prefix,
    rows.map((row) => row.vendorCode),
  );
}

export async function allocatePoNumber(
  manager: EntityManager,
  tenantId: string,
): Promise<string> {
  const initials = await tenantInitials(manager, tenantId);
  const prefix = poNumberPrefix(initials);
  const rows = await manager.getRepository(PurchaseOrder).find({
    where: { tenantId },
    select: { poNumber: true },
  });
  return nextSequentialCode(
    prefix,
    rows.map((row) => row.poNumber),
  );
}

export async function allocateReceiptNumber(
  manager: EntityManager,
  tenantId: string,
): Promise<string> {
  const initials = await tenantInitials(manager, tenantId);
  const prefix = receiptNumberPrefix(initials);
  const rows = await manager.getRepository(GoodsReceipt).find({
    where: { tenantId },
    select: { receiptNumber: true },
  });
  return nextSequentialCode(
    prefix,
    rows.map((row) => row.receiptNumber),
  );
}

export async function allocateOutNumber(
  manager: EntityManager,
  tenantId: string,
): Promise<string> {
  const initials = await tenantInitials(manager, tenantId);
  const prefix = outNumberPrefix(initials);
  const rows = await manager.getRepository(InventoryOut).find({
    where: { tenantId },
    select: { outNumber: true },
  });
  return nextSequentialCode(
    prefix,
    rows.map((row) => row.outNumber),
  );
}

export async function loadTenantName(
  manager: EntityManager,
  tenantId: string,
): Promise<string> {
  const tenant = await manager.getRepository(Tenant).findOne({
    where: { id: tenantId },
  });
  return tenant?.name?.trim() ?? "";
}
