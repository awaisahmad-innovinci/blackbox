import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { VendorGroup } from "@blackbox/shared";
import {
  CreateVendorGroupDto,
  ListTaxonomyQueryDto,
  UpdateVendorGroupDto,
} from "../common/dto/taxonomy.dto";
import { VendorGroupsService } from "./vendor-groups.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("vendor-groups")
export class VendorGroupsController {
  constructor(private readonly service: VendorGroupsService) {}

  @Get()
  list(@Query() query: ListTaxonomyQueryDto): Promise<VendorGroup[]> {
    return this.service.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<VendorGroup> {
    return this.service.getById(id);
  }

  @RequirePermissions("vendors.access")
  @Post()
  create(@Body() dto: CreateVendorGroupDto): Promise<VendorGroup> {
    return this.service.create(dto);
  }

  @RequirePermissions("vendors.access")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorGroupDto,
  ): Promise<VendorGroup> {
    return this.service.update(id, dto);
  }

  @RequirePermissions("vendors.access")
  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<VendorGroup> {
    return this.service.deactivate(id);
  }

  @RequirePermissions("vendors.access")
  @Post(":id/delete")
  softDelete(@Param("id", ParseUUIDPipe) id: string): Promise<VendorGroup> {
    return this.service.softDelete(id);
  }

  @RequirePermissions("vendors.access")
  @Post(":id/restore")
  restore(@Param("id", ParseUUIDPipe) id: string): Promise<VendorGroup> {
    return this.service.restore(id);
  }
}
