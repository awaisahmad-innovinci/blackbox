import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivityLogModule } from "../activity-log/activity-log.module";
import { Tenant, TillSession, TillWithdrawal, User } from "../db/entities";
import { RbacModule } from "../rbac/rbac.module";
import { TillsController } from "./tills.controller";
import { TillsService } from "./tills.service";

@Module({
  imports: [
    RbacModule,
    ActivityLogModule,
    TypeOrmModule.forFeature([TillSession, TillWithdrawal, Tenant, User]),
  ],
  controllers: [TillsController],
  providers: [TillsService],
  exports: [TillsService],
})
export class TillsModule {}
