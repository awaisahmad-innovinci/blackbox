import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Category } from "../../db/entities";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { RbacModule } from "../../rbac/rbac.module";

@Module({
  imports: [
    RbacModule,TypeOrmModule.forFeature([Category])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
