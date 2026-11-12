import { Module, forwardRef } from "@nestjs/common";
import { ActivityLogModule } from "../activity-log/activity-log.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FbrModule } from "../fbr/fbr.module";
import { Sale, SaleLine, SalePayment, Tenant } from "../db/entities";
import { InventoryCommonModule } from "../inventory/common/inventory-common.module";
import { RbacModule } from "../rbac/rbac.module";
import { TillsModule } from "../tills/tills.module";
import { SaleReturnsModule } from "./sale-returns/sale-returns.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [
    ActivityLogModule,
    InventoryCommonModule,
    RbacModule,
    forwardRef(() => FbrModule),
    TillsModule,
    forwardRef(() => SaleReturnsModule),
    TypeOrmModule.forFeature([Sale, SaleLine, SalePayment, Tenant]),
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
