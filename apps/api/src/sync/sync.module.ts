import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { CashLedgerBootstrapService } from "./cash-ledger-bootstrap.service";
import { SyncCatalogService } from "./sync-catalog.service";
import { SyncChangeSubscriber } from "./sync-change.subscriber";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [RbacModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncCatalogService,
    CashLedgerBootstrapService,
    SyncChangeSubscriber,
  ],
  exports: [SyncService],
})
export class SyncModule {}
