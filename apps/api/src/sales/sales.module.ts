import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Sale, SaleLine, SalePayment } from "../db/entities";
import { InventoryCommonModule } from "../inventory/common/inventory-common.module";
import { RbacModule } from "../rbac/rbac.module";
import { TillsModule } from "../tills/tills.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [
    InventoryCommonModule,
    RbacModule,
    TillsModule,
    TypeOrmModule.forFeature([Sale, SaleLine, SalePayment]),
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
