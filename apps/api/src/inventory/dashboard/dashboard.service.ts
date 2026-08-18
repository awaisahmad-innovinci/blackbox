import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { DashboardSummary } from "@blackbox/shared";
import { Repository } from "typeorm";
import {
  GoodsReceipt,
  InventoryStock,
  Product,
  ProductSku,
  PurchaseOrder,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";

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
}
