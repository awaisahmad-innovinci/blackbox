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
  PaginatedProducts,
  ProductDetail,
  ProductSkuDetail,
  ProductSupplierRow,
  StockMovementRow,
  WarehouseStockRow,
} from "@blackbox/shared";
import {
  CreateProductDto,
  CreateProductSkuDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from "./dto/product.dto";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQueryDto): Promise<PaginatedProducts> {
    return this.products.list(query);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductDetail> {
    return this.products.create(dto);
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductDetail> {
    return this.products.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    return this.products.update(id, dto);
  }

  @Post(":id/deactivate")
  deactivate(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductDetail> {
    return this.products.deactivate(id);
  }

  @Get(":id/skus")
  listSkus(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductSkuDetail[]> {
    return this.products.listSkus(id);
  }

  @Post(":id/skus")
  createSku(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateProductSkuDto,
  ): Promise<ProductSkuDetail> {
    return this.products.createSku(id, dto);
  }

  @Get(":id/suppliers")
  listSuppliers(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductSupplierRow[]> {
    return this.products.listSuppliers(id);
  }

  @Get(":id/inventory")
  listInventory(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<WarehouseStockRow[]> {
    return this.products.listInventory(id);
  }

  @Get(":id/movements")
  listMovements(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<StockMovementRow[]> {
    return this.products.listMovements(id);
  }
}
