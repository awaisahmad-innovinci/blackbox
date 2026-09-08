import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type {
  CreateSkuBarcodeRequest,
  SkuBarcode,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  WarehouseStockRow,
} from "@blackbox/shared";
import { IsOptional, IsString, IsUUID, Min, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { UpdateProductSkuDto } from "../products/dto/product.dto";
import { VendorSkusService } from "../vendors/vendor-skus.service";
import { SkuBarcodesService } from "./sku-barcodes.service";
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

class ExistsByBarcodeQueryDto {
  @IsString()
  barcode!: string;
}

class CreateSkuBarcodeBodyDto implements CreateSkuBarcodeRequest {
  @IsString()
  barcode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantityMultiplier?: number;
}

@Controller("skus")
export class SkusController {
  constructor(
    private readonly skus: SkusService,
    private readonly vendorSkus: VendorSkusService,
    private readonly skuBarcodes: SkuBarcodesService,
  ) {}

  @Get()
  search(@Query() query: SearchSkusQueryDto): Promise<SkuSearchResult[]> {
    return this.skus.search(query.q, query.warehouseId);
  }

  @Get("exists-by-barcode")
  lookupByBarcode(
    @Query() query: ExistsByBarcodeQueryDto,
  ): Promise<SkuBarcodeLookupResult> {
    return this.skus.lookupByBarcode(query.barcode);
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

  @Get(":id/barcodes")
  listBarcodes(@Param("id", ParseUUIDPipe) id: string): Promise<SkuBarcode[]> {
    return this.skuBarcodes.listBySku(id);
  }

  @Post(":id/barcodes")
  addBarcode(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateSkuBarcodeBodyDto,
  ): Promise<SkuBarcode> {
    return this.skuBarcodes.add(
      id,
      dto.barcode,
      dto.quantityMultiplier ?? 1,
    );
  }

  @Delete(":id/barcodes/:barcodeId")
  removeBarcode(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("barcodeId", ParseUUIDPipe) barcodeId: string,
  ): Promise<{ ok: true }> {
    return this.skuBarcodes.remove(id, barcodeId).then(() => ({ ok: true }));
  }
}
