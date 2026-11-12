import { Module } from "@nestjs/common";
import { RbacModule } from "../../rbac/rbac.module";
import { TotpController } from "./totp.controller";
import { TotpService } from "./totp.service";

@Module({
  imports: [RbacModule],
  controllers: [TotpController],
  providers: [TotpService],
  exports: [TotpService],
})
export class TotpModule {}
