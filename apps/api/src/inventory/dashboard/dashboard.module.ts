import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  GoodsReceipt,
  InventoryStock,
  Product,
  ProductSku,
  PurchaseOrder,
} from "../../db/entities";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductSku,
      InventoryStock,
      PurchaseOrder,
      GoodsReceipt,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
