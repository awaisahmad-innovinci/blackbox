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
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  WarehouseStockRow,
} from "@blackbox/shared";
import { IsOptional, IsString, IsUUID } from "class-validator";
import { UpdateProductSkuDto } from "../products/dto/product.dto";
import { VendorSkusService } from "../vendors/vendor-skus.service";
import { SkusService } from "./skus.service";

class SearchSkusQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

class ByBarcodeQueryDto {
  @IsString()
  barcode!: string;

  @IsUUID()
  warehouseId!: string;
}

@Controller("skus")
export class SkusController {
  constructor(
    private readonly skus: SkusService,
    private readonly vendorSkus: VendorSkusService,
  ) {}

  @Get()
  search(@Query() query: SearchSkusQueryDto): Promise<SkuSearchResult[]> {
    return this.skus.search(query.q, query.warehouseId);
  }

  @Get("by-barcode")
  findByBarcode(
    @Query() query: ByBarcodeQueryDto,
  ): Promise<SkuSearchResult> {
    return this.skus.findByBarcode(query.barcode, query.warehouseId);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<SkuDetail> {
    return this.skus.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductSkuDto,
  ): Promise<SkuDetail> {
    return this.skus.update(id, dto);
  }

  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<SkuDetail> {
    return this.skus.deactivate(id);
  }

  @Get(":id/inventory")
  listInventory(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<WarehouseStockRow[]> {
    return this.skus.listInventory(id);
  }

  @Get(":id/vendors")
  listVendors(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<SkuSupplier[]> {
    return this.vendorSkus.listBySku(id);
  }
}
