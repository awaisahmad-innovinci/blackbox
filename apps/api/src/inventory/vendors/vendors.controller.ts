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
import type { PaginatedVendors, VendorDetail } from "@blackbox/shared";
import {
  CreateVendorDto,
  ListVendorsQueryDto,
  UpdateVendorDto,
} from "./dto/vendor.dto";
import { VendorSkusService } from "./vendor-skus.service";
import { VendorsService } from "./vendors.service";

@Controller("vendors")
export class VendorsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly vendorSkus: VendorSkusService,
  ) {}

  @Get()
  list(@Query() query: ListVendorsQueryDto): Promise<PaginatedVendors> {
    return this.vendors.list(query);
  }

  @Post()
  create(@Body() dto: CreateVendorDto): Promise<VendorDetail> {
    return this.vendors.create(dto);
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

  @Get(":id/skus")
  listSkus(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("q") q?: string,
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.vendorSkus.listByVendor(id, q, warehouseId);
  }
}
