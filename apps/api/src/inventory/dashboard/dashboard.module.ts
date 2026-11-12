import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
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
import { RbacModule } from "../../rbac/rbac.module";
import { CashFlowModule } from "../../cash-flow/cash-flow.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    RbacModule,
    CashFlowModule,
    TypeOrmModule.forFeature([
      Product,
      ProductSku,
      InventoryStock,
      InventoryOutItem,
      Warehouse,
      PurchaseOrder,
      GoodsReceipt,
      Sale,
      SalePayment,
      TillSession,
      TillWithdrawal,
      SaleReturn,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
