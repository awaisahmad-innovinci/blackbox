import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@blackbox/shared";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsService } from "./permissions.service";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";

/**
 * Enforces @RequirePermissions(...) with AND semantics.
 * Must run after JwtAuthGuard so request.user is TenantContext from JWT.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: TenantContext }>();
    const ctx = request.user;
    if (!ctx) {
      throw new UnauthorizedException("Authentication required");
    }

    const effective = await this.permissionsService.getPermissionsForUser(
      ctx.userId,
      ctx.tenantId,
    );

    const missing = required.filter((p) => !effective.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
