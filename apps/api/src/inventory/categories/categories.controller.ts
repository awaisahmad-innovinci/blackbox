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
import type { Category } from "@blackbox/shared";
import {
  CreateCategoryDto,
  ListTaxonomyQueryDto,
  UpdateCategoryDto,
} from "../common/dto/taxonomy.dto";
import { CategoriesService } from "./categories.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() query: ListTaxonomyQueryDto): Promise<Category[]> {
    return this.categories.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string): Promise<Category> {
    return this.categories.getById(id);
  }

  @RequirePermissions("inventory.access")
  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categories.create(dto);
  }

  @RequirePermissions("inventory.access")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categories.update(id, dto);
  }

  @RequirePermissions("inventory.access")
  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<Category> {
    return this.categories.deactivate(id);
  }

  @RequirePermissions("inventory.access")
  @Post(":id/delete")
  softDelete(@Param("id", ParseUUIDPipe) id: string): Promise<Category> {
    return this.categories.softDelete(id);
  }

  @RequirePermissions("inventory.access")
  @Post(":id/restore")
  restore(@Param("id", ParseUUIDPipe) id: string): Promise<Category> {
    return this.categories.restore(id);
  }
}
