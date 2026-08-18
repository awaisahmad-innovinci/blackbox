import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ProductSku,
  Unit,
  Vendor,
  VendorContact,
  VendorGroup,
  VendorSku,
  InventoryStock,
} from "../../db/entities";
import { VendorGroupsController } from "./vendor-groups.controller";
import { VendorGroupsService } from "./vendor-groups.service";
import { VendorSkusController } from "./vendor-skus.controller";
import { VendorSkusService } from "./vendor-skus.service";
import { VendorsController } from "./vendors.controller";
import { VendorsService } from "./vendors.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vendor,
      VendorContact,
      VendorGroup,
      VendorSku,
      ProductSku,
      Unit,
      InventoryStock,
    ]),
  ],
  controllers: [
    VendorGroupsController,
    VendorsController,
    VendorSkusController,
  ],
  providers: [VendorGroupsService, VendorsService, VendorSkusService],
  exports: [VendorSkusService],
})
export class VendorsModule {}
