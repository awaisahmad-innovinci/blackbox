import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import type {
  InventoryOutReturnDetail,
  PaginatedInventoryOutReturns,
} from "@blackbox/shared";
import {
  CreateInventoryOutReturnDto,
  InventoryOutReturnableQuantityQueryDto,
  ListInventoryOutReturnsQueryDto,
} from "./dto/inventory-out-return.dto";
import { InventoryOutReturnsService } from "./inventory-out-returns.service";

@Controller("inventory-out-returns")
export class InventoryOutReturnsController {
  constructor(private readonly returns: InventoryOutReturnsService) {}

  @Post()
  create(
    @Body() dto: CreateInventoryOutReturnDto,
  ): Promise<InventoryOutReturnDetail> {
    return this.returns.create(dto);
  }

  @Get()
  list(
    @Query() query: ListInventoryOutReturnsQueryDto,
  ): Promise<PaginatedInventoryOutReturns> {
    return this.returns.list(query);
  }

  @Get("returnable-quantity")
  returnableQuantity(
    @Query() query: InventoryOutReturnableQuantityQueryDto,
  ): Promise<{ quantityAvailable: number }> {
    return this.returns.returnableQuantity(
      query.warehouseId,
      query.productSkuId,
    );
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<InventoryOutReturnDetail> {
    return this.returns.getById(id);
  }
}
