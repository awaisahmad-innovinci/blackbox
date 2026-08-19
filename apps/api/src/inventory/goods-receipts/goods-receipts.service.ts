import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  GoodsReceiptDetail,
  GoodsReceiptItemRow,
  GoodsReceiptListItem,
  GoodsReceiptStatus,
  PaginatedGoodsReceipts,
  ReceivingDraft,
  ReceivingLineDraft,
} from "@blackbox/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryMovement,
  InventoryStock,
  ProductSku,
  PurchaseOrder,
  PurchaseOrderItem,
  Vendor,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { CreateGoodsReceiptDto } from "./dto/goods-receipt.dto";
import { ListGoodsReceiptsQueryDto } from "./dto/list-goods-receipts-query.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    @InjectRepository(GoodsReceipt)
    private readonly receipts: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptItem)
    private readonly receiptItems: Repository<GoodsReceiptItem>,
    @InjectRepository(PurchaseOrder)
    private readonly orders: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly orderItems: Repository<PurchaseOrderItem>,
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
  ) {}

  async list(query: ListGoodsReceiptsQueryDto): Promise<PaginatedGoodsReceipts> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.receipts
      .createQueryBuilder("gr")
      .where("gr.tenant_id = :tenantId", { tenantId });

    if (query.status) {
      qb.andWhere("gr.status = :status", { status: query.status });
    }
    if (query.vendorId) {
      qb.andWhere("gr.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    if (query.warehouseId) {
      qb.andWhere("gr.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere("gr.received_at >= :dateFrom", { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere("gr.received_at <= :dateTo", { dateTo: query.dateTo });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(gr.receipt_number) LIKE :term
          OR EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = gr.purchase_order_id AND LOWER(po.po_number) LIKE :term
          )
          OR EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = gr.vendor_id AND LOWER(v.name) LIKE :term
          ))`,
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("gr.received_at", "DESC", "NULLS LAST")
      .addOrderBy("gr.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const itemCounts = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.receiptItems
        .createQueryBuilder("i")
        .select("i.goods_receipt_id", "grId")
        .addSelect("COUNT(*)", "cnt")
        .where("i.tenant_id = :tenantId", { tenantId })
        .andWhere("i.goods_receipt_id IN (:...ids)", { ids })
        .groupBy("i.goods_receipt_id")
        .getRawMany<{ grId: string; cnt: string }>();
      for (const row of counts) itemCounts.set(row.grId, Number(row.cnt));
    }

    const vendorNames = new Map<string, string>();
    const warehouseNames = new Map<string, string>();
    const poNumbers = new Map<string, string>();
    const vendorIds = [
      ...new Set(rows.map((r) => r.vendorId).filter((id): id is string => !!id)),
    ];
    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    const poIds = [...new Set(rows.map((r) => r.purchaseOrderId))];
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
    if (poIds.length > 0) {
      const orders = await this.orders
        .createQueryBuilder("po")
        .where("po.id IN (:...poIds)", { poIds })
        .getMany();
      for (const po of orders) poNumbers.set(po.id, po.poNumber);
    }

    const items: GoodsReceiptListItem[] = rows.map((gr) => ({
      id: gr.id,
      receiptNumber: gr.receiptNumber,
      purchaseOrderId: gr.purchaseOrderId,
      poNumber: poNumbers.get(gr.purchaseOrderId) ?? "—",
      vendorId: gr.vendorId,
      vendorName: gr.vendorId ? (vendorNames.get(gr.vendorId) ?? null) : null,
      warehouseId: gr.warehouseId,
      warehouseName: warehouseNames.get(gr.warehouseId) ?? "—",
      status: gr.status as GoodsReceiptStatus,
      receivedAt: gr.receivedAt?.toISOString() ?? null,
      total: toNum(gr.total),
      itemCount: itemCounts.get(gr.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async getReceivingDraft(purchaseOrderId: string): Promise<ReceivingDraft> {
    const tenantId = this.fixedTenant.tenantId;
    const po = await this.orders.findOne({
      where: { id: purchaseOrderId, tenantId },
      relations: { vendor: true, warehouse: true },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    if (po.status !== "SUBMITTED") {
      throw new BadRequestException(
        "Only SUBMITTED purchase orders can be received",
      );
    }
    await this.assertNoPostedReceipt(tenantId, purchaseOrderId);

    const lines = await this.orderItems.find({
      where: { purchaseOrderId, tenantId },
      relations: {
        productSku: { product: true },
        vendorSku: true,
        purchaseUnit: true,
      },
      order: { createdAt: "ASC" },
    });

    const items: ReceivingLineDraft[] = [];
    for (const line of lines) {
      let currentVendorPurchasePrice: number | null = null;
      if (line.vendorSkuId) {
        const vs = await this.vendorSkus.findOne({
          where: { id: line.vendorSkuId, tenantId },
        });
        if (vs) currentVendorPurchasePrice = toNum(vs.purchasePrice);
      }
      items.push({
        purchaseOrderItemId: line.id,
        productSkuId: line.productSkuId,
        vendorSkuId: line.vendorSkuId,
        productName: line.productSku?.product?.name ?? "—",
        variantName: line.productSku?.variantName ?? "",
        sku: line.productSku?.sku ?? "—",
        vendorSkuCode: line.vendorSku?.vendorSkuCode ?? null,
        purchaseUnitId: line.purchaseUnitId,
        purchaseUnitName: line.purchaseUnit?.name ?? null,
        unitsPerPurchaseUnit: toNum(line.unitsPerPurchaseUnit) || 1,
        orderedQuantity: toNum(line.quantity),
        poUnitCost: toNum(line.unitCost),
        currentVendorPurchasePrice,
        currentSellingPrice: toNum(line.productSku?.sellingPrice),
      });
    }

    return {
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      vendorName: po.vendor?.name ?? "—",
      warehouseId: po.warehouseId,
      warehouseName: po.warehouse?.name ?? "—",
      status: po.status as ReceivingDraft["status"],
      items,
    };
  }

  async createReceipt(
    purchaseOrderId: string,
    dto: CreateGoodsReceiptDto,
  ): Promise<GoodsReceiptDetail> {
    const tenantId = this.fixedTenant.tenantId;

    return this.dataSource.transaction(async (manager) => {
      const po = await manager.getRepository(PurchaseOrder).findOne({
        where: { id: purchaseOrderId, tenantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!po) throw new NotFoundException("Purchase order not found");
      if (po.status !== "SUBMITTED") {
        throw new BadRequestException(
          "Only SUBMITTED purchase orders can be received",
        );
      }

      const existing = await manager.getRepository(GoodsReceipt).findOne({
        where: {
          tenantId,
          purchaseOrderId,
          status: "POSTED",
        },
      });
      if (existing) {
        throw new BadRequestException(
          "This purchase order already has a posted goods receipt",
        );
      }

      const poLines = await manager.getRepository(PurchaseOrderItem).find({
        where: { purchaseOrderId, tenantId },
        relations: { purchaseUnit: true, vendorSku: true },
      });
      const poLineById = new Map(poLines.map((l) => [l.id, l]));

      const inputIds = new Set(dto.items.map((i) => i.purchaseOrderItemId));
      if (inputIds.size !== dto.items.length) {
        throw new BadRequestException("Duplicate purchase order items in request");
      }
      for (const line of poLines) {
        if (!inputIds.has(line.id)) {
          throw new BadRequestException(
            "All purchase order lines must be included in the receipt",
          );
        }
      }

      let subtotal = 0;
      const builtLines: Array<{
        purchaseOrderItemId: string;
        productSkuId: string;
        vendorSkuId: string | null;
        purchaseUnitId: string | null;
        unitsPerPurchaseUnit: string;
        orderedQuantity: string;
        receivedQuantity: string;
        poUnitCost: string;
        receivingUnitCost: string;
        lineTotal: string;
        inventoryDelta: number;
      }> = [];

      for (const item of dto.items) {
        const poLine = poLineById.get(item.purchaseOrderItemId);
        if (!poLine) {
          throw new BadRequestException("Invalid purchase order item");
        }
        const ordered = toNum(poLine.quantity);
        if (item.receivedQuantity < 0) {
          throw new BadRequestException("Received quantity must be >= 0");
        }
        if (item.receivedQuantity > ordered) {
          throw new BadRequestException(
            "Received quantity cannot be greater than ordered quantity",
          );
        }
        if (item.receivingUnitCost < 0) {
          throw new BadRequestException("Receiving unit cost must be >= 0");
        }

        const unitsPer = toNum(poLine.unitsPerPurchaseUnit) || 1;
        const lineTotal = round4(
          item.receivedQuantity * item.receivingUnitCost,
        );
        subtotal = round4(subtotal + lineTotal);
        const inventoryDelta = round4(item.receivedQuantity * unitsPer);

        builtLines.push({
          purchaseOrderItemId: poLine.id,
          productSkuId: poLine.productSkuId,
          vendorSkuId: poLine.vendorSkuId,
          purchaseUnitId: poLine.purchaseUnitId,
          unitsPerPurchaseUnit: String(unitsPer),
          orderedQuantity: String(ordered),
          receivedQuantity: String(item.receivedQuantity),
          poUnitCost: String(toNum(poLine.unitCost)),
          receivingUnitCost: String(item.receivingUnitCost),
          lineTotal: String(lineTotal),
          inventoryDelta,
        });
      }

      const discount = dto.discount ?? 0;
      const tax = dto.tax ?? 0;
      const otherCharges = dto.otherCharges ?? 0;
      if (discount < 0) {
        throw new BadRequestException("Discount must be >= 0");
      }
      if (discount > subtotal) {
        throw new BadRequestException(
          "Discount cannot be greater than subtotal",
        );
      }
      const rate = subtotal > 0 ? Math.min(discount / subtotal, 1) : 0;

      for (const line of builtLines) {
        const qty = toNum(line.receivedQuantity);
        const grossTotal = toNum(line.lineTotal);
        const netTotal = round4(grossTotal * (1 - rate));
        const netUnit =
          qty > 0
            ? round4(netTotal / qty)
            : round4(toNum(line.receivingUnitCost) * (1 - rate));
        line.receivingUnitCost = String(netUnit);
        line.lineTotal = String(netTotal);
      }

      const total = round4(subtotal - discount + tax + otherCharges);

      const receiptNumber = await this.nextReceiptNumber(manager, tenantId);
      const receivedAt = dto.receiptDate
        ? new Date(`${dto.receiptDate}T12:00:00.000Z`)
        : new Date();

      const receipt = await manager.getRepository(GoodsReceipt).save(
        manager.getRepository(GoodsReceipt).create({
          tenantId,
          receiptNumber,
          purchaseOrderId: po.id,
          vendorId: po.vendorId,
          warehouseId: po.warehouseId,
          status: "POSTED",
          receivedAt,
          voucherNumber: dto.voucherNumber?.trim() || null,
          subtotal: String(subtotal),
          discount: String(discount),
          tax: String(tax),
          otherCharges: String(otherCharges),
          total: String(total),
          notes: dto.notes?.trim() ?? "",
        }),
      );

      for (const line of builtLines) {
        await manager.getRepository(GoodsReceiptItem).save(
          manager.getRepository(GoodsReceiptItem).create({
            tenantId,
            goodsReceiptId: receipt.id,
            purchaseOrderItemId: line.purchaseOrderItemId,
            productSkuId: line.productSkuId,
            vendorSkuId: line.vendorSkuId,
            purchaseUnitId: line.purchaseUnitId,
            unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
            orderedQuantity: line.orderedQuantity,
            receivedQuantity: line.receivedQuantity,
            poUnitCost: line.poUnitCost,
            receivingUnitCost: line.receivingUnitCost,
            lineTotal: line.lineTotal,
          }),
        );

        if (line.inventoryDelta > 0) {
          const productSkuRepo = manager.getRepository(ProductSku);
          const productSku = await productSkuRepo.findOne({
            where: { id: line.productSkuId, tenantId },
            lock: { mode: "pessimistic_write" },
          });
          if (!productSku) {
            throw new NotFoundException("Product SKU not found");
          }

          const stockRepo = manager.getRepository(InventoryStock);
          const allStock = await stockRepo.find({
            where: {
              tenantId,
              productSkuId: line.productSkuId,
            },
            lock: { mode: "pessimistic_write" },
          });
          const oldQty = round4(
            allStock.reduce((sum, row) => sum + toNum(row.quantityOnHand), 0),
          );
          const oldCost = toNum(productSku.costPrice);
          const unitsPer = toNum(line.unitsPerPurchaseUnit) || 1;
          const newQty = line.inventoryDelta;
          const netUnitCost = toNum(line.receivingUnitCost);
          const newCost = round4(netUnitCost / unitsPer);
          const avgCost =
            oldQty <= 0
              ? newCost
              : round4((oldQty * oldCost + newQty * newCost) / (oldQty + newQty));
          productSku.costPrice = String(avgCost);
          await productSkuRepo.save(productSku);

          if (line.vendorSkuId) {
            const vendorSkuRepo = manager.getRepository(VendorSku);
            const vendorSku = await vendorSkuRepo.findOne({
              where: { id: line.vendorSkuId, tenantId },
              lock: { mode: "pessimistic_write" },
            });
            if (vendorSku) {
              vendorSku.purchasePrice = String(netUnitCost);
              await vendorSkuRepo.save(vendorSku);
            }
          }

          await manager.getRepository(InventoryMovement).save(
            manager.getRepository(InventoryMovement).create({
              tenantId,
              productSkuId: line.productSkuId,
              warehouseId: po.warehouseId,
              movementType: "PURCHASE_RECEIPT",
              quantity: String(line.inventoryDelta),
              referenceType: "goods_receipt",
              referenceId: receipt.id,
              reason: `Receipt ${receiptNumber}`,
            }),
          );

          let stock = allStock.find((row) => row.warehouseId === po.warehouseId);
          if (!stock) {
            stock = stockRepo.create({
              tenantId,
              productSkuId: line.productSkuId,
              warehouseId: po.warehouseId,
              quantityOnHand: "0",
              quantityReserved: "0",
              quantityAvailable: "0",
            });
          }
          const onHand = round4(toNum(stock.quantityOnHand) + line.inventoryDelta);
          const reserved = toNum(stock.quantityReserved);
          stock.quantityOnHand = String(onHand);
          stock.quantityAvailable = String(round4(onHand - reserved));
          await stockRepo.save(stock);
        }
      }

      po.status = "RECEIVED";
      await manager.getRepository(PurchaseOrder).save(po);

      return this.getByIdInManager(manager, receipt.id);
    });
  }

  async getById(id: string): Promise<GoodsReceiptDetail> {
    return this.getByIdInManager(this.dataSource.manager, id);
  }

  private async getByIdInManager(
    manager: EntityManager,
    id: string,
  ): Promise<GoodsReceiptDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const receipt = await manager.getRepository(GoodsReceipt).findOne({
      where: { id, tenantId },
      relations: {
        purchaseOrder: true,
        vendor: true,
        warehouse: true,
      },
    });
    if (!receipt) throw new NotFoundException("Goods receipt not found");

    const lines = await manager.getRepository(GoodsReceiptItem).find({
      where: { goodsReceiptId: id, tenantId },
      relations: {
        productSku: { product: true },
        vendorSku: true,
        purchaseUnit: true,
      },
      order: { createdAt: "ASC" },
    });

    const items: GoodsReceiptItemRow[] = lines.map((l) => ({
      id: l.id,
      purchaseOrderItemId: l.purchaseOrderItemId,
      productSkuId: l.productSkuId,
      vendorSkuId: l.vendorSkuId,
      productName: l.productSku?.product?.name ?? "—",
      variantName: l.productSku?.variantName ?? "",
      sku: l.productSku?.sku ?? "—",
      vendorSkuCode: l.vendorSku?.vendorSkuCode ?? null,
      purchaseUnitId: l.purchaseUnitId,
      purchaseUnitName: l.purchaseUnit?.name ?? null,
      unitsPerPurchaseUnit: toNum(l.unitsPerPurchaseUnit),
      orderedQuantity: toNum(l.orderedQuantity),
      receivedQuantity: toNum(l.receivedQuantity),
      poUnitCost: toNum(l.poUnitCost),
      receivingUnitCost: toNum(l.receivingUnitCost),
      lineTotal: toNum(l.lineTotal),
    }));

    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      purchaseOrderId: receipt.purchaseOrderId,
      poNumber: receipt.purchaseOrder?.poNumber ?? "—",
      vendorId: receipt.vendorId,
      vendorName: receipt.vendor?.name ?? null,
      warehouseId: receipt.warehouseId,
      warehouseName: receipt.warehouse?.name ?? "—",
      status: receipt.status as GoodsReceiptStatus,
      receivedAt: receipt.receivedAt?.toISOString() ?? null,
      voucherNumber: receipt.voucherNumber,
      subtotal: toNum(receipt.subtotal),
      discount: toNum(receipt.discount),
      tax: toNum(receipt.tax),
      otherCharges: toNum(receipt.otherCharges),
      total: toNum(receipt.total),
      notes: receipt.notes,
      items,
      createdAt: receipt.createdAt.toISOString(),
      updatedAt: receipt.updatedAt.toISOString(),
    };
  }

  private async assertNoPostedReceipt(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<void> {
    const existing = await this.receipts.findOne({
      where: { tenantId, purchaseOrderId, status: "POSTED" },
    });
    if (existing) {
      throw new BadRequestException(
        "This purchase order already has a posted goods receipt",
      );
    }
  }

  private async nextReceiptNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GRN-${year}-`;
    const latest = await manager
      .getRepository(GoodsReceipt)
      .createQueryBuilder("gr")
      .where("gr.tenant_id = :tenantId", { tenantId })
      .andWhere("gr.receipt_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("gr.receipt_number", "DESC")
      .setLock("pessimistic_write")
      .getOne();

    let seq = 1;
    if (latest?.receiptNumber) {
      const part = latest.receiptNumber.slice(prefix.length);
      const n = Number(part);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(6, "0")}`;
  }
}
