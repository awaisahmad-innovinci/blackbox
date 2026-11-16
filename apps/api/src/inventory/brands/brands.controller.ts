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
import type { Brand } from "@blackbox/shared";
import {
  CreateBrandDto,
  ListTaxonomyQueryDto,
  UpdateBrandDto,
} from "../common/dto/taxonomy.dto";
import { BrandsService } from "./brands.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("brands")
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  list(@Query() query: ListTaxonomyQueryDto): Promise<Brand[]> {
    return this.brands.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<Brand> {
    return this.brands.getById(id);
  }

  @RequirePermissions("inventory.access")
  @Post()
  create(@Body() dto: CreateBrandDto): Promise<Brand> {
    return this.brands.create(dto);
  }

  @RequirePermissions("inventory.access")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<Brand> {
    return this.brands.update(id, dto);
  }

  @RequirePermissions("inventory.access")
  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<Brand> {
    return this.brands.deactivate(id);
  }

  @RequirePermissions("inventory.access")
  @Post(":id/delete")
  softDelete(@Param("id", ParseUUIDPipe) id: string): Promise<Brand> {
    return this.brands.softDelete(id);
  }

  @RequirePermissions("inventory.access")
  @Post(":id/restore")
  restore(@Param("id", ParseUUIDPipe) id: string): Promise<Brand> {
    return this.brands.restore(id);
  }
}
