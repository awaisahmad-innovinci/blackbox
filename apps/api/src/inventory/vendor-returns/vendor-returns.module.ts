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

@Module({
  imports: [
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
