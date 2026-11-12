import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { PaginatedInventoryMovements } from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto";
import { InventoryMovementsService } from "./inventory-movements.service";

@Controller("inventory-movements")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryMovementsController {
  constructor(private readonly movements: InventoryMovementsService) {}

  @Get()
  @RequirePermissions("inventory.access")
  list(
    @Query() query: ListInventoryMovementsQueryDto,
  ): Promise<PaginatedInventoryMovements> {
    return this.movements.list(query);
  }
}
