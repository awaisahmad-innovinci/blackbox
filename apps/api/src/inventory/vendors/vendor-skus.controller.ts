import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { VendorSku } from "@blackbox/shared";
import { CreateVendorSkuDto, UpdateVendorSkuDto } from "./dto/vendor-sku.dto";
import { VendorSkusService } from "./vendor-skus.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("vendor-skus")
export class VendorSkusController {
  constructor(private readonly service: VendorSkusService) {}

  @RequirePermissions("vendors.access")
  @Post()
  create(@Body() dto: CreateVendorSkuDto): Promise<VendorSku> {
    return this.service.create(dto);
  }

  @RequirePermissions("vendors.access")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorSkuDto,
  ): Promise<VendorSku> {
    return this.service.update(id, dto);
  }

  @RequirePermissions("vendors.access")
  @Delete(":id")
  deactivate(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.deactivate(id);
  }
}
