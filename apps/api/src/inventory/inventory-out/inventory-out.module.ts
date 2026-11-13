import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InventoryMovement,
  InventoryOut,
  InventoryOutLine,
  InventoryStock,
  ProductSku,
  Warehouse,
} from "../../db/entities";
import { InventoryOutController } from "./inventory-out.controller";
import { InventoryOutService } from "./inventory-out.service";
import { ActivityLogModule } from "../../activity-log/activity-log.module";
import { SyncModule } from "../../sync/sync.module";

@Module({
  imports: [
    ActivityLogModule,
    SyncModule,
    TypeOrmModule.forFeature([
      InventoryOut,
      InventoryOutLine,
      InventoryStock,
      InventoryMovement,
      ProductSku,
      Warehouse,
    ]),
  ],
  controllers: [InventoryOutController],
  providers: [InventoryOutService],
  exports: [InventoryOutService],
})
export class InventoryOutModule {}
