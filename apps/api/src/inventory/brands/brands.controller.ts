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
import type { Brand } from "@blackbox/shared";
import {
  CreateBrandDto,
  ListTaxonomyQueryDto,
  UpdateBrandDto,
} from "../common/dto/taxonomy.dto";
import { BrandsService } from "./brands.service";

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

  @Post()
  create(@Body() dto: CreateBrandDto): Promise<Brand> {
    return this.brands.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<Brand> {
    return this.brands.update(id, dto);
  }

  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<Brand> {
    return this.brands.deactivate(id);
  }
}
