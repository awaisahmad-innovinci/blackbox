import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";
import { RequirePermissions } from "./require-permissions.decorator";

/**
 * Minimal protected surface to prove JWT + permission-key RBAC.
 * Returns no sensitive data.
 */
@Controller("rbac")
export class RbacController {
  @Get("check")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("permissions.read")
  check(): { ok: true } {
    return { ok: true };
  }
}
