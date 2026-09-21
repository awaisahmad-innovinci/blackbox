import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  DashboardSummary,
  ManagerDashboardSummary,
  ManagerStockOverviewQuery,
  PaginatedManagerStockOverview,
} from "@blackbox/shared";
import { Repository } from "typeorm";
import {
  GoodsReceipt,
  InventoryOutItem,
  InventoryStock,
  Product,
  ProductSku,
  PurchaseOrder,
  SaleReturn,
  TillWithdrawal,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";

function toNum(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
    @InjectRepository(InventoryStock)
    private readonly stock: Repository<InventoryStock>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrders: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceipt)
    private readonly goodsReceipts: Repository<GoodsReceipt>,
    @InjectRepository(TillWithdrawal)
    private readonly tillWithdrawals: Repository<TillWithdrawal>,
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const tenantId = this.fixedTenant.tenantId;

    const [
      totalProducts,
      totalSkus,
      totalStockLines,
      lowStockItems,
      pendingPurchaseOrders,
      recentReceipts,
    ] = await Promise.all([
      this.products.count({ where: { tenantId } }),
      this.skus.count({ where: { tenantId } }),
      this.stock.count({ where: { tenantId } }),
      this.stock
        .createQueryBuilder("s")
        .innerJoin("s.productSku", "sku")
        .where("s.tenant_id = :tenantId", { tenantId })
        .andWhere("s.quantity_available <= sku.reorder_level")
        .getCount(),
      this.purchaseOrders
        .createQueryBuilder("po")
        .where("po.tenant_id = :tenantId", { tenantId })
        .andWhere("po.status IN (:...statuses)", {
          statuses: ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"],
        })
        .getCount(),
      this.goodsReceipts
        .createQueryBuilder("gr")
        .where("gr.tenant_id = :tenantId", { tenantId })
        .andWhere("gr.status = :status", { status: "POSTED" })
        .andWhere("gr.received_at >= NOW() - INTERVAL '30 days'")
        .getCount(),
    ]);

    return {
      totalProducts,
      totalSkus,
      totalStockLines,
      lowStockItems,
      pendingPurchaseOrders,
      recentReceipts,
    };
  }

  async getManagerSummary(
    userId: string,
    tenantId: string,
  ): Promise<ManagerDashboardSummary> {
    const today = new Date().toISOString().slice(0, 10);

    const tillRow = await this.tillWithdrawals
      .createQueryBuilder("w")
      .select("COALESCE(SUM(w.withdrawal_total), 0)", "amount")
      .where("w.tenant_id = :tenantId", { tenantId })
      .andWhere("w.withdrawn_by_user_id = :userId", { userId })
      .andWhere("DATE(w.created_at) = :today", { today })
      .getRawOne<{ amount: string }>();

    const returnCount = await this.saleReturns
      .createQueryBuilder("r")
      .where("r.tenant_id = :tenantId", { tenantId })
      .andWhere("r.status = :status", { status: "POSTED" })
      .andWhere("r.return_date = :today", { today })
      .getCount();

    const refundRow = await this.saleReturns
      .createQueryBuilder("r")
      .select("COALESCE(SUM(r.refund_total), 0)", "amount")
      .where("r.tenant_id = :tenantId", { tenantId })
      .andWhere("r.status = :status", { status: "POSTED" })
      .andWhere("r.return_date = :today", { today })
      .andWhere("r.processed_by = :userId", { userId })
      .getRawOne<{ amount: string }>();

    const tillCashCollectedAmount = roundMoney(toNum(tillRow?.amount));
    const refundTotalAmount = roundMoney(toNum(refundRow?.amount));

    return {
      date: today,
      tillCashCollectedAmount,
      customerReturnCount: returnCount,
      refundTotalAmount,
      netAfterRefundsAmount: roundMoney(
        tillCashCollectedAmount - refundTotalAmount,
      ),
    };
  }

  async listManagerStockOverview(
    tenantId: string,
    query: ManagerStockOverviewQuery = {},
  ): Promise<PaginatedManagerStockOverview> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);

    const qb = this.skus
      .createQueryBuilder("sku")
      .innerJoin("sku.product", "p")
      .innerJoin(
        Warehouse,
        "w",
        "w.tenant_id = sku.tenant_id AND w.status = :active",
        { active: "active" },
      )
      .leftJoin(
        InventoryStock,
        "st",
        "st.tenant_id = sku.tenant_id AND st.product_sku_id = sku.id AND st.warehouse_id = w.id",
      )
      .leftJoin(
        InventoryOutItem,
        "out",
        "out.tenant_id = sku.tenant_id AND out.product_sku_id = sku.id AND out.warehouse_id = w.id",
      )
      .where("sku.tenant_id = :tenantId", { tenantId })
      .andWhere("p.status = :active")
      .andWhere("sku.status = :active");

    if (query.warehouseId) {
      qb.andWhere("w.id = :warehouseId", { warehouseId: query.warehouseId });
    }

    if (query.q?.trim()) {
      const term = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(p.name) LIKE :term
          OR LOWER(sku.sku) LIKE :term
          OR LOWER(COALESCE(sku.barcode, '')) LIKE :term
          OR LOWER(sku.variant_name) LIKE :term)`,
        { term },
      );
    }

    const countRow = await qb
      .clone()
      .select("COUNT(*)", "cnt")
      .getRawOne<{ cnt: string }>();
    const total = Number(countRow?.cnt ?? 0);

    const totalsRow = await qb
      .clone()
      .select([
        "COALESCE(SUM(COALESCE(out.quantity, 0)), 0) AS floorTotal",
        "COALESCE(SUM(COALESCE(st.quantity_available, 0)), 0) AS warehouseTotal",
      ])
      .getRawOne<{ floorTotal: string; warehouseTotal: string }>();

    const rows = await qb
      .clone()
      .select([
        "sku.id AS productSkuId",
        "p.name AS productName",
        "sku.variant_name AS variantName",
        "sku.sku AS sku",
        "sku.barcode AS barcode",
        "w.id AS warehouseId",
        "w.name AS warehouseName",
        "COALESCE(out.quantity, 0) AS floorQuantity",
        "COALESCE(st.quantity_available, 0) AS warehouseQuantity",
        "sku.reorder_level AS reorderLevel",
      ])
      .orderBy("p.name", "ASC")
      .addOrderBy("sku.sku", "ASC")
      .addOrderBy("w.name", "ASC")
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany<{
        productSkuId: string;
        productName: string;
        variantName: string;
        sku: string;
        barcode: string | null;
        warehouseId: string;
        warehouseName: string;
        floorQuantity: string;
        warehouseQuantity: string;
        reorderLevel: string;
      }>();

    const items = rows.map((row) => {
      const floorQuantity = roundMoney(toNum(row.floorQuantity));
      const warehouseQuantity = roundMoney(toNum(row.warehouseQuantity));
      return {
        productSkuId: row.productSkuId,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        barcode: row.barcode,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        floorQuantity,
        warehouseQuantity,
        totalQuantity: roundMoney(floorQuantity + warehouseQuantity),
        reorderLevel: roundMoney(toNum(row.reorderLevel)),
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      floorTotal: roundMoney(toNum(totalsRow?.floorTotal)),
      warehouseTotal: roundMoney(toNum(totalsRow?.warehouseTotal)),
    };
  }
}
