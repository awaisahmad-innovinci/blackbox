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
import type { Category } from "@blackbox/shared";
import {
  CreateCategoryDto,
  ListTaxonomyQueryDto,
  UpdateCategoryDto,
} from "../common/dto/taxonomy.dto";
import { CategoriesService } from "./categories.service";

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

  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categories.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categories.update(id, dto);
  }

  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<Category> {
    return this.categories.deactivate(id);
  }
}
