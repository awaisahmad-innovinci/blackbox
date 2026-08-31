import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Warehouse } from "../../db/entities";
import { RbacModule } from "../../rbac/rbac.module";
import { WarehousesController } from "./warehouses.controller";
import { WarehousesService } from "./warehouses.service";

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse]), RbacModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
