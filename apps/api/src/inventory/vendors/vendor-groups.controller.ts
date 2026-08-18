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
import type { VendorGroup } from "@blackbox/shared";
import {
  CreateVendorGroupDto,
  ListTaxonomyQueryDto,
  UpdateVendorGroupDto,
} from "../common/dto/taxonomy.dto";
import { VendorGroupsService } from "./vendor-groups.service";

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

  @Post()
  create(@Body() dto: CreateVendorGroupDto): Promise<VendorGroup> {
    return this.service.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorGroupDto,
  ): Promise<VendorGroup> {
    return this.service.update(id, dto);
  }

  @Post(":id/deactivate")
  deactivate(@Param("id", ParseUUIDPipe) id: string): Promise<VendorGroup> {
    return this.service.deactivate(id);
  }
}
