import { Controller, Get, Query } from "@nestjs/common";
import type { PaginatedInventoryMovements } from "@blackbox/shared";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto";
import { InventoryMovementsService } from "./inventory-movements.service";

@Controller("inventory-movements")
export class InventoryMovementsController {
  constructor(private readonly movements: InventoryMovementsService) {}

  @Get()
  list(
    @Query() query: ListInventoryMovementsQueryDto,
  ): Promise<PaginatedInventoryMovements> {
    return this.movements.list(query);
  }
}
