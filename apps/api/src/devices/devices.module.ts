import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";

@Module({
  imports: [RbacModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
