import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  EntityStatus,
  SkuDetail,
  SkuSearchResult,
  WarehouseStockRow,
} from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { InventoryStock, ProductSku, Unit } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { UpdateProductSkuDto } from "../products/dto/product.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function toNumOrNull(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  return Number(value);
}

@Injectable()
export class SkusService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
    @InjectRepository(InventoryStock)
    private readonly stock: Repository<InventoryStock>,
  ) {}

  async search(
    q?: string,
    warehouseId?: string,
  ): Promise<SkuSearchResult[]> {
    const tenantId = this.fixedTenant.tenantId;
    const qb = this.skus
      .createQueryBuilder("sku")
      .innerJoinAndSelect("sku.product", "product")
      .where("sku.tenant_id = :tenantId", { tenantId })
      .andWhere("sku.status = :status", { status: "active" })
      .orderBy("product.name", "ASC")
      .addOrderBy("sku.variant_name", "ASC")
      .take(50);

    if (q?.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(product.name) LIKE :term
          OR LOWER(sku.variant_name) LIKE :term
          OR LOWER(sku.sku) LIKE :term
          OR LOWER(COALESCE(sku.barcode, '')) LIKE :term)`,
        { term },
      );
    }

    const rows = await qb.getMany();

    if (!warehouseId) {
      return rows.map((sku) => ({
        id: sku.id,
        productId: sku.productId,
        productName: sku.product.name,
        variantName: sku.variantName,
        sku: sku.sku,
        barcode: sku.barcode,
      }));
    }

    const stockRows = await this.stock.find({
      where: { tenantId, warehouseId },
    });
    const availableBySku = new Map(
      stockRows.map((s) => [s.productSkuId, toNum(s.quantityAvailable)]),
    );

    return rows.map((sku) => ({
      id: sku.id,
      productId: sku.productId,
      productName: sku.product.name,
      variantName: sku.variantName,
      sku: sku.sku,
      barcode: sku.barcode,
      quantityAvailable: availableBySku.get(sku.id) ?? 0,
      costPrice: toNum(sku.costPrice),
    }));
  }

  async findByBarcode(
    barcode: string,
    warehouseId: string,
  ): Promise<SkuSearchResult> {
    const tenantId = this.fixedTenant.tenantId;
    const code = barcode.trim();
    if (!code) {
      throw new BadRequestException("Barcode is required");
    }
    if (!warehouseId) {
      throw new BadRequestException("warehouseId is required");
    }

    const sku = await this.skus.findOne({
      where: { tenantId, barcode: code, status: "active" },
      relations: { product: true },
    });
    if (!sku) throw new NotFoundException("SKU not found for barcode");

    const stock = await this.stock.findOne({
      where: { tenantId, productSkuId: sku.id, warehouseId },
    });

    return {
      id: sku.id,
      productId: sku.productId,
      productName: sku.product.name,
      variantName: sku.variantName,
      sku: sku.sku,
      barcode: sku.barcode,
      quantityAvailable: stock ? toNum(stock.quantityAvailable) : 0,
      costPrice: toNum(sku.costPrice),
    };
  }

  async getById(id: string): Promise<SkuDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const sku = await this.skus.findOne({
      where: { id, tenantId },
      relations: { product: true, baseUnit: true, purchaseUnit: true },
    });
    if (!sku) throw new NotFoundException("SKU not found");
    return this.mapDetail(sku);
  }

  async update(id: string, dto: UpdateProductSkuDto): Promise<SkuDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const sku = await this.skus.findOne({ where: { id, tenantId } });
    if (!sku) throw new NotFoundException("SKU not found");

    await this.assertUnits(tenantId, dto.baseUnitId, dto.purchaseUnitId);

    sku.variantName = dto.variantName.trim();
    sku.sku = dto.sku.trim();
    sku.barcode = dto.barcode?.trim() || null;
    sku.sizeValue = dto.sizeValue?.trim() || null;
    sku.sizeUnit = dto.sizeUnit?.trim() || null;
    sku.baseUnitId = dto.baseUnitId || null;
    sku.purchaseUnitId = dto.purchaseUnitId || null;
    sku.unitsPerPurchaseUnit = String(dto.unitsPerPurchaseUnit ?? 1);
    sku.costPrice = String(dto.costPrice ?? 0);
    sku.sellingPrice = String(dto.sellingPrice ?? 0);
    sku.reorderLevel = String(dto.reorderLevel ?? 0);
    sku.minimumStockLevel = String(dto.minimumStockLevel ?? 0);
    sku.maximumStockLevel =
      dto.maximumStockLevel == null ? null : String(dto.maximumStockLevel);
    sku.trackInventory = dto.trackInventory ?? true;
    if (dto.status) sku.status = dto.status;

    try {
      await this.skus.save(sku);
      return this.getById(id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("SKU or barcode already exists");
      }
      throw error;
    }
  }

  async deactivate(id: string): Promise<SkuDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const sku = await this.skus.findOne({ where: { id, tenantId } });
    if (!sku) throw new NotFoundException("SKU not found");
    sku.status = "inactive";
    await this.skus.save(sku);
    return this.getById(id);
  }

  async listInventory(id: string): Promise<WarehouseStockRow[]> {
    const tenantId = this.fixedTenant.tenantId;
    const sku = await this.skus.findOne({ where: { id, tenantId } });
    if (!sku) throw new NotFoundException("SKU not found");

    const rows = await this.stock
      .createQueryBuilder("st")
      .innerJoinAndSelect("st.productSku", "s")
      .innerJoinAndSelect("st.warehouse", "w")
      .where("st.tenant_id = :tenantId", { tenantId })
      .andWhere("st.product_sku_id = :id", { id })
      .orderBy("w.name", "ASC")
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

  private mapDetail(sku: ProductSku): SkuDetail {
    return {
      id: sku.id,
      productId: sku.productId,
      productName: sku.product.name,
      productCode: sku.product.productCode,
      variantName: sku.variantName,
      sku: sku.sku,
      barcode: sku.barcode,
      sizeValue: sku.sizeValue,
      sizeUnit: sku.sizeUnit,
      baseUnitId: sku.baseUnitId,
      baseUnitName: sku.baseUnit?.name ?? null,
      purchaseUnitId: sku.purchaseUnitId,
      purchaseUnitName: sku.purchaseUnit?.name ?? null,
      unitsPerPurchaseUnit: toNum(sku.unitsPerPurchaseUnit),
      costPrice: toNum(sku.costPrice),
      sellingPrice: toNum(sku.sellingPrice),
      reorderLevel: toNum(sku.reorderLevel),
      minimumStockLevel: toNum(sku.minimumStockLevel),
      maximumStockLevel: toNumOrNull(sku.maximumStockLevel),
      trackInventory: sku.trackInventory,
      status: sku.status as EntityStatus,
    };
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
}
