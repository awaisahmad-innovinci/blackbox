import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  GoodsReceiptItem,
  InventoryMovement,
  InventoryStock,
  ProductSku,
  PurchaseOrderItem,
  Vendor,
  VendorReturn,
  VendorReturnItem,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { VendorReturnsController } from "./vendor-returns.controller";
import { VendorReturnsService } from "./vendor-returns.service";
import { ActivityLogModule } from "../../activity-log/activity-log.module";

@Module({
  imports: [
    ActivityLogModule,
    TypeOrmModule.forFeature([
      VendorReturn,
      VendorReturnItem,
      InventoryStock,
      InventoryMovement,
      ProductSku,
      Vendor,
      VendorSku,
      Warehouse,
      GoodsReceiptItem,
      PurchaseOrderItem,
    ]),
  ],
  controllers: [VendorReturnsController],
  providers: [VendorReturnsService],
  exports: [VendorReturnsService],
})
export class VendorReturnsModule {}
