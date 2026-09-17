import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  PaginatedSales,
  SaleDetail,
  SaleListItem,
  SalePaymentMethod,
  SaleStatus,
} from "@blackbox/shared";
import {
  DEFAULT_SALE_CUSTOMER_NAME,
  nextSaleNumber,
  saleBillTotals,
} from "@blackbox/shared";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager, Repository } from "typeorm";
import { getRequestTenant } from "../common/request-tenant";
import type { TenantContext } from "../common/tenant-context";
import {
  InventoryMovement,
  InventoryOutItem,
  ProductSku,
  Sale,
  SaleLine,
  SalePayment,
  Tenant,
  User,
  Warehouse,
} from "../db/entities";
import { FixedTenantContext } from "../inventory/common/fixed-tenant.context";
import {
  applyInventoryOutBalanceDelta,
  getInventoryOutBalanceQty,
} from "../inventory/inventory-out/inventory-out-balance";
import { CreateSaleDto, ListSalesQueryDto } from "./dto/sale.dto";
import { TillsService } from "../tills/tills.service";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly tills: TillsService,
    private readonly dataSource: DataSource,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleLine) private readonly saleLines: Repository<SaleLine>,
    @InjectRepository(SalePayment)
    private readonly salePayments: Repository<SalePayment>,
  ) {}

  async list(query: ListSalesQueryDto): Promise<PaginatedSales> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.sales
      .createQueryBuilder("s")
      .where("s.tenant_id = :tenantId", { tenantId });

    if (query.warehouseId) {
      qb.andWhere("s.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.status) {
      qb.andWhere("s.status = :status", { status: query.status });
    }
    if (query.dateFrom) {
      qb.andWhere("s.posted_at >= :dateFrom", {
        dateFrom: `${query.dateFrom}T00:00:00.000Z`,
      });
    }
    if (query.dateTo) {
      qb.andWhere("s.posted_at <= :dateTo", {
        dateTo: `${query.dateTo}T23:59:59.999Z`,
      });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere("LOWER(s.sale_number) LIKE :term", { term });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("s.posted_at", "DESC", "NULLS LAST")
      .addOrderBy("s.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const countById = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.saleLines
        .createQueryBuilder("l")
        .select("l.sale_id", "saleId")
        .addSelect("COUNT(*)", "n")
        .where("l.tenant_id = :tenantId", { tenantId })
        .andWhere("l.sale_id IN (:...ids)", { ids })
        .groupBy("l.sale_id")
        .getRawMany<{ saleId: string; n: string }>();
      for (const c of counts) countById.set(c.saleId, Number(c.n));
    }

    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    const warehouseNames = new Map<string, string>();
    if (warehouseIds.length > 0) {
      const warehouses = await this.dataSource
        .getRepository(Warehouse)
        .createQueryBuilder("w")
        .where("w.id IN (:...warehouseIds)", { warehouseIds })
        .getMany();
      for (const w of warehouses) warehouseNames.set(w.id, w.name);
    }

    const items: SaleListItem[] = rows.map((r) => ({
      id: r.id,
      saleNumber: r.saleNumber,
      warehouseId: r.warehouseId,
      warehouseName: warehouseNames.get(r.warehouseId) ?? "—",
      status: r.status as SaleStatus,
      total: toNum(r.total),
      itemCount: countById.get(r.id) ?? 0,
      postedAt: r.postedAt?.toISOString() ?? null,
    }));

    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<SaleDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const header = await this.sales.findOne({
      where: { id, tenantId },
      relations: { warehouse: true },
    });
    if (!header) throw new NotFoundException("Sale not found");
    return this.toDetail(header);
  }

  async create(
    dto: CreateSaleDto,
    user: TenantContext,
    saleId = randomUUID(),
  ): Promise<SaleDetail> {
    const tenantId = this.fixedTenant.tenantId;
    if (!dto.items?.length) {
      throw new BadRequestException("At least one line item is required");
    }
    if (!dto.payments?.length) {
      throw new BadRequestException("At least one payment is required");
    }

    const merged = new Map<
      string,
      {
        productSkuId: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        sellUnit: "pc" | "box";
        barcode: string | null;
      }
    >();
    for (const item of dto.items) {
      const qty = round4(Number(item.quantity));
      const unitPrice = round4(Number(item.unitPrice));
      const lineTotal = round4(Number(item.lineTotal));
      if (!(qty > 0)) {
        throw new BadRequestException("Quantity must be greater than zero");
      }
      const existing = merged.get(item.productSkuId);
      if (existing) {
        existing.quantity = round4(existing.quantity + qty);
        existing.lineTotal = round4(existing.lineTotal + lineTotal);
      } else {
        merged.set(item.productSkuId, {
          productSkuId: item.productSkuId,
          quantity: qty,
          unitPrice,
          lineTotal,
          sellUnit: item.sellUnit ?? "pc",
          barcode: item.barcode ?? null,
        });
      }
    }

    const gstRate = round4(Number(dto.gstRate ?? 0));
    const salesTaxRate = round4(Number(dto.salesTaxRate ?? 0));
    const subtotal = round4(
      [...merged.values()].reduce((sum, line) => sum + line.lineTotal, 0),
    );
    const tax = saleBillTotals(subtotal, gstRate, salesTaxRate);
    const paymentTotal = round4(
      dto.payments.reduce((sum, p) => sum + Number(p.amount), 0),
    );
    if (round4(paymentTotal) !== tax.total) {
      throw new BadRequestException(
        `Payment total (${paymentTotal}) must equal bill total (${tax.total})`,
      );
    }

    const ctx = getRequestTenant();
    const postedAt = new Date();
    const cashPaymentTotal = round4(
      dto.payments
        .filter((p) => p.method === "CASH")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    );

    if (ctx?.userId) {
      await this.tills.assertCanPostSale(
        this.dataSource.manager,
        tenantId,
        ctx.userId,
        user.permissions,
        cashPaymentTotal,
      );
    }

    const customerName =
      dto.customerName?.trim() || DEFAULT_SALE_CUSTOMER_NAME;
    const cashTendered =
      dto.cashTendered != null && dto.cashTendered > 0
        ? round4(dto.cashTendered)
        : null;

    return this.dataSource.transaction(async (manager) => {
      const warehouse = await manager.getRepository(Warehouse).findOne({
        where: { id: dto.warehouseId, tenantId, status: "active" },
      });
      if (!warehouse) {
        throw new BadRequestException("Warehouse not found or inactive");
      }

      const tenant = await manager.getRepository(Tenant).findOne({
        where: { id: tenantId },
      });
      const saleNumber =
        dto.saleNumber?.trim() ||
        (await this.allocateSaleNumber(manager, tenantId, tenant?.name ?? "Store"));

      let postedByName: string | null = null;
      if (ctx?.userId) {
        const postedUser = await manager.getRepository(User).findOne({
          where: { id: ctx.userId, tenantId },
        });
        postedByName = postedUser?.fullName?.trim() || null;
      }

      const header = manager.create(Sale, {
        id: saleId,
        tenantId,
        warehouseId: warehouse.id,
        saleNumber,
        status: "POSTED",
        subtotal: String(subtotal),
        gstRate: String(gstRate),
        gstAmount: String(tax.gstAmount),
        salesTaxRate: String(salesTaxRate),
        salesTaxAmount: String(tax.salesTaxAmount),
        total: String(tax.total),
        customerName,
        deviceId: ctx?.deviceId ?? null,
        postedBy: ctx?.userId ?? null,
        postedByName,
        postedAt,
        cashTendered:
          cashTendered != null ? String(cashTendered) : null,
        notes: dto.notes?.trim() ?? "",
      });
      await manager.save(header);

      const detailLines: SaleDetail["items"] = [];

      for (const line of merged.values()) {
        const productSku = await manager.getRepository(ProductSku).findOne({
          where: { id: line.productSkuId, tenantId, status: "active" },
          relations: { product: true },
        });
        if (!productSku) {
          throw new BadRequestException(
            `Product SKU ${line.productSkuId} not found or inactive`,
          );
        }

        const balanceQty = await getInventoryOutBalanceQty(
          manager,
          tenantId,
          warehouse.id,
          line.productSkuId,
        );
        if (line.quantity > balanceQty) {
          throw new BadRequestException(
            `Sale exceeds POS balance for ${productSku.sku}: requested ${line.quantity}, available ${balanceQty}`,
          );
        }

        const balance = await manager.getRepository(InventoryOutItem).findOne({
          where: {
            tenantId,
            warehouseId: warehouse.id,
            productSkuId: line.productSkuId,
          },
        });
        const unitCost = balance ? toNum(balance.unitCost) : toNum(productSku.costPrice);

        const lineId = randomUUID();
        await manager.save(
          manager.create(SaleLine, {
            id: lineId,
            tenantId,
            saleId: header.id,
            productSkuId: line.productSkuId,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            lineTotal: String(line.lineTotal),
            sellUnit: line.sellUnit,
            barcode: line.barcode,
          }),
        );

        await applyInventoryOutBalanceDelta(
          manager,
          tenantId,
          warehouse.id,
          line.productSkuId,
          -line.quantity,
          unitCost,
        );

        const movementId = randomUUID();
        await manager.save(
          manager.create(InventoryMovement, {
            id: movementId,
            tenantId,
            productSkuId: line.productSkuId,
            warehouseId: warehouse.id,
            movementType: "SALE",
            quantity: String(line.quantity),
            referenceType: "sale",
            referenceId: header.id,
            reason: `Sale ${saleNumber}`,
          }),
        );

        detailLines.push({
          id: lineId,
          productSkuId: line.productSkuId,
          productName: productSku.product?.name ?? "—",
          variantName: productSku.variantName,
          sku: productSku.sku,
          barcode: line.barcode ?? productSku.barcode,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          sellUnit: line.sellUnit,
        });
      }

      const detailPayments: SaleDetail["payments"] = [];
      for (const payment of dto.payments) {
        const paymentId = randomUUID();
        await manager.save(
          manager.create(SalePayment, {
            id: paymentId,
            tenantId,
            saleId: header.id,
            method: payment.method,
            amount: String(round4(Number(payment.amount))),
            reference: payment.reference?.trim() ?? "",
          }),
        );
        detailPayments.push({
          id: paymentId,
          method: payment.method as SalePaymentMethod,
          amount: round4(Number(payment.amount)),
          reference: payment.reference?.trim() ?? "",
        });
      }

      if (ctx?.userId) {
        await this.tills.applyCashFromSale(
          manager,
          tenantId,
          ctx.userId,
          user.permissions,
          cashPaymentTotal,
        );
      }

      const detail: SaleDetail = {
        id: header.id,
        saleNumber: header.saleNumber,
        warehouseId: header.warehouseId,
        warehouseName: warehouse.name,
        status: "POSTED",
        subtotal,
        gstRate,
        gstAmount: tax.gstAmount,
        salesTaxRate,
        salesTaxAmount: tax.salesTaxAmount,
        total: tax.total,
        customerName: header.customerName,
        cashTendered: header.cashTendered
          ? toNum(header.cashTendered)
          : null,
        notes: header.notes,
        deviceId: header.deviceId,
        postedBy: header.postedBy,
        postedByName: header.postedByName,
        postedAt: postedAt.toISOString(),
        items: detailLines,
        payments: detailPayments,
        createdAt: header.createdAt.toISOString(),
        updatedAt: header.updatedAt.toISOString(),
      };

      return detail;
    });
  }

  async void(id: string): Promise<SaleDetail> {
    const tenantId = this.fixedTenant.tenantId;
    return this.dataSource.transaction(async (manager) => {
      const header = await manager.getRepository(Sale).findOne({
        where: { id, tenantId },
        relations: { warehouse: true },
      });
      if (!header) throw new NotFoundException("Sale not found");
      if (header.status === "VOID") {
        throw new BadRequestException("Sale is already void");
      }
      if (header.status !== "POSTED") {
        throw new BadRequestException("Only posted sales can be voided");
      }

      const lines = await manager.getRepository(SaleLine).find({
        where: { saleId: id, tenantId },
      });

      for (const line of lines) {
        const qty = toNum(line.quantity);
        const balance = await manager.getRepository(InventoryOutItem).findOne({
          where: {
            tenantId,
            warehouseId: header.warehouseId,
            productSkuId: line.productSkuId,
          },
        });
        const unitCost = balance
          ? toNum(balance.unitCost)
          : toNum(line.unitPrice);
        await applyInventoryOutBalanceDelta(
          manager,
          tenantId,
          header.warehouseId,
          line.productSkuId,
          qty,
          unitCost,
        );
      }

      header.status = "VOID";
      header.updatedAt = new Date();
      await manager.save(header);

      return this.toDetail(header, manager);
    });
  }

  private async toDetail(
    header: Sale,
    manager?: EntityManager,
  ): Promise<SaleDetail> {
    const tenantId = header.tenantId;
    const lineRepo = manager
      ? manager.getRepository(SaleLine)
      : this.saleLines;
    const payRepo = manager
      ? manager.getRepository(SalePayment)
      : this.salePayments;

    const lines = await lineRepo.find({
      where: { saleId: header.id, tenantId },
      relations: { productSku: { product: true } },
      order: { createdAt: "ASC" },
    });
    const payments = await payRepo.find({
      where: { saleId: header.id, tenantId },
      order: { createdAt: "ASC" },
    });

    return {
      id: header.id,
      saleNumber: header.saleNumber,
      warehouseId: header.warehouseId,
      warehouseName: header.warehouse?.name ?? "—",
      status: header.status as SaleStatus,
      subtotal: toNum(header.subtotal),
      gstRate: toNum(header.gstRate),
      gstAmount: toNum(header.gstAmount),
      salesTaxRate: toNum(header.salesTaxRate),
      salesTaxAmount: toNum(header.salesTaxAmount),
      total: toNum(header.total),
      customerName: header.customerName ?? DEFAULT_SALE_CUSTOMER_NAME,
      cashTendered: header.cashTendered ? toNum(header.cashTendered) : null,
      notes: header.notes,
      deviceId: header.deviceId,
      postedBy: header.postedBy,
      postedByName: header.postedByName,
      postedAt: header.postedAt?.toISOString() ?? null,
      items: lines.map((l) => ({
        id: l.id,
        productSkuId: l.productSkuId,
        productName: l.productSku?.product?.name ?? "—",
        variantName: l.productSku?.variantName ?? "",
        sku: l.productSku?.sku ?? "—",
        barcode: l.barcode ?? l.productSku?.barcode ?? null,
        quantity: toNum(l.quantity),
        unitPrice: toNum(l.unitPrice),
        lineTotal: toNum(l.lineTotal),
        sellUnit: (l.sellUnit as "pc" | "box") ?? "pc",
      })),
      payments: payments.map((p) => ({
        id: p.id,
        method: p.method as SalePaymentMethod,
        amount: toNum(p.amount),
        reference: p.reference,
      })),
      createdAt: header.createdAt.toISOString(),
      updatedAt: header.updatedAt.toISOString(),
    };
  }

  private async allocateSaleNumber(
    manager: EntityManager,
    tenantId: string,
    businessName: string,
  ): Promise<string> {
    const existing = await manager
      .getRepository(Sale)
      .createQueryBuilder("s")
      .select("s.sale_number", "saleNumber")
      .where("s.tenant_id = :tenantId", { tenantId })
      .getRawMany<{ saleNumber: string }>();
    return nextSaleNumber(
      businessName,
      existing.map((r) => r.saleNumber),
    );
  }
}
