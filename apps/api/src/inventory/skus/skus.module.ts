import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InventoryStock, ProductSku, Unit } from "../../db/entities";
import { VendorsModule } from "../vendors/vendors.module";
import { SkusController } from "./skus.controller";
import { SkusService } from "./skus.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductSku, Unit, InventoryStock]),
    VendorsModule,
  ],
  controllers: [SkusController],
  providers: [SkusService],
})
export class SkusModule {}
