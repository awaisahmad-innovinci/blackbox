import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Brand } from "../../db/entities";
import { BrandsController } from "./brands.controller";
import { BrandsService } from "./brands.service";
import { RbacModule } from "../../rbac/rbac.module";

@Module({
  imports: [
    RbacModule,TypeOrmModule.forFeature([Brand])],
  controllers: [BrandsController],
  providers: [BrandsService],
})
export class BrandsModule {}
