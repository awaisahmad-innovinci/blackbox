import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InventoryMovement } from "../../db/entities";
import { InventoryMovementsController } from "./inventory-movements.controller";
import { InventoryMovementsService } from "./inventory-movements.service";

@Module({
  imports: [TypeOrmModule.forFeature([InventoryMovement])],
  controllers: [InventoryMovementsController],
  providers: [InventoryMovementsService],
  exports: [InventoryMovementsService],
})
export class InventoryMovementsModule {}
