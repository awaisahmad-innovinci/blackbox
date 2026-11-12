import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivityLog, User } from "../db/entities";
import { RbacModule } from "../rbac/rbac.module";
import { ActivityLogController } from "./activity-log.controller";
import { ActivityLogService } from "./activity-log.service";

@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([ActivityLog, User]),
  ],
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
