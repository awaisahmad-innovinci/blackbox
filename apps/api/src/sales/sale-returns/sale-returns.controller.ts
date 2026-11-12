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
  SaleReturnLookupSummary,
} from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { TenantContext } from "../../common/tenant-context";
import { CurrentUser } from "../../common/current-user.decorator";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import {
  CompleteWithSaleDto,
  CreateSaleReturnDto,
  ListSaleReturnsQueryDto,
  LookupSaleReturnQueryDto,
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

  @Get("lookup")
  @RequirePermissions("sales.refund")
  lookup(
    @Query() query: LookupSaleReturnQueryDto,
  ): Promise<SaleReturnLookupSummary> {
    return this.saleReturns.lookup(query.returnNumber);
  }

  @Get("returnable-lines/:saleId")
  @RequirePermissions("sales.return")
  returnableLines(
    @Param("saleId", ParseUUIDPipe) saleId: string,
  ): Promise<ReturnableSaleLine[]> {
    return this.saleReturns.returnableLines(saleId);
  }

  @Post(":id/complete-standalone")
  @RequirePermissions("sales.refund")
  completeStandalone(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: TenantContext,
  ): Promise<SaleReturnDetail> {
    return this.saleReturns.completeStandalone(id, user);
  }

  @Post(":id/complete-with-sale")
  @RequirePermissions("sales.refund")
  completeWithSale(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteWithSaleDto,
    @CurrentUser() user: TenantContext,
  ): Promise<SaleReturnDetail> {
    return this.saleReturns.completeWithSaleEndpoint(id, dto.saleId, user);
  }

  @Get(":id")
  @RequirePermissions("sales.return")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SaleReturnDetail> {
    return this.saleReturns.getById(id);
  }
}
