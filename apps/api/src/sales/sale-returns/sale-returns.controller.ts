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
import type {
  PaginatedSaleReturns,
  ReturnableSaleLine,
  SaleReturnDetail,
} from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { TenantContext } from "../../common/tenant-context";
import { CurrentUser } from "../../common/current-user.decorator";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import {
  CreateSaleReturnDto,
  ListSaleReturnsQueryDto,
} from "./dto/sale-return.dto";
import { SaleReturnsService } from "./sale-returns.service";

@Controller("sale-returns")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SaleReturnsController {
  constructor(private readonly saleReturns: SaleReturnsService) {}

  @Post()
  @RequirePermissions("sales.return")
  create(
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser() user: TenantContext,
  ): Promise<SaleReturnDetail> {
    return this.saleReturns.create(dto, user);
  }

  @Get()
  @RequirePermissions("sales.return")
  list(
    @Query() query: ListSaleReturnsQueryDto,
  ): Promise<PaginatedSaleReturns> {
    return this.saleReturns.list(query);
  }

  @Get("returnable-lines/:saleId")
  @RequirePermissions("sales.return")
  returnableLines(
    @Param("saleId", ParseUUIDPipe) saleId: string,
  ): Promise<ReturnableSaleLine[]> {
    return this.saleReturns.returnableLines(saleId);
  }

  @Get(":id")
  @RequirePermissions("sales.return")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SaleReturnDetail> {
    return this.saleReturns.getById(id);
  }
}
