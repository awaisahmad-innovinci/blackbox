import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Brand,
  Category,
  InventoryMovement,
  InventoryStock,
  Product,
  ProductSku,
  Unit,
  VendorSku,
} from "../../db/entities";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductSku,
      Brand,
      Category,
      Unit,
      VendorSku,
      InventoryStock,
      InventoryMovement,
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
