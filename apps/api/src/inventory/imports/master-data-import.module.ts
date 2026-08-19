import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Brand,
  Category,
  Product,
  ProductSku,
  Unit,
  Vendor,
  VendorContact,
  VendorGroup,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { MasterDataImportController } from "./master-data-import.controller";
import { MasterDataImportService } from "./master-data-import.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Unit,
      Brand,
      Category,
      Warehouse,
      VendorGroup,
      Product,
      ProductSku,
      Vendor,
      VendorContact,
      VendorSku,
    ]),
  ],
  controllers: [MasterDataImportController],
  providers: [MasterDataImportService],
})
export class MasterDataImportModule {}
