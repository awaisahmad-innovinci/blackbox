import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityStatus, VendorSku as VendorSkuDto } from "@blackbox/shared";
import { In, Repository } from "typeorm";
import {
  InventoryStock,
  ProductSku,
  Unit,
  Vendor,
  VendorSku,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { CreateVendorSkuDto, UpdateVendorSkuDto } from "./dto/vendor-sku.dto";

function toNum(value: string): number {
  return Number(value);
}

@Injectable()
export class VendorSkusService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
    @InjectRepository(InventoryStock)
    private readonly stock: Repository<InventoryStock>,
  ) {}

  async listByVendor(
    vendorId: string,
    q?: string,
    warehouseId?: string,
  ): Promise<VendorSkuDto[]> {
    const tenantId = this.fixedTenant.tenantId;
    await this.assertVendor(tenantId, vendorId);

    const qb = this.vendorSkus
      .createQueryBuilder("vs")
      .innerJoinAndSelect("vs.productSku", "sku")
      .innerJoinAndSelect("sku.product", "product")
      .leftJoinAndSelect("vs.purchaseUnit", "unit")
      .where("vs.tenant_id = :tenantId", { tenantId })
      .andWhere("vs.vendor_id = :vendorId", { vendorId })
      .andWhere("vs.status = :status", { status: "active" })
      .andWhere("sku.status = :skuStatus", { skuStatus: "active" })
      .orderBy("product.name", "ASC")
      .addOrderBy("sku.variant_name", "ASC");

    if (q?.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(product.name) LIKE :term
          OR LOWER(sku.variant_name) LIKE :term
          OR LOWER(sku.sku) LIKE :term
          OR LOWER(COALESCE(sku.barcode, '')) LIKE :term
          OR LOWER(COALESCE(vs.vendor_sku_code, '')) LIKE :term)`,
        { term },
      );
    }

    const rows = await qb.getMany();

    const availableBySku = new Map<string, number>();
    if (warehouseId && rows.length > 0) {
      const stocks = await this.stock.find({
        where: {
          tenantId,
          warehouseId,
          productSkuId: In(rows.map((r) => r.productSkuId)),
        },
      });
      for (const s of stocks) {
        availableBySku.set(s.productSkuId, toNum(s.quantityAvailable));
      }
    }

    return rows.map((row) =>
      this.toDto(
        row,
        warehouseId
          ? (availableBySku.get(row.productSkuId) ?? 0)
          : undefined,
      ),
    );
  }

  async listBySku(productSkuId: string) {
    const tenantId = this.fixedTenant.tenantId;
    await this.assertSku(tenantId, productSkuId);

    const rows = await this.vendorSkus
      .createQueryBuilder("vs")
      .innerJoinAndSelect("vs.vendor", "vendor")
      .leftJoinAndSelect("vs.purchaseUnit", "unit")
      .where("vs.tenant_id = :tenantId", { tenantId })
      .andWhere("vs.product_sku_id = :productSkuId", { productSkuId })
      .andWhere("vs.status = :status", { status: "active" })
      .orderBy("vs.is_preferred", "DESC")
      .addOrderBy("vendor.name", "ASC")
      .getMany();

    return rows.map((row) => ({
      vendorSkuId: row.id,
      vendorId: row.vendorId,
      vendorName: row.vendor.name,
      vendorCode: row.vendor.vendorCode,
      purchasePrice: toNum(row.purchasePrice),
      minimumOrderQuantity: toNum(row.minimumOrderQuantity),
      leadTimeDays: row.leadTimeDays,
      isPreferred: row.isPreferred,
      purchaseUnitName: row.purchaseUnit
        ? `${row.purchaseUnit.name} (${row.purchaseUnit.abbreviation})`
        : null,
    }));
  }

  async create(dto: CreateVendorSkuDto): Promise<VendorSkuDto> {
    const tenantId = this.fixedTenant.tenantId;
    await this.assertVendor(tenantId, dto.vendorId);
    await this.assertSku(tenantId, dto.productSkuId);
    if (dto.purchaseUnitId) {
      await this.assertUnit(tenantId, dto.purchaseUnitId);
    }

    const existing = await this.vendorSkus.findOne({
      where: {
        tenantId,
        vendorId: dto.vendorId,
        productSkuId: dto.productSkuId,
      },
    });
    if (existing && existing.status === "active") {
      throw new ConflictException("This SKU is already linked to the vendor");
    }

    let row: VendorSku;
    if (existing) {
      existing.status = "active";
      existing.vendorSkuCode = dto.vendorSkuCode?.trim() || null;
      existing.purchasePrice = String(dto.purchasePrice);
      existing.purchaseUnitId = dto.purchaseUnitId ?? null;
      existing.unitsPerPurchaseUnit = String(dto.unitsPerPurchaseUnit ?? 1);
      existing.minimumOrderQuantity = String(dto.minimumOrderQuantity ?? 1);
      existing.leadTimeDays = dto.leadTimeDays ?? 0;
      existing.isPreferred = dto.isPreferred ?? false;
      existing.notes = dto.notes?.trim() ?? "";
      row = await this.vendorSkus.save(existing);
    } else {
      row = await this.vendorSkus.save(
        this.vendorSkus.create({
          tenantId,
          vendorId: dto.vendorId,
          productSkuId: dto.productSkuId,
          vendorSkuCode: dto.vendorSkuCode?.trim() || null,
          purchasePrice: String(dto.purchasePrice),
          purchaseUnitId: dto.purchaseUnitId ?? null,
          unitsPerPurchaseUnit: String(dto.unitsPerPurchaseUnit ?? 1),
          minimumOrderQuantity: String(dto.minimumOrderQuantity ?? 1),
          leadTimeDays: dto.leadTimeDays ?? 0,
          isPreferred: dto.isPreferred ?? false,
          notes: dto.notes?.trim() ?? "",
          status: "active",
        }),
      );
    }

    return this.getById(row.id);
  }

  async update(id: string, dto: UpdateVendorSkuDto): Promise<VendorSkuDto> {
    const tenantId = this.fixedTenant.tenantId;
    const row = await this.vendorSkus.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Vendor SKU link not found");

    if (dto.purchaseUnitId) {
      await this.assertUnit(tenantId, dto.purchaseUnitId);
    }

    if (dto.vendorSkuCode !== undefined) {
      row.vendorSkuCode = dto.vendorSkuCode?.trim() || null;
    }
    if (dto.purchasePrice !== undefined) {
      row.purchasePrice = String(dto.purchasePrice);
    }
    if (dto.purchaseUnitId !== undefined) {
      row.purchaseUnitId = dto.purchaseUnitId;
    }
    if (dto.unitsPerPurchaseUnit !== undefined) {
      row.unitsPerPurchaseUnit = String(dto.unitsPerPurchaseUnit);
    }
    if (dto.minimumOrderQuantity !== undefined) {
      row.minimumOrderQuantity = String(dto.minimumOrderQuantity);
    }
    if (dto.leadTimeDays !== undefined) {
      row.leadTimeDays = dto.leadTimeDays;
    }
    if (dto.isPreferred !== undefined) {
      row.isPreferred = dto.isPreferred;
    }
    if (dto.notes !== undefined) {
      row.notes = dto.notes.trim();
    }
    if (dto.status !== undefined) {
      row.status = dto.status;
    }

    await this.vendorSkus.save(row);
    return this.getById(id);
  }

  async deactivate(id: string): Promise<{ id: string; status: string }> {
    const tenantId = this.fixedTenant.tenantId;
    const row = await this.vendorSkus.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Vendor SKU link not found");

    if (row.status === "active") {
      const otherActive = await this.vendorSkus.count({
        where: {
          tenantId,
          productSkuId: row.productSkuId,
          status: "active",
        },
      });
      if (otherActive <= 1) {
        throw new BadRequestException(
          "SKU must have at least one supplier",
        );
      }
    }

    row.status = "inactive";
    await this.vendorSkus.save(row);
    return { id: row.id, status: row.status };
  }

  private async getById(id: string): Promise<VendorSkuDto> {
    const tenantId = this.fixedTenant.tenantId;
    const row = await this.vendorSkus
      .createQueryBuilder("vs")
      .innerJoinAndSelect("vs.productSku", "sku")
      .innerJoinAndSelect("sku.product", "product")
      .leftJoinAndSelect("vs.purchaseUnit", "unit")
      .where("vs.tenant_id = :tenantId", { tenantId })
      .andWhere("vs.id = :id", { id })
      .getOne();
    if (!row) throw new NotFoundException("Vendor SKU link not found");
    return this.toDto(row);
  }

  private toDto(
    row: VendorSku,
    quantityAvailable?: number,
  ): VendorSkuDto {
    return {
      id: row.id,
      vendorId: row.vendorId,
      productSkuId: row.productSkuId,
      vendorSkuCode: row.vendorSkuCode,
      purchasePrice: toNum(row.purchasePrice),
      purchaseUnitId: row.purchaseUnitId,
      purchaseUnitName: row.purchaseUnit
        ? `${row.purchaseUnit.name} (${row.purchaseUnit.abbreviation})`
        : null,
      unitsPerPurchaseUnit: toNum(row.unitsPerPurchaseUnit),
      minimumOrderQuantity: toNum(row.minimumOrderQuantity),
      leadTimeDays: row.leadTimeDays,
      isPreferred: row.isPreferred,
      status: row.status as EntityStatus,
      notes: row.notes,
      productName: row.productSku.product.name,
      variantName: row.productSku.variantName,
      sku: row.productSku.sku,
      barcode: row.productSku.barcode,
      ...(quantityAvailable !== undefined ? { quantityAvailable } : {}),
    };
  }

  private async assertVendor(tenantId: string, vendorId: string): Promise<void> {
    const vendor = await this.vendors.findOne({
      where: { id: vendorId, tenantId },
    });
    if (!vendor) throw new BadRequestException("Vendor not found");
  }

  private async assertSku(tenantId: string, productSkuId: string): Promise<void> {
    const sku = await this.skus.findOne({
      where: { id: productSkuId, tenantId },
    });
    if (!sku) throw new BadRequestException("Product SKU not found");
  }

  private async assertUnit(tenantId: string, unitId: string): Promise<void> {
    const unit = await this.units.findOne({ where: { id: unitId, tenantId } });
    if (!unit) throw new BadRequestException("Purchase unit not found");
  }
}
