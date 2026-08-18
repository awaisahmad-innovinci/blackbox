import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import type { InventoryOutDetail } from "@blackbox/shared";
import { CreateInventoryOutDto } from "./dto/inventory-out.dto";
import { InventoryOutService } from "./inventory-out.service";

@Controller("inventory-out")
export class InventoryOutController {
  constructor(private readonly inventoryOut: InventoryOutService) {}

  @Post()
  create(@Body() dto: CreateInventoryOutDto): Promise<InventoryOutDetail> {
    return this.inventoryOut.create(dto);
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<InventoryOutDetail> {
    return this.inventoryOut.getById(id);
  }
}
