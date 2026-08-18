import { Controller, Get } from "@nestjs/common";
import type { UnitListItem } from "@blackbox/shared";
import { UnitsService } from "./units.service";

@Controller("units")
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get()
  list(): Promise<UnitListItem[]> {
    return this.service.list();
  }
}
