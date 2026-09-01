import type { EntityManager } from "typeorm";
import { businessInitials } from "@blackbox/shared";
import { Tenant } from "../../db/entities";

export async function tenantInitials(
  manager: EntityManager,
  tenantId: string,
): Promise<string> {
  const tenant = await manager.getRepository(Tenant).findOne({
    where: { id: tenantId },
  });
  return businessInitials(tenant?.name ?? "");
}
