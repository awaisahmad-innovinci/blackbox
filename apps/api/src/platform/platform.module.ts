import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { PlatformController } from "./platform.controller";
import { PlatformJwtStrategy } from "./platform-jwt.strategy";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformJwtStrategy, PlatformAuthGuard],
})
export class PlatformModule {}
