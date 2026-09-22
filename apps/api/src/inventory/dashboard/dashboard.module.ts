import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
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
import { RbacModule } from "../../rbac/rbac.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      Product,
      ProductSku,
      InventoryStock,
      InventoryOutItem,
      Warehouse,
      PurchaseOrder,
      GoodsReceipt,
      TillWithdrawal,
      SaleReturn,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
