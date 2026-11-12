import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductSku, Sale, SaleLine, Tenant } from "../db/entities";
import { SalesModule } from "../sales/sales.module";
import { SyncModule } from "../sync/sync.module";
import { FbrService } from "./fbr.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleLine, Tenant, ProductSku]),
    SyncModule,
    forwardRef(() => SalesModule),
  ],
  providers: [FbrService],
  exports: [FbrService],
})
export class FbrModule {}
