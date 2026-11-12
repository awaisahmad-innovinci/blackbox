import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  CashExpense,
  ManagerDrawerOpening,
  ManagerDrawerSubmission,
  User,
} from "../db/entities";
import { RbacModule } from "../rbac/rbac.module";
import { ActivityLogModule } from "../activity-log/activity-log.module";
import { CashFlowController } from "./cash-flow.controller";
import { CashFlowService } from "./cash-flow.service";

@Module({
  imports: [ActivityLogModule, RbacModule, TypeOrmModule.forFeature([
      CashExpense,
      ManagerDrawerOpening,
      ManagerDrawerSubmission,
      User,
    ])],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
