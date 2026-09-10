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
import {
  goodsReceiptCostCharges,
  goodsReceiptCostCredits,
  goodsReceiptGrandTotal,
  landedUnitByQuantity,
  lineTotalAfterDiscount,
  roundMoney4,
  weightedAvgUnitCost,
} from "@blackbox/shared";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { allocateReceiptNumber } from "../common/allocate-document-number";
import {
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryMovement,
  InventoryStock,
  ProductSku,
  PurchaseOrder,
  PurchaseOrderItem,
  Vendor,
  VendorReturn,
  VendorReturnItem,
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

const round4 = roundMoney4;

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
        bonusQuantity: string;
        poUnitCost: string;
        receivingUnitCost: string;
        discountPercent: string;
        lineTotal: string;
        billedDelta: number;
        stockDelta: number;
        avgNetUnit: number;
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
        const bonusQuantity = item.bonusQuantity ?? 0;
        if (bonusQuantity < 0) {
          throw new BadRequestException("Bonus quantity must be >= 0");
        }
        const discountPercent = item.discountPercent ?? 0;
        if (discountPercent < 0 || discountPercent > 100) {
          throw new BadRequestException(
            "Line discount % must be between 0 and 100",
          );
        }

        const unitsPer = toNum(poLine.unitsPerPurchaseUnit) || 1;
        const lineTotal = lineTotalAfterDiscount(
          item.receivedQuantity,
          item.receivingUnitCost,
          discountPercent,
        );
        subtotal = round4(subtotal + lineTotal);
        const billedDelta = round4(item.receivedQuantity * unitsPer);
        const stockDelta = round4(
          item.receivedQuantity * unitsPer + bonusQuantity,
        );

        builtLines.push({
          purchaseOrderItemId: poLine.id,
          productSkuId: poLine.productSkuId,
          vendorSkuId: poLine.vendorSkuId,
          purchaseUnitId: poLine.purchaseUnitId,
          unitsPerPurchaseUnit: String(unitsPer),
          orderedQuantity: String(ordered),
          receivedQuantity: String(item.receivedQuantity),
          bonusQuantity: String(bonusQuantity),
          poUnitCost: String(toNum(poLine.unitCost)),
          receivingUnitCost: String(item.receivingUnitCost),
          discountPercent: String(discountPercent),
          lineTotal: String(lineTotal),
          billedDelta,
          stockDelta,
          avgNetUnit: 0,
        });
      }

      const discount = dto.discount ?? 0;
      const saleTax = dto.saleTax ?? dto.tax ?? 0;
      const advTax = dto.advTax ?? 0;
      const gst = dto.gst ?? 0;
      const incentive = dto.incentive ?? 0;
      const shelfRent = dto.shelfRent ?? 0;
      const costCharges = goodsReceiptCostCharges({
        saleTax,
        advTax,
        gst,
      });
      const costCredits = goodsReceiptCostCredits({ incentive });
      if (discount < 0) {
        throw new BadRequestException("Discount must be >= 0");
      }
      if (discount > subtotal) {
        throw new BadRequestException(
          "Discount cannot be greater than subtotal",
        );
      }
      const totalReceivedQty = builtLines.reduce(
        (sum, line) => sum + toNum(line.receivedQuantity),
        0,
      );

      for (const line of builtLines) {
        line.avgNetUnit = landedUnitByQuantity(
          toNum(line.receivedQuantity),
          toNum(line.receivingUnitCost),
          toNum(line.discountPercent),
          totalReceivedQty,
          discount,
          costCharges,
          costCredits,
        );
      }

      const adjustments = dto.returnAdjustments ?? [];
      const returnCredit = await this.computeReturnCredit(
        manager,
        tenantId,
        po.vendorId,
        adjustments,
      );
      const total = goodsReceiptGrandTotal({
        subtotal,
        discount,
        saleTax,
        advTax,
        gst,
        incentive,
        shelfRent,
        returnCredit,
      });

      const receiptNumber = await allocateReceiptNumber(manager, tenantId);
      const receivedAt = new Date();

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
          tax: String(saleTax),
          advTax: String(advTax),
          gst: String(gst),
          incentive: String(incentive),
          shelfRent: String(shelfRent),
          otherCharges: "0",
          returnCredit: String(returnCredit),
          total: String(total),
          notes: "",
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
            bonusQuantity: line.bonusQuantity,
            poUnitCost: line.poUnitCost,
            receivingUnitCost: line.receivingUnitCost,
            discountPercent: line.discountPercent,
            lineTotal: line.lineTotal,
          }),
        );

        if (line.stockDelta > 0) {
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
          if (line.billedDelta > 0) {
            const netUnitCost = line.avgNetUnit;
            const newCost = round4(netUnitCost / unitsPer);
            const avgCost = weightedAvgUnitCost(
              oldQty,
              oldCost,
              line.billedDelta,
              newCost,
            );
            productSku.costPrice = String(avgCost);
            await productSkuRepo.save(productSku);
          }

          await manager.getRepository(InventoryMovement).save(
            manager.getRepository(InventoryMovement).create({
              tenantId,
              productSkuId: line.productSkuId,
              warehouseId: po.warehouseId,
              movementType: "PURCHASE_RECEIPT",
              quantity: String(line.stockDelta),
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
          const onHand = round4(toNum(stock.quantityOnHand) + line.stockDelta);
          const reserved = toNum(stock.quantityReserved);
          stock.quantityOnHand = String(onHand);
          stock.quantityAvailable = String(round4(onHand - reserved));
          await stockRepo.save(stock);
        }
      }

      await this.applyReturnAdjustments(
        manager,
        tenantId,
        po.vendorId,
        po.warehouseId,
        receipt.id,
        receiptNumber,
        adjustments,
      );

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
      bonusQuantity: toNum(l.bonusQuantity),
      poUnitCost: toNum(l.poUnitCost),
      receivingUnitCost: toNum(l.receivingUnitCost),
      discountPercent: toNum(l.discountPercent),
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
      saleTax: toNum(receipt.tax),
      advTax: toNum(receipt.advTax),
      gst: toNum(receipt.gst),
      incentive: toNum(receipt.incentive),
      shelfRent: toNum(receipt.shelfRent),
      tax: toNum(receipt.tax),
      otherCharges: toNum(receipt.otherCharges),
      returnCredit: toNum(receipt.returnCredit),
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

  private async computeReturnCredit(
    manager: EntityManager,
    tenantId: string,
    vendorId: string,
    adjustments: Array<{ vendorReturnItemId: string; settlement: string }>,
  ): Promise<number> {
    let credit = 0;
    const seen = new Set<string>();
    for (const adj of adjustments) {
      if (adj.settlement !== "CASHBACK") continue;
      if (seen.has(adj.vendorReturnItemId)) {
        throw new BadRequestException("Duplicate return adjustment");
      }
      seen.add(adj.vendorReturnItemId);
      const line = await this.requireOpenReturnLine(
        manager,
        tenantId,
        vendorId,
        adj.vendorReturnItemId,
      );
      credit = round4(credit + toNum(line.quantity) * toNum(line.unitCost));
    }
    return credit;
  }

  private async applyReturnAdjustments(
    manager: EntityManager,
    tenantId: string,
    vendorId: string,
    warehouseId: string,
    receiptId: string,
    receiptNumber: string,
    adjustments: Array<{ vendorReturnItemId: string; settlement: string }>,
  ): Promise<void> {
    const touchedReturns = new Set<string>();
    const seen = new Set<string>();
    for (const adj of adjustments) {
      if (adj.settlement !== "CASHBACK" && adj.settlement !== "REPLACE") {
        throw new BadRequestException("Invalid return settlement");
      }
      if (seen.has(adj.vendorReturnItemId)) {
        throw new BadRequestException("Duplicate return adjustment");
      }
      seen.add(adj.vendorReturnItemId);
      const line = await this.requireOpenReturnLine(
        manager,
        tenantId,
        vendorId,
        adj.vendorReturnItemId,
      );
      line.settlement = adj.settlement;
      line.goodsReceiptId = receiptId;
      await manager.getRepository(VendorReturnItem).save(line);
      touchedReturns.add(line.vendorReturnId);

      if (adj.settlement === "REPLACE") {
        const unitsPer = toNum(line.unitsPerPurchaseUnit) || 1;
        const stockDelta = round4(toNum(line.quantity));
        if (stockDelta > 0) {
          const productSkuRepo = manager.getRepository(ProductSku);
          const productSku = await productSkuRepo.findOne({
            where: { id: line.productSkuId, tenantId },
            lock: { mode: "pessimistic_write" },
          });
          if (productSku) {
            const stockRepo = manager.getRepository(InventoryStock);
            const allStock = await stockRepo.find({
              where: { tenantId, productSkuId: line.productSkuId },
              lock: { mode: "pessimistic_write" },
            });
            const oldQty = round4(
              allStock.reduce((sum, row) => sum + toNum(row.quantityOnHand), 0),
            );
            const newCost = round4(toNum(line.unitCost) / unitsPer);
            productSku.costPrice = String(
              weightedAvgUnitCost(
                oldQty,
                toNum(productSku.costPrice),
                stockDelta,
                newCost,
              ),
            );
            await productSkuRepo.save(productSku);

            await manager.getRepository(InventoryMovement).save(
              manager.getRepository(InventoryMovement).create({
                tenantId,
                productSkuId: line.productSkuId,
                warehouseId,
                movementType: "PURCHASE_RECEIPT",
                quantity: String(stockDelta),
                referenceType: "goods_receipt",
                referenceId: receiptId,
                reason: `Replace ${receiptNumber}`,
              }),
            );

            let stock = allStock.find((row) => row.warehouseId === warehouseId);
            if (!stock) {
              stock = stockRepo.create({
                tenantId,
                productSkuId: line.productSkuId,
                warehouseId,
                quantityOnHand: "0",
                quantityReserved: "0",
                quantityAvailable: "0",
              });
            }
            const onHand = round4(toNum(stock.quantityOnHand) + stockDelta);
            const reserved = toNum(stock.quantityReserved);
            stock.quantityOnHand = String(onHand);
            stock.quantityAvailable = String(round4(onHand - reserved));
            await stockRepo.save(stock);
          }
        }
      }
    }

    for (const returnId of touchedReturns) {
      const remaining = await manager.getRepository(VendorReturnItem).count({
        where: { tenantId, vendorReturnId: returnId, settlement: IsNull() },
      });
      if (remaining === 0) {
        await manager.getRepository(VendorReturn).update(
          { id: returnId, tenantId },
          { status: "SETTLED" },
        );
      }
    }
  }

  private async requireOpenReturnLine(
    manager: EntityManager,
    tenantId: string,
    vendorId: string,
    itemId: string,
  ): Promise<VendorReturnItem> {
    const line = await manager.getRepository(VendorReturnItem).findOne({
      where: { id: itemId, tenantId },
      relations: { vendorReturn: true },
      lock: { mode: "pessimistic_write" },
    });
    if (!line) {
      throw new BadRequestException("Vendor return line not found");
    }
    if (line.settlement) {
      throw new BadRequestException("Vendor return line is already settled");
    }
    if (line.vendorReturn?.vendorId !== vendorId) {
      throw new BadRequestException(
        "Return does not belong to this purchase order vendor",
      );
    }
    return line;
  }
}
