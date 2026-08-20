import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  EntityStatus,
  InventoryMovementType,
  PaginatedProducts,
  ProductDetail,
  ProductListItem,
  ProductSkuDetail,
  ProductSupplierRow,
  ProductType,
  StockMovementRow,
  WarehouseStockRow,
} from "@blackbox/shared";
import { nextSkuCode } from "@blackbox/shared";
import { In, Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import {
  Brand,
  Category,
  InventoryMovement,
  InventoryStock,
  Product,
  ProductSku,
  Unit,
  VendorSku,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreateProductDto,
  CreateProductSkuDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from "./dto/product.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function toNumOrNull(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  return Number(value);
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
    @InjectRepository(Brand)
    private readonly brands: Repository<Brand>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
    @InjectRepository(InventoryStock)
    private readonly stock: Repository<InventoryStock>,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
  ) {}

  async list(query: ListProductsQueryDto): Promise<PaginatedProducts> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.products
      .createQueryBuilder("p")
      .where("p.tenant_id = :tenantId", { tenantId });

    if (query.status) {
      qb.andWhere("p.status = :status", { status: query.status });
    }
    if (query.brandId) {
      qb.andWhere("p.brand_id = :brandId", { brandId: query.brandId });
    }
    if (query.categoryId) {
      qb.andWhere("p.category_id = :categoryId", {
        categoryId: query.categoryId,
      });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(p.name) LIKE :term
          OR LOWER(p.product_code) LIKE :term
          OR EXISTS (
            SELECT 1 FROM product_skus s
            WHERE s.product_id = p.id AND s.tenant_id = p.tenant_id
              AND (LOWER(s.sku) LIKE :term OR LOWER(COALESCE(s.barcode, '')) LIKE :term
                   OR LOWER(s.variant_name) LIKE :term)
          )
          OR EXISTS (
            SELECT 1 FROM brands b
            WHERE b.id = p.brand_id AND LOWER(b.name) LIKE :term
          )
          OR EXISTS (
            SELECT 1 FROM categories c
            WHERE c.id = p.category_id AND LOWER(c.name) LIKE :term
          ))`,
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("p.name", "ASC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const brandNames = await this.nameMap(
      this.brands,
      rows.map((r) => r.brandId),
    );
    const categoryNames = await this.nameMap(
      this.categories,
      rows.map((r) => r.categoryId),
    );

    const skuCounts = new Map<string, number>();
    const availableByProduct = new Map<string, number>();
    const supplierCounts = new Map<string, number>();

    if (ids.length > 0) {
      const skuCountRows = await this.skus
        .createQueryBuilder("s")
        .select("s.product_id", "productId")
        .addSelect("COUNT(*)", "cnt")
        .where("s.tenant_id = :tenantId", { tenantId })
        .andWhere("s.product_id IN (:...ids)", { ids })
        .groupBy("s.product_id")
        .getRawMany<{ productId: string; cnt: string }>();
      for (const row of skuCountRows) {
        skuCounts.set(row.productId, Number(row.cnt));
      }

      const availRows = await this.stock
        .createQueryBuilder("st")
        .innerJoin("st.productSku", "s")
        .select("s.product_id", "productId")
        .addSelect("COALESCE(SUM(st.quantity_available), 0)", "total")
        .where("st.tenant_id = :tenantId", { tenantId })
        .andWhere("s.product_id IN (:...ids)", { ids })
        .groupBy("s.product_id")
        .getRawMany<{ productId: string; total: string }>();
      for (const row of availRows) {
        availableByProduct.set(row.productId, Number(row.total));
      }

      const supplierRows = await this.vendorSkus
        .createQueryBuilder("vs")
        .innerJoin("vs.productSku", "s")
        .select("s.product_id", "productId")
        .addSelect("COUNT(DISTINCT vs.vendor_id)", "cnt")
        .where("vs.tenant_id = :tenantId", { tenantId })
        .andWhere("vs.status = :status", { status: "active" })
        .andWhere("s.product_id IN (:...ids)", { ids })
        .groupBy("s.product_id")
        .getRawMany<{ productId: string; cnt: string }>();
      for (const row of supplierRows) {
        supplierCounts.set(row.productId, Number(row.cnt));
      }
    }

    const items: ProductListItem[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      productCode: p.productCode,
      brandId: p.brandId,
      brandName: p.brandId ? (brandNames.get(p.brandId) ?? null) : null,
      categoryId: p.categoryId,
      categoryName: p.categoryId
        ? (categoryNames.get(p.categoryId) ?? null)
        : null,
      productType: p.productType as ProductType,
      status: p.status as EntityStatus,
      skuCount: skuCounts.get(p.id) ?? 0,
      totalAvailable: availableByProduct.get(p.id) ?? 0,
      supplierCount: supplierCounts.get(p.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<ProductDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const product = await this.products.findOne({ where: { id, tenantId } });
    if (!product) throw new NotFoundException("Product not found");

    const brandName = product.brandId
      ? ((await this.brands.findOne({ where: { id: product.brandId } }))
          ?.name ?? null)
      : null;
    const categoryName = product.categoryId
      ? ((await this.categories.findOne({ where: { id: product.categoryId } }))
          ?.name ?? null)
      : null;

    const totals = await this.stock
      .createQueryBuilder("st")
      .innerJoin("st.productSku", "s")
      .select("COALESCE(SUM(st.quantity_on_hand), 0)", "onHand")
      .addSelect("COALESCE(SUM(st.quantity_reserved), 0)", "reserved")
      .addSelect("COALESCE(SUM(st.quantity_available), 0)", "available")
      .where("st.tenant_id = :tenantId", { tenantId })
      .andWhere("s.product_id = :id", { id })
      .getRawOne<{ onHand: string; reserved: string; available: string }>();

    return {
      id: product.id,
      name: product.name,
      productCode: product.productCode,
      brandId: product.brandId,
      brandName,
      categoryId: product.categoryId,
      categoryName,
      productType: product.productType as ProductType,
      description: product.description,
      imagePath: product.imagePath,
      status: product.status as EntityStatus,
      totalOnHand: toNum(totals?.onHand),
      totalReserved: toNum(totals?.reserved),
      totalAvailable: toNum(totals?.available),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateProductDto): Promise<ProductDetail> {
    const tenantId = this.fixedTenant.tenantId;
    await this.assertBrandCategory(tenantId, dto.brandId, dto.categoryId);

    try {
      const productCode = await this.nextProductCode(tenantId);
      const saved = await this.products.save(
        this.products.create({
          tenantId,
          name: dto.name.trim(),
          productCode,
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          productType: dto.productType ?? "STOCK_ITEM",
          description: dto.description?.trim() ?? "",
          imagePath: null,
          status: dto.status ?? "active",
        }),
      );
      return this.getById(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Product code already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const product = await this.products.findOne({ where: { id, tenantId } });
    if (!product) throw new NotFoundException("Product not found");

    await this.assertBrandCategory(tenantId, dto.brandId, dto.categoryId);

    product.name = dto.name.trim();
    product.brandId = dto.brandId;
    product.categoryId = dto.categoryId;
    product.productType = dto.productType ?? product.productType;
    product.description = dto.description?.trim() ?? "";
    if (dto.status) product.status = dto.status;

    await this.products.save(product);
    return this.getById(id);
  }

  async deactivate(id: string): Promise<ProductDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const product = await this.products.findOne({ where: { id, tenantId } });
    if (!product) throw new NotFoundException("Product not found");
    product.status = "inactive";
    await this.products.save(product);
    return this.getById(id);
  }

  async listSkus(productId: string): Promise<ProductSkuDetail[]> {
    const tenantId = this.fixedTenant.tenantId;
    await this.requireProduct(productId);
    const rows = await this.skus.find({
      where: { tenantId, productId },
      relations: { baseUnit: true, purchaseUnit: true },
      order: { variantName: "ASC" },
    });
    return rows.map((s) => this.mapSkuDetail(s));
  }

  async createSku(
    productId: string,
    dto: CreateProductSkuDto,
  ): Promise<ProductSkuDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const product = await this.requireProduct(productId);
    await this.assertUnits(tenantId, dto.baseUnitId, dto.purchaseUnitId);

    const existing = await this.skus.find({
      where: { tenantId, productId },
      select: { sku: true },
    });
    const skuCode =
      dto.sku?.trim() ||
      nextSkuCode(
        product.productCode,
        existing.map((row) => row.sku),
      );

    try {
      const saved = await this.skus.save(
        this.skus.create({
          tenantId,
          productId,
          variantName: dto.variantName.trim(),
          sku: skuCode,
          barcode: dto.barcode?.trim() || null,
          sizeValue: dto.sizeValue?.trim() || null,
          sizeUnit: dto.sizeUnit?.trim() || null,
          baseUnitId: dto.baseUnitId,
          purchaseUnitId: dto.purchaseUnitId,
          unitsPerPurchaseUnit: String(dto.unitsPerPurchaseUnit),
          costPrice: String(dto.costPrice),
          sellingPrice: String(dto.sellingPrice),
          reorderLevel: String(dto.reorderLevel ?? 0),
          minimumStockLevel: String(dto.minimumStockLevel ?? 0),
          maximumStockLevel:
            dto.maximumStockLevel == null
              ? null
              : String(dto.maximumStockLevel),
          trackInventory: dto.trackInventory ?? true,
          status: dto.status ?? "active",
        }),
      );
      const full = await this.skus.findOne({
        where: { id: saved.id },
        relations: { baseUnit: true, purchaseUnit: true },
      });
      return this.mapSkuDetail(full!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("SKU or barcode already exists");
      }
      throw error;
    }
  }

  async listSuppliers(productId: string): Promise<ProductSupplierRow[]> {
    const tenantId = this.fixedTenant.tenantId;
    await this.requireProduct(productId);

    const rows = await this.vendorSkus
      .createQueryBuilder("vs")
      .innerJoinAndSelect("vs.productSku", "s")
      .innerJoinAndSelect("vs.vendor", "v")
      .where("vs.tenant_id = :tenantId", { tenantId })
      .andWhere("s.product_id = :productId", { productId })
      .andWhere("vs.status = :status", { status: "active" })
      .orderBy("v.name", "ASC")
      .addOrderBy("s.sku", "ASC")
      .getMany();

    return rows.map((vs) => ({
      vendorSkuId: vs.id,
      productSkuId: vs.productSkuId,
      sku: vs.productSku.sku,
      variantName: vs.productSku.variantName,
      vendorId: vs.vendorId,
      vendorName: vs.vendor.name,
      vendorSkuCode: vs.vendorSkuCode,
      purchasePrice: toNum(vs.purchasePrice),
      minimumOrderQuantity: toNum(vs.minimumOrderQuantity),
      leadTimeDays: vs.leadTimeDays,
      isPreferred: vs.isPreferred,
    }));
  }

  async listInventory(productId: string): Promise<WarehouseStockRow[]> {
    const tenantId = this.fixedTenant.tenantId;
    await this.requireProduct(productId);

    const rows = await this.stock
      .createQueryBuilder("st")
      .innerJoinAndSelect("st.productSku", "s")
      .innerJoinAndSelect("st.warehouse", "w")
      .where("st.tenant_id = :tenantId", { tenantId })
      .andWhere("s.product_id = :productId", { productId })
      .orderBy("w.name", "ASC")
      .addOrderBy("s.sku", "ASC")
      .getMany();

    return rows.map((st) => ({
      warehouseId: st.warehouseId,
      warehouseName: st.warehouse.name,
      productSkuId: st.productSkuId,
      sku: st.productSku.sku,
      variantName: st.productSku.variantName,
      quantityOnHand: toNum(st.quantityOnHand),
      quantityReserved: toNum(st.quantityReserved),
      quantityAvailable: toNum(st.quantityAvailable),
    }));
  }

  async listMovements(
    productId: string,
    limit = 50,
  ): Promise<StockMovementRow[]> {
    const tenantId = this.fixedTenant.tenantId;
    await this.requireProduct(productId);

    const rows = await this.movements
      .createQueryBuilder("m")
      .innerJoinAndSelect("m.productSku", "s")
      .innerJoinAndSelect("m.warehouse", "w")
      .where("m.tenant_id = :tenantId", { tenantId })
      .andWhere("s.product_id = :productId", { productId })
      .orderBy("m.created_at", "DESC")
      .take(Math.min(limit, 100))
      .getMany();

    return rows.map((m) => ({
      id: m.id,
      productSkuId: m.productSkuId,
      sku: m.productSku.sku,
      variantName: m.productSku.variantName,
      warehouseId: m.warehouseId,
      warehouseName: m.warehouse.name,
      movementType: m.movementType as InventoryMovementType,
      quantity: toNum(m.quantity),
      reason: m.reason,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  private mapSkuDetail(s: ProductSku): ProductSkuDetail {
    return {
      id: s.id,
      productId: s.productId,
      variantName: s.variantName,
      sku: s.sku,
      barcode: s.barcode,
      sizeValue: s.sizeValue,
      sizeUnit: s.sizeUnit,
      baseUnitId: s.baseUnitId,
      baseUnitName: s.baseUnit?.name ?? null,
      purchaseUnitId: s.purchaseUnitId,
      purchaseUnitName: s.purchaseUnit?.name ?? null,
      unitsPerPurchaseUnit: toNum(s.unitsPerPurchaseUnit),
      costPrice: toNum(s.costPrice),
      sellingPrice: toNum(s.sellingPrice),
      reorderLevel: toNum(s.reorderLevel),
      minimumStockLevel: toNum(s.minimumStockLevel),
      maximumStockLevel: toNumOrNull(s.maximumStockLevel),
      trackInventory: s.trackInventory,
      status: s.status as EntityStatus,
    };
  }

  private async requireProduct(id: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { id, tenantId: this.fixedTenant.tenantId },
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  private async nextProductCode(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PRD-${year}-`;
    const latest = await this.products
      .createQueryBuilder("p")
      .where("p.tenant_id = :tenantId", { tenantId })
      .andWhere("p.product_code LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("p.product_code", "DESC")
      .getOne();

    let seq = 1;
    if (latest?.productCode) {
      const part = latest.productCode.slice(prefix.length);
      const n = Number(part);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(6, "0")}`;
  }

  private async assertBrandCategory(
    tenantId: string,
    brandId: string,
    categoryId: string,
  ): Promise<void> {
    if (!brandId) {
      throw new BadRequestException("Brand is required");
    }
    if (!categoryId) {
      throw new BadRequestException("Category is required");
    }
    const brand = await this.brands.findOne({
      where: { id: brandId, tenantId, status: "active" },
    });
    if (!brand) throw new BadRequestException("Invalid or inactive brand");
    const category = await this.categories.findOne({
      where: { id: categoryId, tenantId, status: "active" },
    });
    if (!category) {
      throw new BadRequestException("Invalid or inactive category");
    }
  }

  private async assertUnits(
    tenantId: string,
    baseUnitId?: string | null,
    purchaseUnitId?: string | null,
  ): Promise<void> {
    for (const unitId of [baseUnitId, purchaseUnitId]) {
      if (!unitId) continue;
      const unit = await this.units.findOne({ where: { id: unitId, tenantId } });
      if (!unit) throw new BadRequestException("Invalid unit");
    }
  }

  private async nameMap(
    repo: Repository<Brand | Category>,
    ids: (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean) as string[])];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const rows = await repo.find({ where: { id: In(unique) } });
    for (const row of rows) map.set(row.id, row.name);
    return map;
  }
}
