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
import type { TenantContext } from "../common/tenant-context";
import { CurrentUser } from "../common/current-user.decorator";
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
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: TenantContext,
  ): Promise<SaleDetail> {
    return this.sales.create(dto, user);
  }

  @Post(":id/void")
  @RequirePermissions("sales.void")
  void(@Param("id", ParseUUIDPipe) id: string): Promise<SaleDetail> {
    return this.sales.void(id);
  }
}
