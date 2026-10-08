import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InventoryStock,
  ProductSku,
  ProductSkuBarcode,
  Unit,
  VendorSku,
} from "../../db/entities";
import { VendorsModule } from "../vendors/vendors.module";
import { SkuBarcodesService } from "./sku-barcodes.service";
import { SkusController } from "./skus.controller";
import { SkusService } from "./skus.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductSku,
      ProductSkuBarcode,
      Unit,
      InventoryStock,
      VendorSku,
    ]),
    VendorsModule,
  ],
  controllers: [SkusController],
  providers: [SkusService, SkuBarcodesService],
  exports: [SkusService, SkuBarcodesService],
})
export class SkusModule {}
