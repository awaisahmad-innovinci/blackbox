import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { WarehouseListItem } from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from "./dto/warehouse.dto";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  list(@Query() query: ListWarehousesQueryDto): Promise<WarehouseListItem[]> {
    return this.warehouses.list(query);
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<WarehouseListItem> {
    return this.warehouses.getById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("warehouses.write")
  create(@Body() dto: CreateWarehouseDto): Promise<WarehouseListItem> {
    return this.warehouses.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("warehouses.write")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ): Promise<WarehouseListItem> {
    return this.warehouses.update(id, dto);
  }

  @Post(":id/deactivate")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("warehouses.write")
  deactivate(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<WarehouseListItem> {
    return this.warehouses.deactivate(id);
  }
}
