import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYNC_CATALOG_DOCUMENT_KINDS,
  SYNC_CATALOG_PAGE_SIZE,
  SYNC_CATALOG_SECTIONS,
  VENDOR_CONTACT_TYPES,
  roundMoney4,
  type EntityStatus,
  type GoodsReceiptDetail,
  type GoodsReceiptItemRow,
  type GoodsReceiptStatus,
  type InventoryOutDetail,
  type InventoryOutItemRow,
  type InventoryOutStatus,
  type PaymentTerms,
  type ProductDetail,
  type ProductSkuDetail,
  type ProductType,
  type PurchaseOrderDetail,
  type PurchaseOrderItemRow,
  type PurchaseOrderStatus,
  type SkuBarcode,
  type SyncCatalogDocumentKind,
  type SyncCatalogPage,
  type SyncCatalogProductRow,
  type SyncCatalogReference,
  type SyncCatalogSection,
  type SyncCatalogVendorRow,
  type UnitListItem,
  type VendorContact,
  type VendorContactType,
  type VendorDetail,
  type VendorReturnDetail,
  type VendorReturnItemRow,
  type VendorReturnReason,
  type VendorReturnSettlement,
  type VendorReturnStatus,
  type VendorSku as VendorSkuDto,
  type WarehouseListItem,
  type WarehouseStockRow,
} from "@blackbox/shared";
import { In, Repository } from "typeorm";
import type { TenantContext } from "../common/tenant-context";
import {
  Brand,
  Category,
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryOut,
  InventoryOutLine,
  InventoryStock,
  Product,
  ProductSku,
  ProductSkuBarcode,
  PurchaseOrder,
  PurchaseOrderItem,
  Unit,
  Vendor,
  VendorContact as VendorContactEntity,
  VendorGroup,
  VendorReturn,
  VendorReturnItem,
  VendorSku,
  Warehouse,
} from "../db/entities";
import { SyncService } from "./sync.service";

function num(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

function pageArgs(pageRaw?: string, pageSizeRaw?: string) {
  const parsedPage = Number(pageRaw);
  const parsedSize = Number(pageSizeRaw);
  const page =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const pageSize = Math.min(
    SYNC_CATALOG_PAGE_SIZE,
    Math.max(
      1,
      Number.isFinite(parsedSize) && parsedSize >= 1
        ? Math.floor(parsedSize)
        : SYNC_CATALOG_PAGE_SIZE,
    ),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

@Injectable()
export class SyncCatalogService {
  constructor(
    private readonly sync: SyncService,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
    @InjectRepository(Brand)
    private readonly brands: Repository<Brand>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(VendorGroup)
    private readonly vendorGroups: Repository<VendorGroup>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductSku)
    private readonly skus: Repository<ProductSku>,
    @InjectRepository(ProductSkuBarcode)
    private readonly barcodes: Repository<ProductSkuBarcode>,
    @InjectRepository(InventoryStock)
    private readonly stock: Repository<InventoryStock>,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(VendorContactEntity)
    private readonly vendorContacts: Repository<VendorContactEntity>,
    @InjectRepository(VendorSku)
    private readonly vendorSkus: Repository<VendorSku>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrders: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItems: Repository<PurchaseOrderItem>,
    @InjectRepository(GoodsReceipt)
    private readonly goodsReceipts: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptItem)
    private readonly goodsReceiptItems: Repository<GoodsReceiptItem>,
    @InjectRepository(InventoryOut)
    private readonly inventoryOuts: Repository<InventoryOut>,
    @InjectRepository(InventoryOutLine)
    private readonly inventoryOutLines: Repository<InventoryOutLine>,
    @InjectRepository(VendorReturn)
    private readonly vendorReturns: Repository<VendorReturn>,
    @InjectRepository(VendorReturnItem)
    private readonly vendorReturnItems: Repository<VendorReturnItem>,
  ) {}

  async snapshot(
    user: TenantContext,
    sectionRaw: string,
    pageRaw?: string,
    pageSizeRaw?: string,
    kindRaw?: string,
  ): Promise<
    | SyncCatalogReference
    | SyncCatalogPage<SyncCatalogProductRow>
    | SyncCatalogPage<SyncCatalogVendorRow>
    | SyncCatalogPage<WarehouseStockRow>
    | SyncCatalogPage<PurchaseOrderDetail>
    | SyncCatalogPage<GoodsReceiptDetail>
    | SyncCatalogPage<InventoryOutDetail>
    | SyncCatalogPage<VendorReturnDetail>
  > {
    await this.sync.assertCanSync(user);
    if (!SYNC_CATALOG_SECTIONS.includes(sectionRaw as SyncCatalogSection)) {
      throw new BadRequestException("Unknown catalog section");
    }
    const section = sectionRaw as SyncCatalogSection;
    const tenantId = user.tenantId;
    const page = pageArgs(pageRaw, pageSizeRaw);

    switch (section) {
      case "reference":
        return this.reference(tenantId);
      case "products":
        return this.productPage(tenantId, page);
      case "vendors":
        return this.vendorPage(tenantId, page);
      case "stock":
        return this.stockPage(tenantId, page);
      case "documents":
        return this.documentPage(tenantId, page, kindRaw);
    }
  }

  private async reference(tenantId: string): Promise<SyncCatalogReference> {
    const [units, brands, categories, vendorGroups, warehouses] =
      await Promise.all([
        this.units.find({
          where: { tenantId, status: "active" },
          order: { name: "ASC" },
        }),
        this.brands.find({ where: { tenantId }, order: { name: "ASC" } }),
        this.categories.find({ where: { tenantId }, order: { name: "ASC" } }),
        this.vendorGroups.find({
          where: { tenantId },
          order: { name: "ASC" },
        }),
        this.warehouses.find({ where: { tenantId }, order: { name: "ASC" } }),
      ]);

    const asStatus = (status: string): EntityStatus => status as EntityStatus;
    const unitsOut: UnitListItem[] = units.map((row) => ({
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
      type: row.type,
      status: asStatus(row.status),
    }));
    return {
      units: unitsOut,
      brands: brands.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: asStatus(row.status),
      })),
      categories: categories.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: asStatus(row.status),
      })),
      vendorGroups: vendorGroups.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: asStatus(row.status),
      })),
      warehouses: warehouses.map(
        (row): WarehouseListItem => ({
          id: row.id,
          name: row.name,
          code: row.code,
          location: row.location,
          status: asStatus(row.status),
        }),
      ),
    };
  }

  private async productPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<SyncCatalogProductRow>> {
    const total = await this.products.count({ where: { tenantId } });
    const rows = await this.products.find({
      where: { tenantId },
      relations: { brand: true, category: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const skuRows =
      ids.length === 0
        ? []
        : await this.skus.find({
            where: { tenantId, productId: In(ids) },
            relations: { baseUnit: true, purchaseUnit: true },
            order: { variantName: "ASC" },
          });
    const skuIds = skuRows.map((row) => row.id);
    const barcodeRows =
      skuIds.length === 0
        ? []
        : await this.barcodes.find({
            where: { tenantId, productSkuId: In(skuIds) },
            order: { createdAt: "ASC" },
          });
    const totals =
      ids.length === 0
        ? []
        : await this.stock
            .createQueryBuilder("st")
            .innerJoin("st.productSku", "s")
            .select("s.product_id", "productId")
            .addSelect("COALESCE(SUM(st.quantity_on_hand), 0)", "onHand")
            .addSelect("COALESCE(SUM(st.quantity_reserved), 0)", "reserved")
            .addSelect("COALESCE(SUM(st.quantity_available), 0)", "available")
            .where("st.tenant_id = :tenantId", { tenantId })
            .andWhere("s.product_id IN (:...ids)", { ids })
            .groupBy("s.product_id")
            .getRawMany<{
              productId: string;
              onHand: string;
              reserved: string;
              available: string;
            }>();

    const skusByProduct = groupBy(skuRows, (row) => row.productId);
    const barcodesBySku = groupBy(barcodeRows, (row) => row.productSkuId);
    const totalsByProduct = new Map(
      totals.map((row) => [row.productId, row] as const),
    );

    const items: SyncCatalogProductRow[] = rows.map((product) => {
      const stockTotals = totalsByProduct.get(product.id);
      const productSkus = skusByProduct.get(product.id) ?? [];
      const detail: ProductDetail = {
        id: product.id,
        name: product.name,
        productCode: product.productCode,
        importKey: product.importKey ?? null,
        brandId: product.brandId,
        brandName: product.brand?.name ?? null,
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? null,
        productType: product.productType as ProductType,
        description: product.description,
        imagePath: product.imagePath,
        status: product.status as EntityStatus,
        totalOnHand: num(stockTotals?.onHand),
        totalReserved: num(stockTotals?.reserved),
        totalAvailable: num(stockTotals?.available),
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      };
      const skus: ProductSkuDetail[] = productSkus.map((sku) => ({
        id: sku.id,
        productId: sku.productId,
        variantName: sku.variantName,
        sku: sku.sku,
        barcode: sku.barcode,
        sizeValue: sku.sizeValue,
        sizeUnit: sku.sizeUnit,
        baseUnitId: sku.baseUnitId,
        baseUnitName: sku.baseUnit?.name ?? null,
        purchaseUnitId: sku.purchaseUnitId,
        purchaseUnitName: sku.purchaseUnit?.name ?? null,
        unitsPerPurchaseUnit: num(sku.unitsPerPurchaseUnit),
        costPrice: num(sku.costPrice),
        gstPercent: num(sku.gstPercent),
        hsCode: sku.hsCode,
        sellingPrice: num(sku.sellingPrice),
        sellingPricePerPurchaseUnit: numOrNull(sku.sellingPricePerPurchaseUnit),
        saleDiscountPercent: num(sku.saleDiscountPercent),
        reorderLevel: num(sku.reorderLevel),
        minimumStockLevel: num(sku.minimumStockLevel),
        maximumStockLevel: numOrNull(sku.maximumStockLevel),
        trackInventory: sku.trackInventory,
        status: sku.status as EntityStatus,
      }));
      const barcodes: SkuBarcode[] = productSkus.flatMap((sku) =>
        (barcodesBySku.get(sku.id) ?? []).map((barcode) => ({
          id: barcode.id,
          productSkuId: barcode.productSkuId,
          barcode: barcode.barcode,
          status: barcode.status as EntityStatus,
          quantityMultiplier: num(barcode.quantityMultiplier) || 1,
        })),
      );
      return { product: detail, skus, barcodes };
    });

    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private async vendorPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<SyncCatalogVendorRow>> {
    const total = await this.vendors.count({ where: { tenantId } });
    const rows = await this.vendors.find({
      where: { tenantId },
      relations: { group: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const contacts =
      ids.length === 0
        ? []
        : await this.vendorContacts.find({
            where: { tenantId, vendorId: In(ids) },
          });
    const links =
      ids.length === 0
        ? []
        : await this.vendorSkus
            .createQueryBuilder("vs")
            .innerJoinAndSelect("vs.productSku", "sku")
            .innerJoinAndSelect("sku.product", "product")
            .leftJoinAndSelect("vs.purchaseUnit", "unit")
            .leftJoinAndSelect("sku.baseUnit", "baseUnit")
            .where("vs.tenant_id = :tenantId", { tenantId })
            .andWhere("vs.vendor_id IN (:...ids)", { ids })
            .andWhere("vs.status = :status", { status: "active" })
            .andWhere("sku.status = :skuStatus", { skuStatus: "active" })
            .orderBy("product.name", "ASC")
            .addOrderBy("sku.variant_name", "ASC")
            .getMany();

    const contactsByVendor = groupBy(contacts, (row) => row.vendorId);
    const linksByVendor = groupBy(links, (row) => row.vendorId);
    const items: SyncCatalogVendorRow[] = rows.map((vendor) => ({
      vendor: this.mapVendor(vendor, contactsByVendor.get(vendor.id) ?? []),
      links: (linksByVendor.get(vendor.id) ?? []).map((row) =>
        this.mapVendorSku(row),
      ),
    }));
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private async stockPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<WarehouseStockRow>> {
    const total = await this.stock.count({ where: { tenantId } });
    const rows = await this.stock.find({
      where: { tenantId },
      relations: { productSku: true, warehouse: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const items: WarehouseStockRow[] = rows.map((row) => ({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse?.name ?? "—",
      productSkuId: row.productSkuId,
      sku: row.productSku?.sku ?? "—",
      variantName: row.productSku?.variantName ?? "",
      quantityOnHand: num(row.quantityOnHand),
      quantityReserved: num(row.quantityReserved),
      quantityAvailable: num(row.quantityAvailable),
    }));
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private async documentPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
    kindRaw?: string,
  ) {
    if (
      !kindRaw ||
      !SYNC_CATALOG_DOCUMENT_KINDS.includes(kindRaw as SyncCatalogDocumentKind)
    ) {
      throw new BadRequestException("Unknown catalog document kind");
    }
    const kind = kindRaw as SyncCatalogDocumentKind;
    switch (kind) {
      case "purchaseOrders":
        return this.purchaseOrderPage(tenantId, page);
      case "goodsReceipts":
        return this.goodsReceiptPage(tenantId, page);
      case "inventoryOuts":
        return this.inventoryOutPage(tenantId, page);
      case "vendorReturns":
        return this.vendorReturnPage(tenantId, page);
    }
  }

  private async purchaseOrderPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<PurchaseOrderDetail>> {
    const total = await this.purchaseOrders.count({ where: { tenantId } });
    const rows = await this.purchaseOrders.find({
      where: { tenantId },
      relations: { vendor: true, warehouse: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const lines =
      ids.length === 0
        ? []
        : await this.purchaseOrderItems.find({
            where: { tenantId, purchaseOrderId: In(ids) },
            relations: {
              productSku: { product: true, baseUnit: true },
              vendorSku: true,
              purchaseUnit: true,
            },
            order: { createdAt: "ASC" },
          });
    const linesByPo = groupBy(lines, (row) => row.purchaseOrderId);
    const items = rows.map((po): PurchaseOrderDetail => {
      const poLines = linesByPo.get(po.id) ?? [];
      const mapped: PurchaseOrderItemRow[] = poLines.map((line) => ({
        id: line.id,
        productSkuId: line.productSkuId,
        vendorSkuId: line.vendorSkuId ?? "",
        productName: line.productSku?.product?.name ?? "—",
        variantName: line.productSku?.variantName ?? "",
        sku: line.productSku?.sku ?? "—",
        vendorSkuCode: line.vendorSku?.vendorSkuCode ?? null,
        purchaseUnitId: line.purchaseUnitId,
        purchaseUnitName: line.purchaseUnit?.name ?? null,
        baseUnitName: line.productSku?.baseUnit?.name ?? null,
        unitsPerPurchaseUnit: num(line.unitsPerPurchaseUnit),
        orderUnit: (line.orderUnit === "pc" ? "pc" : "box") as "pc" | "box",
        quantity: num(line.quantity),
        unitCost: num(line.unitCost),
        discount: num(line.discount),
        tax: num(line.tax),
        lineTotal: num(line.lineTotal),
        minimumOrderQuantity: num(line.vendorSku?.minimumOrderQuantity),
      }));
      return {
        id: po.id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        vendorName: po.vendor?.name ?? "—",
        warehouseId: po.warehouseId,
        warehouseName: po.warehouse?.name ?? "—",
        status: po.status as PurchaseOrderStatus,
        orderDate: po.orderDate,
        expectedDate: po.expectedDate,
        subtotal: num(po.subtotal),
        discount: num(po.discount),
        tax: num(po.tax),
        otherCharges: num(po.otherCharges),
        total: num(po.total),
        notes: po.notes,
        items: mapped,
        createdAt: po.createdAt.toISOString(),
        updatedAt: po.updatedAt.toISOString(),
      };
    });
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private async goodsReceiptPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<GoodsReceiptDetail>> {
    const total = await this.goodsReceipts.count({ where: { tenantId } });
    const rows = await this.goodsReceipts.find({
      where: { tenantId },
      relations: { purchaseOrder: true, vendor: true, warehouse: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const lines =
      ids.length === 0
        ? []
        : await this.goodsReceiptItems.find({
            where: { tenantId, goodsReceiptId: In(ids) },
            relations: {
              productSku: { product: true },
              vendorSku: true,
              purchaseUnit: true,
            },
            order: { createdAt: "ASC" },
          });
    const linesByReceipt = groupBy(lines, (row) => row.goodsReceiptId);
    const items = rows.map((receipt): GoodsReceiptDetail => {
      const receiptLines = linesByReceipt.get(receipt.id) ?? [];
      const mapped: GoodsReceiptItemRow[] = receiptLines.map((line) => ({
        id: line.id,
        purchaseOrderItemId: line.purchaseOrderItemId,
        productSkuId: line.productSkuId,
        vendorSkuId: line.vendorSkuId,
        productName: line.productSku?.product?.name ?? "—",
        variantName: line.productSku?.variantName ?? "",
        sku: line.productSku?.sku ?? "—",
        vendorSkuCode: line.vendorSku?.vendorSkuCode ?? null,
        purchaseUnitId: line.purchaseUnitId,
        purchaseUnitName: line.purchaseUnit?.name ?? null,
        unitsPerPurchaseUnit: num(line.unitsPerPurchaseUnit),
        orderedQuantity: num(line.orderedQuantity),
        receivedQuantity: num(line.receivedQuantity),
        bonusQuantity: num(line.bonusQuantity),
        poUnitCost: num(line.poUnitCost),
        receivingUnitCost: num(line.receivingUnitCost),
        discountPercent: num(line.discountPercent),
        saleTax: num(line.saleTax),
        advTax: num(line.advTax),
        gst: num(line.gst),
        lineTotal: num(line.lineTotal),
      }));
      return {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        purchaseOrderId: receipt.purchaseOrderId,
        poNumber: receipt.purchaseOrder?.poNumber ?? "—",
        vendorId: receipt.vendorId,
        vendorName: receipt.vendor?.name ?? null,
        warehouseId: receipt.warehouseId,
        warehouseName: receipt.warehouse?.name ?? "—",
        status: receipt.status as GoodsReceiptStatus,
        receivedAt: receipt.receivedAt?.toISOString() ?? null,
        voucherNumber: receipt.voucherNumber,
        subtotal: num(receipt.subtotal),
        discount: num(receipt.discount),
        saleTax: num(receipt.tax),
        advTax: num(receipt.advTax),
        gst: num(receipt.gst),
        incentive: num(receipt.incentive),
        shelfRent: num(receipt.shelfRent),
        tax: num(receipt.tax),
        otherCharges: num(receipt.otherCharges),
        returnCredit: num(receipt.returnCredit),
        total: num(receipt.total),
        amountPaid: num(receipt.amountPaid),
        notes: receipt.notes,
        items: mapped,
        createdAt: receipt.createdAt.toISOString(),
        updatedAt: receipt.updatedAt.toISOString(),
      };
    });
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private async inventoryOutPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<InventoryOutDetail>> {
    const total = await this.inventoryOuts.count({ where: { tenantId } });
    const rows = await this.inventoryOuts.find({
      where: { tenantId },
      relations: { warehouse: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const lines =
      ids.length === 0
        ? []
        : await this.inventoryOutLines.find({
            where: { tenantId, inventoryOutId: In(ids) },
            relations: { productSku: { product: true } },
            order: { createdAt: "ASC" },
          });
    const linesByOut = groupBy(lines, (row) => row.inventoryOutId);
    const items = rows.map((header): InventoryOutDetail => {
      const mapped: InventoryOutItemRow[] = (linesByOut.get(header.id) ?? []).map(
        (line) => {
          const quantity = num(line.quantity);
          const unitCost = num(line.unitCost);
          return {
            id: line.id,
            productSkuId: line.productSkuId,
            productName: line.productSku?.product?.name ?? "—",
            variantName: line.productSku?.variantName ?? "",
            sku: line.productSku?.sku ?? "—",
            barcode: line.productSku?.barcode ?? null,
            quantity,
            unitCost,
            lineTotal: roundMoney4(quantity * unitCost),
          };
        },
      );
      return {
        id: header.id,
        outNumber: header.outNumber,
        warehouseId: header.warehouseId,
        warehouseName: header.warehouse?.name ?? "—",
        outDate:
          typeof header.outDate === "string"
            ? header.outDate.slice(0, 10)
            : String(header.outDate).slice(0, 10),
        reference: header.reference,
        notes: header.notes,
        status: header.status as InventoryOutStatus,
        subtotal: num(header.subtotal),
        total: num(header.total),
        items: mapped,
        createdAt: header.createdAt.toISOString(),
        updatedAt: header.updatedAt.toISOString(),
      };
    });
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private async vendorReturnPage(
    tenantId: string,
    page: ReturnType<typeof pageArgs>,
  ): Promise<SyncCatalogPage<VendorReturnDetail>> {
    const total = await this.vendorReturns.count({ where: { tenantId } });
    const rows = await this.vendorReturns.find({
      where: { tenantId },
      relations: { vendor: true, warehouse: true },
      order: { createdAt: "ASC", id: "ASC" },
      skip: page.skip,
      take: page.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const lines =
      ids.length === 0
        ? []
        : await this.vendorReturnItems.find({
            where: { tenantId, vendorReturnId: In(ids) },
            relations: { productSku: { product: true }, purchaseUnit: true },
            order: { createdAt: "ASC" },
          });
    const linesByReturn = groupBy(lines, (row) => row.vendorReturnId);
    const items = rows.map((header): VendorReturnDetail => {
      const mapped: VendorReturnItemRow[] = (
        linesByReturn.get(header.id) ?? []
      ).map((line) => {
        const quantity = num(line.quantity);
        const unitCost = num(line.unitCost);
        const unitsPer = num(line.unitsPerPurchaseUnit) || 1;
        return {
          id: line.id,
          productSkuId: line.productSkuId,
          vendorSkuId: line.vendorSkuId,
          productName: line.productSku?.product?.name ?? "—",
          variantName: line.productSku?.variantName ?? "",
          sku: line.productSku?.sku ?? "—",
          barcode: line.productSku?.barcode ?? null,
          purchaseUnitId: line.purchaseUnitId,
          purchaseUnitName: line.purchaseUnit?.name ?? null,
          unitsPerPurchaseUnit: unitsPer,
          quantity,
          unitCost,
          lineTotal: roundMoney4((quantity / unitsPer) * unitCost),
          reason: line.reason as VendorReturnReason,
          settlement: (line.settlement as VendorReturnSettlement | null) ?? null,
          goodsReceiptId: line.goodsReceiptId,
        };
      });
      return {
        id: header.id,
        returnNumber: header.returnNumber,
        vendorId: header.vendorId,
        vendorName: header.vendor?.name ?? "—",
        warehouseId: header.warehouseId,
        warehouseName: header.warehouse?.name ?? "—",
        returnDate:
          typeof header.returnDate === "string"
            ? header.returnDate.slice(0, 10)
            : String(header.returnDate).slice(0, 10),
        notes: header.notes,
        status: header.status as VendorReturnStatus,
        subtotal: num(header.subtotal),
        total: num(header.total),
        items: mapped,
        createdAt: header.createdAt.toISOString(),
        updatedAt: header.updatedAt.toISOString(),
      };
    });
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  private mapVendor(
    vendor: Vendor,
    contacts: VendorContactEntity[],
  ): VendorDetail {
    const mapped: VendorContact[] = contacts
      .slice()
      .sort(
        (a, b) =>
          VENDOR_CONTACT_TYPES.indexOf(a.contactType as VendorContactType) -
          VENDOR_CONTACT_TYPES.indexOf(b.contactType as VendorContactType),
      )
      .map((contact) => ({
        id: contact.id,
        contactType: contact.contactType as VendorContactType,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
      }));
    return {
      id: vendor.id,
      name: vendor.name,
      vendorCode: vendor.vendorCode,
      groupId: vendor.groupId,
      groupName: vendor.group?.name ?? null,
      status: vendor.status as EntityStatus,
      address: vendor.address,
      city: vendor.city,
      state: vendor.state,
      country: vendor.country,
      postalCode: vendor.postalCode,
      salesTarget: num(vendor.salesTarget),
      creditLimit: num(vendor.creditLimit),
      paymentTerms: (vendor.paymentTerms as PaymentTerms | null) ?? null,
      taxNumber: vendor.taxNumber,
      notes: vendor.notes,
      contacts: mapped,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
    };
  }

  private mapVendorSku(row: VendorSku): VendorSkuDto {
    return {
      id: row.id,
      vendorId: row.vendorId,
      productSkuId: row.productSkuId,
      vendorSkuCode: row.vendorSkuCode,
      purchasePrice: num(row.purchasePrice),
      purchaseUnitId: row.purchaseUnitId,
      purchaseUnitName: row.purchaseUnit
        ? `${row.purchaseUnit.name} (${row.purchaseUnit.abbreviation})`
        : null,
      purchaseUnitAbbreviation: row.purchaseUnit?.abbreviation ?? null,
      unitsPerPurchaseUnit: num(row.unitsPerPurchaseUnit),
      baseUnitName: row.productSku?.baseUnit?.name ?? null,
      minimumOrderQuantity: num(row.minimumOrderQuantity),
      leadTimeDays: row.leadTimeDays,
      isPreferred: row.isPreferred,
      status: row.status as EntityStatus,
      notes: row.notes,
      productName: row.productSku?.product?.name ?? "—",
      variantName: row.productSku?.variantName ?? "",
      sku: row.productSku?.sku ?? "—",
      barcode: row.productSku?.barcode ?? null,
    };
  }
}
