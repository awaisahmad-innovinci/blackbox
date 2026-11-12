import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  EntityStatus,
  OpeningStockRequest,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  WarehouseStockRow,
} from "@blackbox/shared";
import {
  costWithGst,
  normalizeHsCode,
  normalizeStoredText,
  normalizeUnitsPerPurchaseUnit,
  vendorPurchasePriceFromSku,
} from "@blackbox/shared";
import { DataSource, Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import {
  InventoryMovement,
  InventoryStock,
  ProductSku,
  Unit,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { getInventoryOutBalanceQty } from "../inventory-out/inventory-out-balance";
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

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
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
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
    private readonly skuBarcodes: SkuBarcodesService,
    private readonly dataSource: DataSource,
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
        hsCode: sku.hsCode,
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
      gstPercent: toNum(sku.gstPercent),
      hsCode: sku.hsCode,
    }));
  }

  async findByBarcode(
    barcode: string,
    warehouseId: string,
    balanceSource: "stock" | "pos" = "stock",
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

    let quantityAvailable = 0;
    if (balanceSource === "pos") {
      quantityAvailable = await getInventoryOutBalanceQty(
        this.stock.manager,
        tenantId,
        warehouseId,
        sku.id,
      );
    } else {
      const stock = await this.stock.findOne({
        where: { tenantId, productSkuId: sku.id, warehouseId },
      });
      quantityAvailable = stock ? toNum(stock.quantityAvailable) : 0;
    }

    return {
      id: sku.id,
      productId: sku.productId,
      productName: sku.product.name,
      variantName: sku.variantName,
      sku: sku.sku,
      barcode: sku.barcode,
      quantityAvailable,
      costPrice: toNum(sku.costPrice),
      gstPercent: toNum(sku.gstPercent),
      hsCode: sku.hsCode,
      scannedQuantityMultiplier: match.quantityMultiplier,
      unitsPerPurchaseUnit: toNum(sku.unitsPerPurchaseUnit, 1),
      baseUnitName: sku.baseUnit?.name ?? null,
      purchaseUnitName: sku.purchaseUnit?.name ?? null,
      sellingPrice: toNum(sku.sellingPrice),
      sellingPricePerPurchaseUnit: toNumOrNull(sku.sellingPricePerPurchaseUnit),
      saleDiscountPercent: toNum(sku.saleDiscountPercent),
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
      gstPercent: toNum(sku.gstPercent),
      hsCode: sku.hsCode,
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
    if (dto.sellingPrice <= costWithGst(dto.costPrice, dto.gstPercent ?? 0)) {
      throw new BadRequestException(
        "Selling price must be greater than cost + GST",
      );
    }

    sku.variantName = normalizeStoredText(dto.variantName);
    sku.sku = dto.sku.trim();
    sku.sizeValue = dto.sizeValue?.trim() || null;
    sku.sizeUnit = dto.sizeUnit?.trim() || null;
    sku.baseUnitId = dto.baseUnitId;
    sku.purchaseUnitId = dto.purchaseUnitId;
    sku.unitsPerPurchaseUnit = String(
      await this.resolveUnitsPerPurchaseUnit(
        tenantId,
        dto.purchaseUnitId,
        dto.unitsPerPurchaseUnit,
      ),
    );
    sku.costPrice = String(dto.costPrice);
    sku.gstPercent = String(dto.gstPercent ?? 0);
    const nextHsCode = normalizeHsCode(dto.hsCode);
    if (nextHsCode) sku.hsCode = nextHsCode;
    sku.sellingPrice = String(dto.sellingPrice);
    sku.sellingPricePerPurchaseUnit =
      dto.sellingPricePerPurchaseUnit == null
        ? null
        : String(dto.sellingPricePerPurchaseUnit);
    sku.saleDiscountPercent = String(dto.saleDiscountPercent ?? 0);
    sku.reorderLevel = String(dto.reorderLevel ?? 0);
    sku.minimumStockLevel = String(dto.minimumStockLevel ?? 0);
    sku.maximumStockLevel =
      dto.maximumStockLevel == null ? null : String(dto.maximumStockLevel);
    sku.trackInventory = dto.trackInventory ?? true;
    if (dto.status) sku.status = dto.status;

    try {
      await this.skus.save(sku);
      const purchasePrice = vendorPurchasePriceFromSku({
        costPrice: toNum(sku.costPrice),
        unitsPerPurchaseUnit: toNum(sku.unitsPerPurchaseUnit, 1),
      });
      await this.vendorSkus.update(
        { tenantId, productSkuId: id },
        {
          purchaseUnitId: sku.purchaseUnitId,
          unitsPerPurchaseUnit: sku.unitsPerPurchaseUnit,
          purchasePrice: String(purchasePrice),
        },
      );
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

  async addOpeningStock(
    id: string,
    input: OpeningStockRequest,
  ): Promise<WarehouseStockRow> {
    const tenantId = this.fixedTenant.tenantId;
    const quantity = round4(Number(input.quantity));
    if (!(quantity > 0)) {
      throw new BadRequestException("Quantity must be greater than zero");
    }

    const sku = await this.skus.findOne({
      where: { id, tenantId },
      relations: { product: true },
    });
    if (!sku) throw new NotFoundException("SKU not found");
    if (!sku.trackInventory) {
      throw new BadRequestException("This SKU does not track inventory");
    }

    const warehouse = await this.dataSource.getRepository(Warehouse).findOne({
      where: { id: input.warehouseId, tenantId },
    });
    if (!warehouse || warehouse.status !== "active") {
      throw new BadRequestException("Warehouse not found");
    }

    const reason = input.reason?.trim() || "Add capital";
    const stock = await this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(InventoryMovement, {
          tenantId,
          productSkuId: sku.id,
          warehouseId: warehouse.id,
          movementType: "OPENING_BALANCE",
          quantity: String(quantity),
          referenceType: "opening_balance",
          referenceId: null,
          reason,
        }),
      );

      let row = await manager.findOne(InventoryStock, {
        where: {
          tenantId,
          productSkuId: sku.id,
          warehouseId: warehouse.id,
        },
      });
      if (!row) {
        row = manager.create(InventoryStock, {
          tenantId,
          productSkuId: sku.id,
          warehouseId: warehouse.id,
          quantityOnHand: "0",
          quantityReserved: "0",
          quantityAvailable: "0",
        });
      }
      const onHand = round4(toNum(row.quantityOnHand) + quantity);
      const reserved = toNum(row.quantityReserved);
      row.quantityOnHand = String(onHand);
      row.quantityAvailable = String(round4(onHand - reserved));
      return manager.save(row);
    });

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      productSkuId: sku.id,
      sku: sku.sku,
      variantName: sku.variantName,
      quantityOnHand: toNum(stock.quantityOnHand),
      quantityReserved: toNum(stock.quantityReserved),
      quantityAvailable: toNum(stock.quantityAvailable),
    };
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
      gstPercent: toNum(sku.gstPercent),
      hsCode: sku.hsCode,
      sellingPrice: toNum(sku.sellingPrice),
      sellingPricePerPurchaseUnit: toNumOrNull(sku.sellingPricePerPurchaseUnit),
      saleDiscountPercent: toNum(sku.saleDiscountPercent),
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

  private async resolveUnitsPerPurchaseUnit(
    tenantId: string,
    purchaseUnitId: string,
    raw: number,
  ): Promise<number> {
    const unit = await this.units.findOne({
      where: { id: purchaseUnitId, tenantId },
    });
    if (!unit) return normalizeUnitsPerPurchaseUnit(raw, {});
    return normalizeUnitsPerPurchaseUnit(raw, {
      name: unit.name,
      abbreviation: unit.abbreviation,
    });
  }
}
