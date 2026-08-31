import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  PaginatedPurchaseOrders,
  PurchaseOrderDetail,
  PurchaseOrderItemRow,
  PurchaseOrderListItem,
  PurchaseOrderStatus,
} from "@blackbox/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ProductSku,
  PurchaseOrder,
  PurchaseOrderItem,
  Vendor,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  PurchaseOrderItemInputDto,
  UpdatePurchaseOrderDto,
} from "./dto/purchase-order.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly items: Repository<PurchaseOrderItem>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
  ) {}

  async list(query: ListPurchaseOrdersQueryDto): Promise<PaginatedPurchaseOrders> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.orders
      .createQueryBuilder("po")
      .where("po.tenant_id = :tenantId", { tenantId });

    if (query.status) {
      qb.andWhere("po.status = :status", { status: query.status });
    }
    if (query.vendorId) {
      qb.andWhere("po.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    if (query.warehouseId) {
      qb.andWhere("po.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere("po.order_date >= :dateFrom", { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere("po.order_date <= :dateTo", { dateTo: query.dateTo });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(po.po_number) LIKE :term
          OR EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = po.vendor_id AND LOWER(v.name) LIKE :term
          ))`,
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("po.order_date", "DESC")
      .addOrderBy("po.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const itemCounts = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.items
        .createQueryBuilder("i")
        .select("i.purchase_order_id", "poId")
        .addSelect("COUNT(*)", "cnt")
        .where("i.tenant_id = :tenantId", { tenantId })
        .andWhere("i.purchase_order_id IN (:...ids)", { ids })
        .groupBy("i.purchase_order_id")
        .getRawMany<{ poId: string; cnt: string }>();
      for (const row of counts) itemCounts.set(row.poId, Number(row.cnt));
    }

    const vendorNames = new Map<string, string>();
    const warehouseNames = new Map<string, string>();
    const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    if (vendorIds.length > 0) {
      const vendors = await this.vendors
        .createQueryBuilder("v")
        .where("v.id IN (:...vendorIds)", { vendorIds })
        .getMany();
      for (const v of vendors) vendorNames.set(v.id, v.name);
    }
    if (warehouseIds.length > 0) {
      const warehouses = await this.warehouses
        .createQueryBuilder("w")
        .where("w.id IN (:...warehouseIds)", { warehouseIds })
        .getMany();
      for (const w of warehouses) warehouseNames.set(w.id, w.name);
    }

    const items: PurchaseOrderListItem[] = rows.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      vendorName: vendorNames.get(po.vendorId) ?? "—",
      warehouseId: po.warehouseId,
      warehouseName: warehouseNames.get(po.warehouseId) ?? "—",
      status: po.status as PurchaseOrderStatus,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      total: toNum(po.total),
      itemCount: itemCounts.get(po.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const po = await this.orders.findOne({
      where: { id, tenantId },
      relations: { vendor: true, warehouse: true },
    });
    if (!po) throw new NotFoundException("Purchase order not found");

    const lines = await this.items.find({
      where: { purchaseOrderId: id, tenantId },
      relations: {
        productSku: { product: true },
        vendorSku: true,
        purchaseUnit: true,
      },
      order: { createdAt: "ASC" },
    });

    return this.mapDetail(po, lines);
  }

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const enforceMoq = Boolean(dto.submit);

    return this.dataSource.transaction(async (manager) => {
      await this.assertVendorWarehouse(
        manager,
        tenantId,
        dto.vendorId,
        dto.warehouseId,
        enforceMoq,
      );
      const built = await this.buildLines(
        manager,
        tenantId,
        dto.vendorId,
        dto.items,
        enforceMoq,
      );

      if (dto.submit && built.lines.length === 0) {
        throw new BadRequestException("Purchase order must have at least one item");
      }

      const poNumber = await this.nextPoNumber(manager, tenantId);
      const headerDiscount = dto.discount ?? 0;
      const headerTax = dto.tax ?? 0;
      const otherCharges = dto.otherCharges ?? 0;
      const total = round4(
        built.subtotal - headerDiscount + headerTax + otherCharges,
      );

      const saved = await manager.getRepository(PurchaseOrder).save(
        manager.getRepository(PurchaseOrder).create({
          tenantId,
          poNumber,
          vendorId: dto.vendorId,
          warehouseId: dto.warehouseId,
          status: dto.submit ? "SUBMITTED" : "DRAFT",
          orderDate: dto.orderDate ?? new Date().toISOString().slice(0, 10),
          expectedDate: dto.expectedDate || null,
          subtotal: String(built.subtotal),
          discount: String(headerDiscount),
          tax: String(headerTax),
          otherCharges: String(otherCharges),
          total: String(total),
          notes: dto.notes?.trim() ?? "",
        }),
      );

      for (const line of built.lines) {
        await manager.getRepository(PurchaseOrderItem).save(
          manager.getRepository(PurchaseOrderItem).create({
            ...line,
            tenantId,
            purchaseOrderId: saved.id,
          }),
        );
      }

      return this.getByIdInManager(manager, saved.id);
    });
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;

    return this.dataSource.transaction(async (manager) => {
      const po = await manager.getRepository(PurchaseOrder).findOne({
        where: { id, tenantId },
      });
      if (!po) throw new NotFoundException("Purchase order not found");
      if (po.status !== "DRAFT") {
        throw new BadRequestException("Only DRAFT purchase orders can be edited");
      }

      const enforceMoq = Boolean(dto.submit);
      await this.assertVendorWarehouse(
        manager,
        tenantId,
        dto.vendorId,
        dto.warehouseId,
        enforceMoq,
      );
      const built = await this.buildLines(
        manager,
        tenantId,
        dto.vendorId,
        dto.items,
        enforceMoq,
      );

      if (dto.submit && built.lines.length === 0) {
        throw new BadRequestException("Purchase order must have at least one item");
      }

      const headerDiscount = dto.discount ?? 0;
      const headerTax = dto.tax ?? 0;
      const otherCharges = dto.otherCharges ?? 0;
      const total = round4(
        built.subtotal - headerDiscount + headerTax + otherCharges,
      );

      po.vendorId = dto.vendorId;
      po.warehouseId = dto.warehouseId;
      po.orderDate = dto.orderDate ?? po.orderDate;
      po.expectedDate = dto.expectedDate || null;
      po.notes = dto.notes?.trim() ?? "";
      po.subtotal = String(built.subtotal);
      po.discount = String(headerDiscount);
      po.tax = String(headerTax);
      po.otherCharges = String(otherCharges);
      po.total = String(total);
      if (dto.submit) po.status = "SUBMITTED";

      await manager.getRepository(PurchaseOrder).save(po);
      await manager
        .getRepository(PurchaseOrderItem)
        .delete({ purchaseOrderId: id, tenantId });

      for (const line of built.lines) {
        await manager.getRepository(PurchaseOrderItem).save(
          manager.getRepository(PurchaseOrderItem).create({
            ...line,
            tenantId,
            purchaseOrderId: id,
          }),
        );
      }

      return this.getByIdInManager(manager, id);
    });
  }

  async updateItemPrice(
    id: string,
    itemId: string,
    unitCost: number,
    sellingPrice: number,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;

    return this.dataSource.transaction(async (manager) => {
      const poRepo = manager.getRepository(PurchaseOrder);
      const itemRepo = manager.getRepository(PurchaseOrderItem);
      const vendorSkuRepo = manager.getRepository(VendorSku);
      const productSkuRepo = manager.getRepository(ProductSku);

      const po = await poRepo.findOne({
        where: { id, tenantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!po) throw new NotFoundException("Purchase order not found");
      if (po.status !== "SUBMITTED") {
        throw new BadRequestException(
          "SKU price can only be updated while receiving a SUBMITTED purchase order",
        );
      }

      const line = await itemRepo.findOne({
        where: { id: itemId, purchaseOrderId: id, tenantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!line) throw new NotFoundException("Purchase order item not found");
      if (!line.vendorSkuId) {
        throw new BadRequestException(
          "Purchase order item has no linked vendor SKU",
        );
      }

      const vendorSku = await vendorSkuRepo.findOne({
        where: {
          id: line.vendorSkuId,
          tenantId,
          vendorId: po.vendorId,
          productSkuId: line.productSkuId,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!vendorSku) {
        throw new NotFoundException("Linked vendor SKU not found");
      }

      const productSku = await productSkuRepo.findOne({
        where: { id: line.productSkuId, tenantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!productSku) {
        throw new NotFoundException("Product SKU not found");
      }

      const nextPrice = round4(unitCost);
      const nextSelling = round4(sellingPrice);
      const unitsPer = toNum(line.unitsPerPurchaseUnit) || 1;
      const pieceCost = round4(nextPrice / unitsPer);
      if (pieceCost > 0 && pieceCost >= nextSelling) {
        throw new BadRequestException(
          "Cost per piece must be less than sale price",
        );
      }

      vendorSku.purchasePrice = String(nextPrice);
      await vendorSkuRepo.save(vendorSku);

      productSku.sellingPrice = String(nextSelling);
      await productSkuRepo.save(productSku);

      line.unitCost = String(nextPrice);
      line.lineTotal = String(
        round4(
          toNum(line.quantity) * nextPrice -
            toNum(line.discount) +
            toNum(line.tax),
        ),
      );
      await itemRepo.save(line);

      const lines = await itemRepo.find({
        where: { purchaseOrderId: id, tenantId },
      });
      const subtotal = round4(
        lines.reduce((sum, item) => sum + toNum(item.lineTotal), 0),
      );
      po.subtotal = String(subtotal);
      po.total = String(
        round4(
          subtotal -
            toNum(po.discount) +
            toNum(po.tax) +
            toNum(po.otherCharges),
        ),
      );
      await poRepo.save(po);

      return this.getByIdInManager(manager, id);
    });
  }

  async submit(id: string): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;

    return this.dataSource.transaction(async (manager) => {
      const po = await manager.getRepository(PurchaseOrder).findOne({
        where: { id, tenantId },
      });
      if (!po) throw new NotFoundException("Purchase order not found");
      if (po.status !== "DRAFT") {
        throw new BadRequestException("Only DRAFT purchase orders can be submitted");
      }

      const lines = await manager.getRepository(PurchaseOrderItem).find({
        where: { purchaseOrderId: id, tenantId },
      });
      if (lines.length === 0) {
        throw new BadRequestException("Purchase order must have at least one item");
      }

      await this.assertVendorWarehouse(
        manager,
        tenantId,
        po.vendorId,
        po.warehouseId,
        true,
      );

      const inputs: PurchaseOrderItemInputDto[] = lines.map((l) => ({
        productSkuId: l.productSkuId,
        vendorSkuId: l.vendorSkuId!,
        quantity: toNum(l.quantity),
        unitCost: toNum(l.unitCost),
        discount: toNum(l.discount),
        tax: toNum(l.tax),
      }));

      // Re-validate relationships + MOQ; refresh snapshots/totals
      const built = await this.buildLines(
        manager,
        tenantId,
        po.vendorId,
        inputs,
        true,
      );

      await manager
        .getRepository(PurchaseOrderItem)
        .delete({ purchaseOrderId: id, tenantId });
      for (const line of built.lines) {
        await manager.getRepository(PurchaseOrderItem).save(
          manager.getRepository(PurchaseOrderItem).create({
            ...line,
            tenantId,
            purchaseOrderId: id,
          }),
        );
      }

      const total = round4(
        built.subtotal - toNum(po.discount) + toNum(po.tax) + toNum(po.otherCharges),
      );
      po.subtotal = String(built.subtotal);
      po.total = String(total);
      po.status = "SUBMITTED";
      await manager.getRepository(PurchaseOrder).save(po);

      return this.getByIdInManager(manager, id);
    });
  }

  async cancel(id: string): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const po = await this.orders.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException("Purchase order not found");
    if (po.status !== "DRAFT" && po.status !== "SUBMITTED") {
      throw new BadRequestException(
        "Only DRAFT or SUBMITTED purchase orders can be cancelled",
      );
    }
    po.status = "CANCELLED";
    await this.orders.save(po);
    return this.getById(id);
  }

  private async getByIdInManager(
    manager: EntityManager,
    id: string,
  ): Promise<PurchaseOrderDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const po = await manager.getRepository(PurchaseOrder).findOne({
      where: { id, tenantId },
      relations: { vendor: true, warehouse: true },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    const lines = await manager.getRepository(PurchaseOrderItem).find({
      where: { purchaseOrderId: id, tenantId },
      relations: {
        productSku: { product: true },
        vendorSku: true,
        purchaseUnit: true,
      },
      order: { createdAt: "ASC" },
    });
    return this.mapDetail(po, lines);
  }

  private mapDetail(
    po: PurchaseOrder,
    lines: PurchaseOrderItem[],
  ): PurchaseOrderDetail {
    const items: PurchaseOrderItemRow[] = lines.map((l) => ({
      id: l.id,
      productSkuId: l.productSkuId,
      vendorSkuId: l.vendorSkuId ?? "",
      productName: l.productSku?.product?.name ?? "—",
      variantName: l.productSku?.variantName ?? "",
      sku: l.productSku?.sku ?? "—",
      vendorSkuCode: l.vendorSku?.vendorSkuCode ?? null,
      purchaseUnitId: l.purchaseUnitId,
      purchaseUnitName: l.purchaseUnit?.name ?? null,
      unitsPerPurchaseUnit: toNum(l.unitsPerPurchaseUnit),
      quantity: toNum(l.quantity),
      unitCost: toNum(l.unitCost),
      discount: toNum(l.discount),
      tax: toNum(l.tax),
      lineTotal: toNum(l.lineTotal),
      minimumOrderQuantity: toNum(l.vendorSku?.minimumOrderQuantity),
    }));

    return {
      id: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      vendorName: po.vendor?.name ?? "—",
      warehouseId: po.warehouseId,
      warehouseName: po.warehouse?.name ?? "—",
      status: po.status as PurchaseOrderStatus,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      subtotal: toNum(po.subtotal),
      discount: toNum(po.discount),
      tax: toNum(po.tax),
      otherCharges: toNum(po.otherCharges),
      total: toNum(po.total),
      notes: po.notes,
      items,
      createdAt: po.createdAt.toISOString(),
      updatedAt: po.updatedAt.toISOString(),
    };
  }

  private async nextPoNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const latest = await manager
      .getRepository(PurchaseOrder)
      .createQueryBuilder("po")
      .where("po.tenant_id = :tenantId", { tenantId })
      .andWhere("po.po_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("po.po_number", "DESC")
      .setLock("pessimistic_write")
      .getOne();

    let seq = 1;
    if (latest?.poNumber) {
      const part = latest.poNumber.slice(prefix.length);
      const n = Number(part);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(6, "0")}`;
  }

  private async assertVendorWarehouse(
    manager: EntityManager,
    tenantId: string,
    vendorId: string,
    warehouseId: string,
    requireActive: boolean,
  ): Promise<void> {
    const vendor = await manager.getRepository(Vendor).findOne({
      where: { id: vendorId, tenantId },
    });
    if (!vendor) throw new BadRequestException("Invalid vendor");
    if (requireActive && vendor.status !== "active") {
      throw new BadRequestException("Vendor must be active");
    }

    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, tenantId },
    });
    if (!warehouse) throw new BadRequestException("Invalid warehouse");
    if (requireActive && warehouse.status !== "active") {
      throw new BadRequestException("Warehouse must be active");
    }
  }

  private async buildLines(
    manager: EntityManager,
    tenantId: string,
    vendorId: string,
    items: PurchaseOrderItemInputDto[],
    enforceMoq: boolean,
  ): Promise<{
    lines: Array<{
      productSkuId: string;
      vendorSkuId: string;
      purchaseUnitId: string | null;
      unitsPerPurchaseUnit: string;
      quantity: string;
      unitCost: string;
      tax: string;
      discount: string;
      lineTotal: string;
    }>;
    subtotal: number;
  }> {
    const seen = new Set<string>();
    const lines: Array<{
      productSkuId: string;
      vendorSkuId: string;
      purchaseUnitId: string | null;
      unitsPerPurchaseUnit: string;
      quantity: string;
      unitCost: string;
      tax: string;
      discount: string;
      lineTotal: string;
    }> = [];
    let subtotal = 0;

    for (const item of items) {
      if (seen.has(item.productSkuId)) {
        throw new BadRequestException(
          "Duplicate SKU lines are not allowed on the same purchase order",
        );
      }
      seen.add(item.productSkuId);

      if (item.quantity <= 0) {
        throw new BadRequestException("Quantity must be greater than zero");
      }
      if (item.unitCost < 0) {
        throw new BadRequestException("Unit cost must be non-negative");
      }

      const sku = await manager.getRepository(ProductSku).findOne({
        where: { id: item.productSkuId, tenantId },
      });
      if (!sku) throw new BadRequestException("Invalid product SKU");

      const vs = await manager.getRepository(VendorSku).findOne({
        where: { id: item.vendorSkuId, tenantId },
        relations: { purchaseUnit: true },
      });
      if (!vs) throw new BadRequestException("Invalid vendor SKU");
      if (vs.vendorId !== vendorId) {
        throw new BadRequestException(
          "Vendor SKU does not belong to the selected vendor",
        );
      }
      if (vs.productSkuId !== item.productSkuId) {
        throw new BadRequestException(
          "Vendor SKU does not match the selected product SKU",
        );
      }
      if (enforceMoq && vs.status !== "active") {
        throw new BadRequestException("Vendor SKU must be active");
      }

      const moq = toNum(vs.minimumOrderQuantity);
      if (enforceMoq && item.quantity < moq) {
        const unitName = vs.purchaseUnit?.name ?? "units";
        throw new BadRequestException(
          `Minimum order quantity is ${moq} ${unitName}`,
        );
      }

      const unitsPerPurchaseUnit = toNum(vs.unitsPerPurchaseUnit) || 1;

      const discount = item.discount ?? 0;
      const tax = item.tax ?? 0;
      const lineTotal = round4(item.quantity * item.unitCost - discount + tax);
      subtotal = round4(subtotal + lineTotal);

      lines.push({
        productSkuId: item.productSkuId,
        vendorSkuId: item.vendorSkuId,
        purchaseUnitId: vs.purchaseUnitId,
        unitsPerPurchaseUnit: String(unitsPerPurchaseUnit),
        quantity: String(item.quantity),
        unitCost: String(item.unitCost),
        tax: String(tax),
        discount: String(discount),
        lineTotal: String(lineTotal),
      });
    }

    return { lines, subtotal };
  }
}
