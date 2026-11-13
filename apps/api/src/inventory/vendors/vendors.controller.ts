import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type {
  PaginatedVendorPayments,
  PaginatedVendors,
  VendorCreditLedger,
  VendorDetail,
  VendorLedger,
} from "@blackbox/shared";
import { RecordVendorPaymentDto } from "./dto/record-vendor-payment.dto";
import {
  CreateVendorDto,
  ListVendorCreditsQueryDto,
  ListVendorPaymentsQueryDto,
  ListVendorsQueryDto,
  UpdateVendorDto,
} from "./dto/vendor.dto";
import { VendorLedgerService } from "./vendor-ledger.service";
import { VendorSkusService } from "./vendor-skus.service";
import { VendorsService } from "./vendors.service";

@Controller("vendors")
export class VendorsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly vendorSkus: VendorSkusService,
    private readonly ledger: VendorLedgerService,
  ) {}

  @Get()
  list(@Query() query: ListVendorsQueryDto): Promise<PaginatedVendors> {
    return this.vendors.list(query);
  }

  @Post()
  create(@Body() dto: CreateVendorDto): Promise<VendorDetail> {
    return this.vendors.create(dto);
  }

  @Get("credits")
  listCredits(
    @Query() query: ListVendorCreditsQueryDto,
  ): Promise<VendorCreditLedger> {
    return this.ledger.listCredits(query);
  }

  @Get("payments")
  listPayments(
    @Query() query: ListVendorPaymentsQueryDto,
  ): Promise<PaginatedVendorPayments> {
    return this.ledger.listPayments(query);
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VendorDetail> {
    return this.vendors.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ): Promise<VendorDetail> {
    return this.vendors.update(id, dto);
  }

  @Post(":id/delete")
  softDelete(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VendorDetail> {
    return this.vendors.softDelete(id);
  }

  @Post(":id/restore")
  restore(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VendorDetail> {
    return this.vendors.restore(id);
  }

  @Get(":id/ledger")
  ledgerFor(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<VendorLedger> {
    return this.ledger.getLedger(id);
  }

  @Post(":id/ledger-payments")
  recordPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RecordVendorPaymentDto,
  ): Promise<VendorLedger> {
    return this.ledger.recordPayment(id, dto);
  }

  @Get(":id/skus")
  listSkus(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("q") q?: string,
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.vendorSkus.listByVendor(id, q, warehouseId);
  }
}
