import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
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
import { GoodsReceiptsController } from "./goods-receipts.controller";
import { GoodsReceiptsService } from "./goods-receipts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GoodsReceipt,
      GoodsReceiptItem,
      PurchaseOrder,
      PurchaseOrderItem,
      VendorSku,
      Vendor,
      Warehouse,
      InventoryStock,
      InventoryMovement,
      ProductSku,
      VendorReturn,
      VendorReturnItem,
    ]),
  ],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
