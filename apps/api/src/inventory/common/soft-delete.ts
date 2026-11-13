import type { EntityStatusFilter } from "@blackbox/shared";
import type { ObjectLiteral, SelectQueryBuilder } from "typeorm";

export function applyStatusFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  status: EntityStatusFilter | undefined,
  fallback: EntityStatusFilter = "active",
): SelectQueryBuilder<T> {
  const value = status ?? fallback;
  if (value === "deleted") {
    return qb.andWhere(`${alias}.deleted_at IS NOT NULL`);
  }
  qb.andWhere(`${alias}.deleted_at IS NULL`);
  if (value !== "all") {
    qb.andWhere(`${alias}.status = :${alias}Status`, { [`${alias}Status`]: value });
  }
  return qb;
}

export function toDeletedAt(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
