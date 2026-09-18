import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Sale,
  SaleLine,
  SaleReturn,
  SaleReturnLine,
  Tenant,
  User,
} from "../../db/entities";
import { InventoryCommonModule } from "../../inventory/common/inventory-common.module";
import { RbacModule } from "../../rbac/rbac.module";
import { SalesModule } from "../sales.module";
import { SaleReturnsController } from "./sale-returns.controller";
import { SaleReturnsService } from "./sale-returns.service";

@Module({
  imports: [
    InventoryCommonModule,
    RbacModule,
    SalesModule,
    TypeOrmModule.forFeature([
      SaleReturn,
      SaleReturnLine,
      Sale,
      SaleLine,
      Tenant,
      User,
    ]),
  ],
  controllers: [SaleReturnsController],
  providers: [SaleReturnsService],
  exports: [SaleReturnsService],
})
export class SaleReturnsModule {}
