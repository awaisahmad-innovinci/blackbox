import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import type { InventoryOutDetail, PaginatedInventoryOuts } from "@blackbox/shared";
import { CreateInventoryOutDto } from "./dto/inventory-out.dto";
import { ListInventoryOutQueryDto } from "./dto/list-inventory-out-query.dto";
import { InventoryOutService } from "./inventory-out.service";

@Controller("inventory-out")
export class InventoryOutController {
  constructor(private readonly inventoryOut: InventoryOutService) {}

  @Post()
  create(@Body() dto: CreateInventoryOutDto): Promise<InventoryOutDetail> {
    return this.inventoryOut.create(dto);
  }

  @Get()
  list(@Query() query: ListInventoryOutQueryDto): Promise<PaginatedInventoryOuts> {
    return this.inventoryOut.list(query);
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<InventoryOutDetail> {
    return this.inventoryOut.getById(id);
  }
}
