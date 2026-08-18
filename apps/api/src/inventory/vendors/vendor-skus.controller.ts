import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import type { VendorSku } from "@blackbox/shared";
import { CreateVendorSkuDto, UpdateVendorSkuDto } from "./dto/vendor-sku.dto";
import { VendorSkusService } from "./vendor-skus.service";

@Controller("vendor-skus")
export class VendorSkusController {
  constructor(private readonly service: VendorSkusService) {}

  @Post()
  create(@Body() dto: CreateVendorSkuDto): Promise<VendorSku> {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorSkuDto,
  ): Promise<VendorSku> {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  deactivate(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.deactivate(id);
  }
}
