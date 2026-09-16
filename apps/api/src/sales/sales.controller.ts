import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { PaginatedSales, SaleDetail } from "@blackbox/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { CreateSaleDto, ListSalesQueryDto } from "./dto/sale.dto";
import { SalesService } from "./sales.service";

@Controller("sales")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions("sales.read")
  list(@Query() query: ListSalesQueryDto): Promise<PaginatedSales> {
    return this.sales.list(query);
  }

  @Get(":id")
  @RequirePermissions("sales.read")
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<SaleDetail> {
    return this.sales.getById(id);
  }

  @Post()
  @RequirePermissions("sales.write")
  create(@Body() dto: CreateSaleDto): Promise<SaleDetail> {
    return this.sales.create(dto);
  }

  @Post(":id/void")
  @RequirePermissions("sales.void")
  void(@Param("id", ParseUUIDPipe) id: string): Promise<SaleDetail> {
    return this.sales.void(id);
  }
}
