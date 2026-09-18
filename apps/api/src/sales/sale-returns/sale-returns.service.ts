import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  PaginatedSaleReturns,
  ReturnableSaleLine,
  SaleDetail,
  SalePaymentMethod,
  SaleReturnDetail,
  SaleReturnLineRow,
  SaleReturnListItem,
} from "@blackbox/shared";
import {
  lineTotalAfterDiscount,
  nextSaleReturnNumber,
  saleBillTotals,
} from "@blackbox/shared";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager, Repository } from "typeorm";
import type { TenantContext } from "../../common/tenant-context";
import {
  InventoryMovement,
  InventoryOutItem,
  ProductSku,
  Sale,
  SaleLine,
  SalePayment,
  SaleReturn,
  SaleReturnLine,
  Tenant,
  User,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../../inventory/common/fixed-tenant.context";
import { applyInventoryOutBalanceDelta } from "../../inventory/inventory-out/inventory-out-balance";
import { SalesService } from "../sales.service";
import {
  CreateSaleReturnDto,
  ListSaleReturnsQueryDto,
} from "./dto/sale-return.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class SaleReturnsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    private readonly salesService: SalesService,
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(SaleReturnLine)
    private readonly saleReturnLines: Repository<SaleReturnLine>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleLine) private readonly saleLines: Repository<SaleLine>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async returnableLines(saleId: string): Promise<ReturnableSaleLine[]> {
    const tenantId = this.fixedTenant.tenantId;
    const sale = await this.sales.findOne({
      where: { id: saleId, tenantId, status: "POSTED" },
    });
    if (!sale) throw new NotFoundException("Posted sale not found");

    const lines = await this.saleLines.find({
      where: { saleId, tenantId },
      relations: { productSku: { product: true } },
      order: { createdAt: "ASC" },
    });

    const returnedByLine = await this.returnedQtyBySaleLine(
      tenantId,
      lines.map((l) => l.id),
    );

    return lines
      .map((line) => {
        const soldQuantity = toNum(line.quantity);
        const returnedQuantity = returnedByLine.get(line.id) ?? 0;
        const returnableQuantity = round4(soldQuantity - returnedQuantity);
        return {
          saleLineId: line.id,
          productSkuId: line.productSkuId,
          productName: line.productSku?.product?.name ?? "—",
          variantName: line.productSku?.variantName ?? "",
          sku: line.productSku?.sku ?? "—",
          barcode: line.barcode ?? line.productSku?.barcode ?? null,
          soldQuantity,
          returnedQuantity,
          returnableQuantity,
          unitPrice: toNum(line.unitPrice),
          discountPercent: toNum(line.discountPercent),
          sellUnit: (line.sellUnit as "pc" | "box") ?? "pc",
        };
      })
      .filter((line) => line.returnableQuantity > 0);
  }

  async list(query: ListSaleReturnsQueryDto): Promise<PaginatedSaleReturns> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.saleReturns
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.sale", "sale")
      .leftJoinAndSelect("r.warehouse", "warehouse")
      .leftJoinAndSelect("r.processedByUser", "processor")
      .where("r.tenant_id = :tenantId", { tenantId });

    if (query.warehouseId) {
      qb.andWhere("r.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.saleId) {
      qb.andWhere("r.sale_id = :saleId", { saleId: query.saleId });
    }
    if (query.dateFrom) {
      qb.andWhere("r.return_date >= :dateFrom", { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere("r.return_date <= :dateTo", { dateTo: query.dateTo });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(r.return_number) LIKE :term OR LOWER(sale.sale_number) LIKE :term)`,
        { term },
      );
    }
    if (query.hasFoc === true) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM sale_lines sl
          WHERE sl.sale_id = r.sale_id AND sl.tenant_id = r.tenant_id
            AND COALESCE(sl.foc_quantity, 0) > 0
        )`,
      );
    } else if (query.hasFoc === false) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM sale_lines sl
          WHERE sl.sale_id = r.sale_id AND sl.tenant_id = r.tenant_id
            AND COALESCE(sl.foc_quantity, 0) > 0
        )`,
      );
    }

    const total = await qb.getCount();
    const sumRow = await qb
      .clone()
      .select("COALESCE(SUM(r.refund_total), 0)", "refundTotalSum")
      .getRawOne<{ refundTotalSum: string }>();
    const refundTotalSum = toNum(sumRow?.refundTotalSum);

    const rows = await qb
      .orderBy("r.return_date", "DESC")
      .addOrderBy("r.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const lineCounts = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.saleReturnLines
        .createQueryBuilder("l")
        .select("l.sale_return_id", "returnId")
        .addSelect("COUNT(*)", "n")
        .where("l.tenant_id = :tenantId", { tenantId })
        .andWhere("l.sale_return_id IN (:...ids)", { ids })
        .groupBy("l.sale_return_id")
        .getRawMany<{ returnId: string; n: string }>();
      for (const c of counts) lineCounts.set(c.returnId, Number(c.n));
    }

    const items: SaleReturnListItem[] = rows.map((row) => ({
      id: row.id,
      returnNumber: row.returnNumber,
      saleId: row.saleId,
      saleNumber: row.sale?.saleNumber ?? "—",
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse?.name ?? "—",
      returnDate: row.returnDate,
      refundTotal: toNum(row.refundTotal),
      refundMethod: row.refundMethod as SalePaymentMethod,
      lineCount: lineCounts.get(row.id) ?? 0,
      processedByName: row.processedByUser?.fullName?.trim() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize, refundTotalSum };
  }

  async getById(id: string): Promise<SaleReturnDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const header = await this.saleReturns.findOne({
      where: { id, tenantId },
      relations: {
        sale: { warehouse: true },
        warehouse: true,
        processedByUser: true,
      },
    });
    if (!header) throw new NotFoundException("Sale return not found");
    return this.toDetail(header);
  }

  async create(
    dto: CreateSaleReturnDto,
    user: TenantContext,
  ): Promise<SaleReturnDetail> {
    const tenantId = this.fixedTenant.tenantId;
    if (!dto.items?.length) {
      throw new BadRequestException("At least one return line is required");
    }

    const seenLineIds = new Set<string>();
    for (const item of dto.items) {
      if (seenLineIds.has(item.saleLineId)) {
        throw new BadRequestException(
          "Duplicate sale line on return; combine quantities",
        );
      }
      seenLineIds.add(item.saleLineId);
    }

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.getRepository(Sale).findOne({
        where: { id: dto.saleId, tenantId, status: "POSTED" },
        relations: { warehouse: true, payments: true },
      });
      if (!sale) {
        throw new BadRequestException("Original sale must be posted");
      }

      const tenant = await manager.getRepository(Tenant).findOne({
        where: { id: tenantId },
      });
      if (!tenant) throw new BadRequestException("Tenant not found");

      const returnNumber =
        dto.returnNumber?.trim() ||
        (await this.allocateReturnNumber(manager, tenantId, tenant.name));
      const returnDate =
        dto.returnDate?.trim() || new Date().toISOString().slice(0, 10);

      const saleLineRepo = manager.getRepository(SaleLine);
      const saleLinesOnBill = await saleLineRepo.find({
        where: { saleId: sale.id, tenantId },
        relations: { productSku: { product: true } },
      });
      const saleLineById = new Map(saleLinesOnBill.map((l) => [l.id, l]));
      const returnedByLine = await this.returnedQtyBySaleLine(
        tenantId,
        saleLinesOnBill.map((l) => l.id),
        manager,
      );

      const gstRate = toNum(sale.gstRate);
      const salesTaxRate = toNum(sale.salesTaxRate);
      const refundMethod = this.primaryRefundMethod(sale.payments);

      type BuiltLine = {
        saleLineId: string;
        productSkuId: string;
        quantity: number;
        unitPrice: number;
        discountPercent: number;
        lineTotal: number;
        sellUnit: "pc" | "box";
        barcode: string | null;
        productName: string;
        variantName: string;
        sku: string;
      };

      const builtLines: BuiltLine[] = [];
      let subtotal = 0;

      for (const item of dto.items) {
        const saleLine = saleLineById.get(item.saleLineId);
        if (!saleLine) {
          throw new BadRequestException("Return line must belong to the original sale");
        }
        if (saleLine.productSkuId !== item.productSkuId) {
          throw new BadRequestException("Product SKU does not match sale line");
        }

        const qty = round4(Number(item.quantity));
        if (!(qty > 0)) {
          throw new BadRequestException("Return quantity must be greater than zero");
        }

        const soldQty = toNum(saleLine.quantity);
        const alreadyReturned = returnedByLine.get(saleLine.id) ?? 0;
        const returnable = round4(soldQty - alreadyReturned);
        if (qty > returnable) {
          throw new BadRequestException(
            `Return exceeds paid quantity for ${saleLine.productSku?.sku ?? "SKU"}: requested ${qty}, returnable ${returnable}`,
          );
        }

        const unitPrice = toNum(saleLine.unitPrice);
        const discountPercent = toNum(saleLine.discountPercent);
        const lineTotal = lineTotalAfterDiscount(qty, unitPrice, discountPercent);
        subtotal = round4(subtotal + lineTotal);

        builtLines.push({
          saleLineId: saleLine.id,
          productSkuId: saleLine.productSkuId,
          quantity: qty,
          unitPrice,
          discountPercent,
          lineTotal,
          sellUnit: (saleLine.sellUnit as "pc" | "box") ?? "pc",
          barcode: saleLine.barcode ?? saleLine.productSku?.barcode ?? null,
          productName: saleLine.productSku?.product?.name ?? "—",
          variantName: saleLine.productSku?.variantName ?? "",
          sku: saleLine.productSku?.sku ?? "—",
        });
      }

      const tax = saleBillTotals(subtotal, gstRate, salesTaxRate);
      const headerId = randomUUID();
      const processor = await manager.getRepository(User).findOne({
        where: { id: user.userId, tenantId },
      });
      const processorName = processor?.fullName?.trim() || null;

      await manager.save(
        manager.create(SaleReturn, {
          id: headerId,
          tenantId,
          returnNumber,
          saleId: sale.id,
          warehouseId: sale.warehouseId,
          returnDate,
          status: "POSTED",
          subtotal: String(subtotal),
          gstRate: String(gstRate),
          gstAmount: String(tax.gstAmount),
          salesTaxRate: String(salesTaxRate),
          salesTaxAmount: String(tax.salesTaxAmount),
          refundTotal: String(tax.total),
          refundMethod,
          notes: dto.notes?.trim() ?? "",
          processedBy: user.userId,
        }),
      );

      const detailLines: SaleReturnLineRow[] = [];

      for (const line of builtLines) {
        const lineId = randomUUID();
        await manager.save(
          manager.create(SaleReturnLine, {
            id: lineId,
            tenantId,
            saleReturnId: headerId,
            saleLineId: line.saleLineId,
            productSkuId: line.productSkuId,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            discountPercent: String(line.discountPercent),
            lineTotal: String(line.lineTotal),
            sellUnit: line.sellUnit,
            barcode: line.barcode,
          }),
        );

        const balance = await manager.getRepository(InventoryOutItem).findOne({
          where: {
            tenantId,
            warehouseId: sale.warehouseId,
            productSkuId: line.productSkuId,
          },
        });
        const unitCost = balance
          ? toNum(balance.unitCost)
          : line.unitPrice;

        await applyInventoryOutBalanceDelta(
          manager,
          tenantId,
          sale.warehouseId,
          line.productSkuId,
          line.quantity,
          unitCost,
        );

        await manager.save(
          manager.create(InventoryMovement, {
            id: randomUUID(),
            tenantId,
            productSkuId: line.productSkuId,
            warehouseId: sale.warehouseId,
            movementType: "SALE_RETURN",
            quantity: String(line.quantity),
            referenceType: "sale_return",
            referenceId: headerId,
            reason: `Return ${returnNumber} for sale ${sale.saleNumber}`,
          }),
        );

        detailLines.push({
          id: lineId,
          saleLineId: line.saleLineId,
          productSkuId: line.productSkuId,
          productName: line.productName,
          variantName: line.variantName,
          sku: line.sku,
          barcode: line.barcode,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          lineTotal: line.lineTotal,
          sellUnit: line.sellUnit,
        });
      }

      const saved = await manager.getRepository(SaleReturn).findOne({
        where: { id: headerId, tenantId },
        relations: {
          sale: { warehouse: true },
          warehouse: true,
          processedByUser: true,
        },
      });
      if (!saved) throw new BadRequestException("Failed to save return");

      const saleDetail = await this.salesService.getById(sale.id);
      const detail = await this.toDetail(saved);
      detail.processedByName = processorName;
      detail.sale = saleDetail;
      detail.items = detailLines;
      return detail;
    });
  }

  private primaryRefundMethod(
    payments: SalePayment[],
  ): SalePaymentMethod {
    const cash = payments.find((p) => p.method === "CASH");
    if (cash) return "CASH";
    const card = payments.find((p) => p.method === "CARD");
    if (card) return "CARD";
    return (payments[0]?.method as SalePaymentMethod) ?? "CASH";
  }

  private async returnedQtyBySaleLine(
    tenantId: string,
    saleLineIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (saleLineIds.length === 0) return map;

    const repo = manager
      ? manager.getRepository(SaleReturnLine)
      : this.saleReturnLines;

    const rows = await repo
      .createQueryBuilder("l")
      .select("l.sale_line_id", "saleLineId")
      .addSelect("COALESCE(SUM(l.quantity), 0)", "qty")
      .where("l.tenant_id = :tenantId", { tenantId })
      .andWhere("l.sale_line_id IN (:...saleLineIds)", { saleLineIds })
      .groupBy("l.sale_line_id")
      .getRawMany<{ saleLineId: string; qty: string }>();

    for (const row of rows) {
      map.set(row.saleLineId, toNum(row.qty));
    }
    return map;
  }

  private async toDetail(header: SaleReturn): Promise<SaleReturnDetail> {
    const tenantId = header.tenantId;
    const lines = await this.saleReturnLines.find({
      where: { saleReturnId: header.id, tenantId },
      relations: { productSku: { product: true }, saleLine: true },
      order: { createdAt: "ASC" },
    });

    const saleDetail = await this.salesService.getById(header.saleId);

    return {
      id: header.id,
      returnNumber: header.returnNumber,
      saleId: header.saleId,
      saleNumber: header.sale?.saleNumber ?? saleDetail.saleNumber,
      warehouseId: header.warehouseId,
      warehouseName: header.warehouse?.name ?? saleDetail.warehouseName,
      returnDate: header.returnDate,
      status: "POSTED",
      subtotal: toNum(header.subtotal),
      gstRate: toNum(header.gstRate),
      gstAmount: toNum(header.gstAmount),
      salesTaxRate: toNum(header.salesTaxRate),
      salesTaxAmount: toNum(header.salesTaxAmount),
      refundTotal: toNum(header.refundTotal),
      refundMethod: header.refundMethod as SalePaymentMethod,
      notes: header.notes,
      processedBy: header.processedBy,
      processedByName: header.processedByUser?.fullName?.trim() ?? null,
      sale: saleDetail,
      items: lines.map((l) => ({
        id: l.id,
        saleLineId: l.saleLineId,
        productSkuId: l.productSkuId,
        productName: l.productSku?.product?.name ?? "—",
        variantName: l.productSku?.variantName ?? "",
        sku: l.productSku?.sku ?? "—",
        barcode: l.barcode ?? l.productSku?.barcode ?? null,
        quantity: toNum(l.quantity),
        unitPrice: toNum(l.unitPrice),
        discountPercent: toNum(l.discountPercent),
        lineTotal: toNum(l.lineTotal),
        sellUnit: (l.sellUnit as "pc" | "box") ?? "pc",
      })),
      createdAt: header.createdAt.toISOString(),
      updatedAt: header.updatedAt.toISOString(),
    };
  }

  private async allocateReturnNumber(
    manager: EntityManager,
    tenantId: string,
    businessName: string,
  ): Promise<string> {
    const existing = await manager
      .getRepository(SaleReturn)
      .createQueryBuilder("r")
      .select("r.return_number", "returnNumber")
      .where("r.tenant_id = :tenantId", { tenantId })
      .getRawMany<{ returnNumber: string }>();
    return nextSaleReturnNumber(
      businessName,
      existing.map((r) => r.returnNumber),
    );
  }
}
