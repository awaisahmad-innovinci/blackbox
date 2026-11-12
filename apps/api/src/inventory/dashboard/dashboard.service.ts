import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  CashierTillBalance,
  DashboardSummary,
  ManagerDashboardSummary,
  ManagerStockOverviewQuery,
  OwnerBusinessOverview,
  PaginatedManagerStockOverview,
} from "@blackbox/shared";
import { formatTillName } from "@blackbox/shared";
import { Repository } from "typeorm";
import {
  GoodsReceipt,
  InventoryOutItem,
  InventoryStock,
  Product,
  ProductSku,
  PurchaseOrder,
  Sale,
  SalePayment,
  SaleReturn,
  TillSession,
  TillWithdrawal,
  Warehouse,
} from "../../db/entities";
import { CashFlowService } from "../../cash-flow/cash-flow.service";
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
    @InjectRepository(TillSession)
    private readonly tillSessions: Repository<TillSession>,
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    @InjectRepository(SalePayment)
    private readonly salePayments: Repository<SalePayment>,
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    private readonly cashFlow: CashFlowService,
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
    seeAll: boolean,
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
      .andWhere("r.status IN (:...statuses)", {
        statuses: ["PENDING", "COMPLETED"],
      })
      .andWhere("r.return_date = :today", { today })
      .getCount();

    const tillCashCollectedAmount = roundMoney(toNum(tillRow?.amount));
    const drawers = await this.cashFlow.drawerBalances(
      tenantId,
      userId,
      "",
      seeAll,
    );
    const own = drawers.find((row) => row.managerUserId === userId);
    const cashSubmissionsToday = await this.cashFlow.submissionsToday(
      tenantId,
      today,
    );
    const cashSubmittedToday = roundMoney(
      cashSubmissionsToday.reduce((sum, row) => sum + row.amount, 0),
    );
    const cashierTills = await this.listCashierTills(tenantId);

    return {
      date: today,
      tillCashCollectedAmount,
      customerReturnCount: returnCount,
      drawerBalance: own?.balance ?? 0,
      drawers,
      cashSubmittedToday,
      cashSubmissionsToday,
      cashierTills,
    };
  }

  async getOwnerOverview(
    tenantId: string,
    userId: string,
  ): Promise<OwnerBusinessOverview> {
    const today = new Date().toISOString().slice(0, 10);

    const [
      salesRow,
      paymentRows,
      refundRow,
      cashierTills,
      drawers,
      cashSubmissionsToday,
      productCount,
      lowStockCount,
      pendingPurchaseOrderCount,
    ] = await Promise.all([
      this.sales
        .createQueryBuilder("s")
        .select("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(s.total), 0)", "total")
        .where("s.tenant_id = :tenantId", { tenantId })
        .andWhere("s.status = :status", { status: "POSTED" })
        .andWhere("DATE(s.posted_at) = :today", { today })
        .getRawOne<{ count: string; total: string }>(),
      this.salePayments
        .createQueryBuilder("p")
        .innerJoin("p.sale", "s")
        .select("p.method", "method")
        .addSelect("COALESCE(SUM(p.amount), 0)", "amount")
        .where("p.tenant_id = :tenantId", { tenantId })
        .andWhere("s.status = :status", { status: "POSTED" })
        .andWhere("DATE(s.posted_at) = :today", { today })
        .groupBy("p.method")
        .getRawMany<{ method: string; amount: string }>(),
      this.saleReturns
        .createQueryBuilder("r")
        .select("COUNT(*)", "count")
        .addSelect("COALESCE(SUM(r.refund_total), 0)", "total")
        .where("r.tenant_id = :tenantId", { tenantId })
        .andWhere("r.status = :status", { status: "COMPLETED" })
        .andWhere("r.return_date = :today", { today })
        .getRawOne<{ count: string; total: string }>(),
      this.listCashierTills(tenantId),
      this.cashFlow.drawerBalances(tenantId, userId, "", true),
      this.cashFlow.submissionsToday(tenantId, today),
      this.products.count({ where: { tenantId } }),
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
    ]);

    const payments = new Map(
      paymentRows.map((row) => [row.method, roundMoney(toNum(row.amount))]),
    );
    const tillCashTotal = roundMoney(
      cashierTills.reduce((sum, till) => sum + till.currentCashBalance, 0),
    );

    return {
      date: today,
      salesCount: toNum(salesRow?.count),
      salesTotal: roundMoney(toNum(salesRow?.total)),
      cashPayments: payments.get("CASH") ?? 0,
      cardPayments: payments.get("CARD") ?? 0,
      creditPayments: payments.get("CREDIT") ?? 0,
      refundCount: toNum(refundRow?.count),
      refundTotal: roundMoney(toNum(refundRow?.total)),
      cashierTills,
      tillCashTotal,
      drawers,
      cashSubmittedToday: roundMoney(
        cashSubmissionsToday.reduce((sum, row) => sum + row.amount, 0),
      ),
      cashSubmissionsToday,
      productCount,
      lowStockCount,
      pendingPurchaseOrderCount,
    };
  }

  private async listCashierTills(
    tenantId: string,
  ): Promise<CashierTillBalance[]> {
    const tillRows = await this.tillSessions
      .createQueryBuilder("t")
      .leftJoin("t.user", "u")
      .select("t.user_id", "user_id")
      .addSelect(
        "coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Cashier')",
        "user_name",
      )
      .addSelect("t.till_name", "till_name")
      .addSelect("u.username", "username")
      .addSelect("t.status", "status")
      .addSelect("t.current_cash_balance", "current_cash_balance")
      .where("t.tenant_id = :tenantId", { tenantId })
      .andWhere("t.status IN (:...statuses)", {
        statuses: ["OPEN", "CLOSED_LIMIT", "PENDING_APPROVAL"],
      })
      .getRawMany<{
        user_id: string;
        user_name: string;
        till_name: string;
        username: string | null;
        status: CashierTillBalance["status"];
        current_cash_balance: string;
      }>();

    return tillRows
      .map((row) => ({
        userId: row.user_id,
        userName: row.user_name?.trim() || "Cashier",
        tillName: row.till_name?.trim() || formatTillName(row.username ?? ""),
        status: row.status,
        currentCashBalance: roundMoney(toNum(row.current_cash_balance)),
      }))
      .sort(
        (a, b) =>
          a.userName.localeCompare(b.userName) ||
          a.tillName.localeCompare(b.tillName),
      );
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

    if (query.product?.trim()) {
      qb.andWhere("LOWER(p.name) LIKE :productTerm", {
        productTerm: `%${query.product.trim().toLowerCase()}%`,
      });
    }

    if (query.sku?.trim()) {
      qb.andWhere("LOWER(sku.sku) LIKE :skuTerm", {
        skuTerm: `%${query.sku.trim().toLowerCase()}%`,
      });
    }

    if (query.q?.trim()) {
      const term = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(COALESCE(sku.barcode, '')) LIKE :term
          OR LOWER(sku.variant_name) LIKE :term)`,
        { term },
      );
    }

    if (
      query.floorQtyAtMost != null &&
      Number.isFinite(query.floorQtyAtMost) &&
      query.floorQtyAtMost >= 0
    ) {
      qb.andWhere("COALESCE(out.quantity, 0) <= :floorMax", {
        floorMax: query.floorQtyAtMost,
      });
    }

    if (
      query.warehouseQtyAtMost != null &&
      Number.isFinite(query.warehouseQtyAtMost) &&
      query.warehouseQtyAtMost >= 0
    ) {
      qb.andWhere("COALESCE(st.quantity_available, 0) <= :warehouseMax", {
        warehouseMax: query.warehouseQtyAtMost,
      });
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
