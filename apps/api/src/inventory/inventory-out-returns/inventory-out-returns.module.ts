import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InventoryMovement,
  InventoryOutItem,
  InventoryOutReturn,
  InventoryOutReturnItem,
  InventoryStock,
  ProductSku,
  Warehouse,
} from "../../db/entities";
import { InventoryOutReturnsController } from "./inventory-out-returns.controller";
import { InventoryOutReturnsService } from "./inventory-out-returns.service";
import { ActivityLogModule } from "../../activity-log/activity-log.module";
import { RbacModule } from "../../rbac/rbac.module";

@Module({
  imports: [
    RbacModule,
    ActivityLogModule,
    TypeOrmModule.forFeature([
      InventoryOutReturn,
      InventoryOutReturnItem,
      InventoryOutItem,
      InventoryStock,
      InventoryMovement,
      ProductSku,
      Warehouse,
    ]),
  ],
  controllers: [InventoryOutReturnsController],
  providers: [InventoryOutReturnsService],
  exports: [InventoryOutReturnsService],
})
export class InventoryOutReturnsModule {}
