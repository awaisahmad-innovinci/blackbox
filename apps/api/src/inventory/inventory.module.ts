import { Module } from "@nestjs/common";
import { InventoryCommonModule } from "./common/inventory-common.module";
import { BrandsModule } from "./brands/brands.module";
import { CategoriesModule } from "./categories/categories.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GoodsReceiptsModule } from "./goods-receipts/goods-receipts.module";
import { InventoryOutModule } from "./inventory-out/inventory-out.module";
import { ProductsModule } from "./products/products.module";
import { PurchaseOrdersModule } from "./purchase-orders/purchase-orders.module";
import { SkusModule } from "./skus/skus.module";
import { UnitsModule } from "./units/units.module";
import { VendorsModule } from "./vendors/vendors.module";
import { WarehousesModule } from "./warehouses/warehouses.module";

@Module({
  imports: [
    InventoryCommonModule,
    DashboardModule,
    BrandsModule,
    CategoriesModule,
    ProductsModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    InventoryOutModule,
    WarehousesModule,
    VendorsModule,
    SkusModule,
    UnitsModule,
  ],
  exports: [InventoryCommonModule, DashboardModule, VendorsModule],
})
export class InventoryModule {}
