import { Controller, Get } from "@nestjs/common";
import type { WarehouseListItem } from "@blackbox/shared";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  list(): Promise<WarehouseListItem[]> {
    return this.warehouses.list();
  }
}
