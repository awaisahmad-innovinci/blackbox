import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ProductSku,
  PurchaseOrder,
  PurchaseOrderItem,
  Unit,
  Vendor,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { GoodsReceiptsModule } from "../goods-receipts/goods-receipts.module";
import { ActivityLogModule } from "../../activity-log/activity-log.module";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Module({
  imports: [
    ActivityLogModule,
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderItem,
      Vendor,
      Warehouse,
      VendorSku,
      ProductSku,
      Unit,
    ]),
    GoodsReceiptsModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
