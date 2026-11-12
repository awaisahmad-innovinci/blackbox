import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivityLogModule } from "../activity-log/activity-log.module";
import { CashFlowModule } from "../cash-flow/cash-flow.module";
import { TillSession, TillWithdrawal, User } from "../db/entities";
import { RbacModule } from "../rbac/rbac.module";
import { TillsController } from "./tills.controller";
import { TillsService } from "./tills.service";

@Module({
  imports: [
    RbacModule,
    ActivityLogModule,
    CashFlowModule,
    TypeOrmModule.forFeature([TillSession, TillWithdrawal, User]),
  ],
  controllers: [TillsController],
  providers: [TillsService],
  exports: [TillsService],
})
export class TillsModule {}
