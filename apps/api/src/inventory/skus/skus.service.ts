import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  EntityStatus,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  WarehouseStockRow,
} from "@blackbox/shared";
import { normalizeStoredText } from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { InventoryStock, ProductSku, Unit } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { UpdateProductSkuDto } from "../products/dto/product.dto";
import { SkuBarcodesService } from "./sku-barcodes.service";

function toNum(value: string | null | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
    private readonly skuBarcodes: SkuBarcodesService,
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
          OR LOWER(COALESCE(sku.barcode, '')) LIKE :term
          OR EXISTS (
            SELECT 1 FROM product_sku_barcodes b
            WHERE b.product_sku_id = sku.id
              AND b.tenant_id = sku.tenant_id
              AND b.status = 'active'
              AND LOWER(b.barcode) LIKE :term
          ))`,
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

    const match = await this.skuBarcodes.findBarcodeMatch(tenantId, code, true);
    if (!match) throw new NotFoundException("SKU not found for barcode");

    const sku = await this.skus.findOne({
      where: { id: match.skuId, tenantId, status: "active" },
      relations: { product: true, baseUnit: true, purchaseUnit: true },
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
      scannedQuantityMultiplier: match.quantityMultiplier,
      unitsPerPurchaseUnit: toNum(sku.unitsPerPurchaseUnit, 1),
      baseUnitName: sku.baseUnit?.name ?? null,
      purchaseUnitName: sku.purchaseUnit?.name ?? null,
      sellingPrice: toNum(sku.sellingPrice),
      sellingPricePerPurchaseUnit: toNumOrNull(sku.sellingPricePerPurchaseUnit),
    };
  }

  async lookupByBarcode(barcode: string): Promise<SkuBarcodeLookupResult> {
    const tenantId = this.fixedTenant.tenantId;
    const code = barcode.trim();
    if (!code) {
      throw new BadRequestException("Barcode is required");
    }

    const match = await this.skuBarcodes.findBarcodeMatch(tenantId, code);
    if (!match) throw new NotFoundException("SKU not found for barcode");

    const sku = await this.skus.findOne({
      where: { id: match.skuId, tenantId },
      relations: { product: true, baseUnit: true, purchaseUnit: true },
    });
    if (!sku) throw new NotFoundException("SKU not found for barcode");

    return {
      id: sku.id,
      productId: sku.productId,
      productName: sku.product.name,
      productStatus: sku.product.status as EntityStatus,
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
      sellingPricePerPurchaseUnit: toNumOrNull(sku.sellingPricePerPurchaseUnit),
      reorderLevel: toNum(sku.reorderLevel),
      minimumStockLevel: toNum(sku.minimumStockLevel),
      maximumStockLevel: toNumOrNull(sku.maximumStockLevel),
      trackInventory: sku.trackInventory,
      status: sku.status as EntityStatus,
      scannedQuantityMultiplier: match.quantityMultiplier,
    };
  }

  async getById(id: string): Promise<SkuDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const sku = await this.skus.findOne({
      where: { id, tenantId },
      relations: { product: true, baseUnit: true, purchaseUnit: true },
    });
    if (!sku) throw new NotFoundException("SKU not found");
    const barcodes = await this.skuBarcodes.listBySku(id);
    return this.mapDetail(sku, barcodes);
  }

  async update(id: string, dto: UpdateProductSkuDto): Promise<SkuDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const sku = await this.skus.findOne({ where: { id, tenantId } });
    if (!sku) throw new NotFoundException("SKU not found");

    await this.assertUnits(tenantId, dto.baseUnitId, dto.purchaseUnitId);
    if (dto.sellingPrice <= dto.costPrice) {
      throw new BadRequestException(
        "Selling price must be greater than cost price",
      );
    }

    sku.variantName = normalizeStoredText(dto.variantName);
    sku.sku = dto.sku.trim();
    sku.sizeValue = dto.sizeValue?.trim() || null;
    sku.sizeUnit = dto.sizeUnit?.trim() || null;
    sku.baseUnitId = dto.baseUnitId;
    sku.purchaseUnitId = dto.purchaseUnitId;
    sku.unitsPerPurchaseUnit = String(dto.unitsPerPurchaseUnit);
    sku.costPrice = String(dto.costPrice);
    sku.sellingPrice = String(dto.sellingPrice);
    sku.sellingPricePerPurchaseUnit =
      dto.sellingPricePerPurchaseUnit == null
        ? null
        : String(dto.sellingPricePerPurchaseUnit);
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
        throw new ConflictException("SKU code already exists");
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

  private mapDetail(
    sku: ProductSku,
    barcodes: SkuDetail["barcodes"],
  ): SkuDetail {
    return {
      id: sku.id,
      productId: sku.productId,
      productName: sku.product.name,
      productCode: sku.product.productCode,
      variantName: sku.variantName,
      sku: sku.sku,
      barcode: sku.barcode,
      barcodes,
      sizeValue: sku.sizeValue,
      sizeUnit: sku.sizeUnit,
      baseUnitId: sku.baseUnitId,
      baseUnitName: sku.baseUnit?.name ?? null,
      purchaseUnitId: sku.purchaseUnitId,
      purchaseUnitName: sku.purchaseUnit?.name ?? null,
      unitsPerPurchaseUnit: toNum(sku.unitsPerPurchaseUnit),
      costPrice: toNum(sku.costPrice),
      sellingPrice: toNum(sku.sellingPrice),
      sellingPricePerPurchaseUnit: toNumOrNull(sku.sellingPricePerPurchaseUnit),
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
