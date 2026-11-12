import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  PlatformLoginResponse,
  PlatformTenantSummary,
  ResetPlatformOwnerPasswordResponse,
} from "@blackbox/shared";
import { SignupTenantDto } from "../auth/dto/signup-tenant.dto";
import { PlatformLoginDto } from "./dto/platform-login.dto";
import { ResetPlatformOwnerPasswordDto } from "./dto/reset-platform-owner-password.dto";
import { UpdatePlatformTenantDto } from "./dto/update-platform-tenant.dto";
import { PlatformAuthGuard } from "./platform-auth.guard";
import { PlatformService } from "./platform.service";

@Controller("platform")
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: PlatformLoginDto): Promise<PlatformLoginResponse> {
    return this.platform.login(dto.username, dto.password);
  }

  @Get("tenants")
  @UseGuards(PlatformAuthGuard)
  listTenants(): Promise<PlatformTenantSummary[]> {
    return this.platform.listTenants();
  }

  @Post("tenants")
  @UseGuards(PlatformAuthGuard)
  createTenant(
    @Body() dto: SignupTenantDto,
  ): Promise<PlatformTenantSummary> {
    return this.platform.createTenant(dto);
  }

  @Post("tenants/:id/owner-password")
  @HttpCode(200)
  @UseGuards(PlatformAuthGuard)
  resetOwnerPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResetPlatformOwnerPasswordDto,
  ): Promise<ResetPlatformOwnerPasswordResponse> {
    return this.platform.resetOwnerPassword(id, dto.password);
  }

  @Patch("tenants/:id")
  @UseGuards(PlatformAuthGuard)
  setTenantActive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformTenantDto,
  ): Promise<PlatformTenantSummary> {
    return this.platform.setTenantActive(id, dto.isActive);
  }
}
