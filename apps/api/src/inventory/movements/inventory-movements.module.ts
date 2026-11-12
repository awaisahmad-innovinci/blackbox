import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InventoryMovement } from "../../db/entities";
import { InventoryReportsController } from "./inventory-reports.controller";
import { InventoryMovementsController } from "./inventory-movements.controller";
import { InventoryMovementsService } from "./inventory-movements.service";
import { PermissionsService } from "src/rbac/permissions.service";

@Module({
  imports: [TypeOrmModule.forFeature([InventoryMovement])],
  controllers: [InventoryMovementsController, InventoryReportsController],
  providers: [InventoryMovementsService,PermissionsService],
  exports: [InventoryMovementsService],
})
export class InventoryMovementsModule {}
