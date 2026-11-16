import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivityLogModule } from "../../activity-log/activity-log.module";
import { CashFlowModule } from "../../cash-flow/cash-flow.module";
import {
  ProductSku,
  Unit,
  User,
  Vendor,
  VendorContact,
  VendorGroup,
  VendorLedgerEntry,
  VendorSku,
  InventoryStock,
} from "../../db/entities";
import { VendorGroupsController } from "./vendor-groups.controller";
import { VendorGroupsService } from "./vendor-groups.service";
import { VendorSkusController } from "./vendor-skus.controller";
import { VendorSkusService } from "./vendor-skus.service";
import { VendorLedgerService } from "./vendor-ledger.service";
import { VendorsController } from "./vendors.controller";
import { VendorsService } from "./vendors.service";
import { RbacModule } from "../../rbac/rbac.module";

@Module({
  imports: [
    RbacModule,
    ActivityLogModule,
    CashFlowModule,
    TypeOrmModule.forFeature([
      Vendor,
      VendorContact,
      VendorGroup,
      VendorLedgerEntry,
      VendorSku,
      ProductSku,
      Unit,
      User,
      InventoryStock,
    ]),
  ],
  controllers: [
    VendorGroupsController,
    VendorsController,
    VendorSkusController,
  ],
  providers: [
    VendorGroupsService,
    VendorsService,
    VendorSkusService,
    VendorLedgerService,
  ],
  exports: [VendorSkusService],
})
export class VendorsModule {}
