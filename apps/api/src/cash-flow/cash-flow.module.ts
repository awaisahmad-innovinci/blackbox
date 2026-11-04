import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CashExpense, User } from "../db/entities";
import { RbacModule } from "../rbac/rbac.module";
import { CashFlowController } from "./cash-flow.controller";
import { CashFlowService } from "./cash-flow.service";

@Module({
  imports: [RbacModule, TypeOrmModule.forFeature([CashExpense, User])],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
