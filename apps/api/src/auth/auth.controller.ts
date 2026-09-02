import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { AuthResponse, AuthUser } from "@blackbox/shared";
import type { TenantContext } from "../common/tenant-context";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto, RefreshDto } from "./dto/refresh.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SignupTenantDto } from "./dto/signup-tenant.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PasswordResetService } from "./password-reset.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post("signup-tenant")
  signupTenant(@Body() dto: SignupTenantDto): Promise<AuthResponse> {
    return this.authService.signupTenant(dto);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Body() dto: LogoutDto): Promise<{ success: true }> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.passwordReset.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.passwordReset.resetPassword(dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: TenantContext): Promise<AuthUser> {
    return this.authService.me(user.userId);
  }
}
