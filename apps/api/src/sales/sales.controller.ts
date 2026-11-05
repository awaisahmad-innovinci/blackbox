import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
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
import { FbrService } from "../fbr/fbr.service";
import { CreateSaleDto, ListSalesQueryDto, SubmitSaleFbrDto } from "./dto/sale.dto";
import { SalesService } from "./sales.service";

@Controller("sales")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly fbr: FbrService,
  ) {}

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

  @Post(":id/fbr")
  @HttpCode(200)
  submitFbr(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SubmitSaleFbrDto,
    @CurrentUser() user: TenantContext,
  ): Promise<SaleDetail> {
    const permissions = user.permissions ?? [];
    if (
      !permissions.includes("sales.read") &&
      !permissions.includes("sales.write")
    ) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return this.fbr.submitSale(id, body.sale);
  }

  @Post(":id/void")
  @RequirePermissions("sales.void")
  void(@Param("id", ParseUUIDPipe) id: string): Promise<SaleDetail> {
    return this.sales.void(id);
  }
}
