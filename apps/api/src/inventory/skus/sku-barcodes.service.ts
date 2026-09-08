import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityStatus, SkuBarcode as SkuBarcodeDto } from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { ProductSku, ProductSkuBarcode } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";

function toNum(value: string | null | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type BarcodeMatch = {
  skuId: string;
  quantityMultiplier: number;
};

@Injectable()
export class SkuBarcodesService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(ProductSkuBarcode)
    private readonly barcodes: Repository<ProductSkuBarcode>,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
  ) {}

  async listBySku(skuId: string): Promise<SkuBarcodeDto[]> {
    const tenantId = this.fixedTenant.tenantId;
    await this.assertSku(tenantId, skuId);
    const rows = await this.barcodes.find({
      where: { tenantId, productSkuId: skuId, status: "active" },
      order: { createdAt: "ASC" },
    });
    return rows.map((row) => this.mapRow(row));
  }

  async add(
    skuId: string,
    barcode: string,
    quantityMultiplier = 1,
  ): Promise<SkuBarcodeDto> {
    const tenantId = this.fixedTenant.tenantId;
    const code = barcode.trim();
    if (!code) throw new BadRequestException("Barcode is required");
    if (!Number.isFinite(quantityMultiplier) || quantityMultiplier <= 0) {
      throw new BadRequestException("Quantity multiplier must be greater than zero");
    }
    await this.assertSku(tenantId, skuId);

    const existing = await this.barcodes.findOne({
      where: { tenantId, barcode: code },
    });
    if (existing && existing.status === "active") {
      if (existing.productSkuId === skuId) {
        existing.quantityMultiplier = String(quantityMultiplier);
        const row = await this.barcodes.save(existing);
        return this.mapRow(row);
      }
      throw new ConflictException("Barcode is already assigned to another SKU");
    }

    let row: ProductSkuBarcode;
    try {
      if (existing) {
        existing.productSkuId = skuId;
        existing.status = "active";
        existing.quantityMultiplier = String(quantityMultiplier);
        row = await this.barcodes.save(existing);
      } else {
        row = await this.barcodes.save(
          this.barcodes.create({
            tenantId,
            productSkuId: skuId,
            barcode: code,
            quantityMultiplier: String(quantityMultiplier),
            status: "active",
          }),
        );
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Barcode is already assigned to another SKU");
      }
      throw error;
    }

    await this.refreshDisplayBarcode(tenantId, skuId);
    return this.mapRow(row);
  }

  async remove(skuId: string, barcodeId: string): Promise<void> {
    const tenantId = this.fixedTenant.tenantId;
    await this.assertSku(tenantId, skuId);
    const row = await this.barcodes.findOne({
      where: { id: barcodeId, tenantId, productSkuId: skuId },
    });
    if (!row) throw new NotFoundException("Barcode not found");
    row.status = "inactive";
    await this.barcodes.save(row);
    await this.refreshDisplayBarcode(tenantId, skuId);
  }

  async refreshDisplayBarcode(tenantId: string, skuId: string): Promise<void> {
    const first = await this.barcodes.findOne({
      where: { tenantId, productSkuId: skuId, status: "active" },
      order: { createdAt: "ASC" },
    });
    await this.skus.update(
      { id: skuId, tenantId },
      { barcode: first?.barcode ?? null },
    );
  }

  async findSkuIdByBarcode(
    tenantId: string,
    barcode: string,
    activeOnly = false,
  ): Promise<string | null> {
    const match = await this.findBarcodeMatch(tenantId, barcode, activeOnly);
    return match?.skuId ?? null;
  }

  async findBarcodeMatch(
    tenantId: string,
    barcode: string,
    activeOnly = false,
  ): Promise<BarcodeMatch | null> {
    const code = barcode.trim();
    if (!code) return null;

    const row = await this.barcodes.findOne({
      where: {
        tenantId,
        barcode: code,
        ...(activeOnly ? { status: "active" as EntityStatus } : {}),
      },
    });
    if (row) {
      return {
        skuId: row.productSkuId,
        quantityMultiplier: toNum(row.quantityMultiplier, 1),
      };
    }

    const legacy = await this.skus.findOne({
      where: {
        tenantId,
        barcode: code,
        ...(activeOnly ? { status: "active" } : {}),
      },
      select: { id: true },
    });
    return legacy ? { skuId: legacy.id, quantityMultiplier: 1 } : null;
  }

  private mapRow(row: ProductSkuBarcode): SkuBarcodeDto {
    return {
      id: row.id,
      productSkuId: row.productSkuId,
      barcode: row.barcode,
      status: row.status as EntityStatus,
      quantityMultiplier: toNum(row.quantityMultiplier, 1),
    };
  }

  private async assertSku(tenantId: string, skuId: string): Promise<ProductSku> {
    const sku = await this.skus.findOne({ where: { id: skuId, tenantId } });
    if (!sku) throw new NotFoundException("SKU not found");
    return sku;
  }
}
