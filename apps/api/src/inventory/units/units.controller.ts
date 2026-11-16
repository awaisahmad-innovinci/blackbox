import { Controller, Get, UseGuards } from "@nestjs/common";
import type { UnitListItem } from "@blackbox/shared";
import { UnitsService } from "./units.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("units")
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get()
  list(): Promise<UnitListItem[]> {
    return this.service.list();
  }
}
