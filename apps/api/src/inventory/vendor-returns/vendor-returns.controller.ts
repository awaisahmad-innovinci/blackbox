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
  PaginatedVendorReturns,
  PendingVendorReturnLine,
  VendorReturnDetail,
} from "@blackbox/shared";
import {
  CreateVendorReturnDto,
  LastPurchaseCostQueryDto,
  ListVendorReturnsQueryDto,
  PendingVendorReturnsQueryDto,
  ReturnableQuantityQueryDto,
} from "./dto/vendor-return.dto";
import { VendorReturnsService } from "./vendor-returns.service";

@Controller("vendor-returns")
export class VendorReturnsController {
  constructor(private readonly vendorReturns: VendorReturnsService) {}

  @Post()
  create(@Body() dto: CreateVendorReturnDto): Promise<VendorReturnDetail> {
    return this.vendorReturns.create(dto);
  }

  @Get()
  list(
    @Query() query: ListVendorReturnsQueryDto,
  ): Promise<PaginatedVendorReturns> {
    return this.vendorReturns.list(query);
  }

  @Get("pending")
  pending(
    @Query() query: PendingVendorReturnsQueryDto,
  ): Promise<PendingVendorReturnLine[]> {
    return this.vendorReturns.listPending(query.vendorId);
  }

  @Get("last-purchase-cost")
  lastPurchaseCost(
    @Query() query: LastPurchaseCostQueryDto,
  ): Promise<{ unitCost: number }> {
    return this.vendorReturns.lastPurchaseCost(
      query.vendorId,
      query.productSkuId,
    );
  }

  @Get("returnable-quantity")
  returnableQuantity(
    @Query() query: ReturnableQuantityQueryDto,
  ): Promise<{ quantityAvailable: number }> {
    return this.vendorReturns.returnableQuantity(
      query.vendorId,
      query.productSkuId,
      query.warehouseId,
    );
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VendorReturnDetail> {
    return this.vendorReturns.getById(id);
  }
}
