import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
  ENTITY_STATUSES,
  MASTER_DATA_IMPORT_FILES,
  PAYMENT_TERMS,
  PRODUCT_TYPES,
  UNIT_TYPES,
  normalizeOptionalStoredText,
  normalizeStoredText,
} from "@blackbox/shared";
import type {
  MasterDataImportError,
  MasterDataImportResult,
} from "@blackbox/shared";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { DataSource, EntityManager } from "typeorm";
import {
  Brand,
  Category,
  Product,
  ProductSku,
  Unit,
  Vendor,
  VendorContact,
  VendorGroup,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";

type ImportFile = (typeof MASTER_DATA_IMPORT_FILES)[number];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const HEADERS = {
  "01_units.csv": ["abbreviation", "name", "type", "status"],
  "02_brands.csv": ["name", "description", "status"],
  "03_categories.csv": ["name", "description", "status"],
  "04_warehouses.csv": ["code", "name", "location", "status"],
  "05_vendor_groups.csv": ["name", "description", "status"],
  "06_products.csv": [
    "import_key",
    "name",
    "brand_name",
    "category_name",
    "product_type",
    "description",
    "status",
  ],
  "07_product_skus.csv": [
    "product_import_key",
    "sku",
    "barcode",
    "variant_name",
    "size_value",
    "size_unit",
    "base_unit_abbreviation",
    "purchase_unit_abbreviation",
    "units_per_purchase_unit",
    "cost_price",
    "selling_price",
    "selling_price_per_purchase_unit",
    "reorder_level",
    "minimum_stock_level",
    "maximum_stock_level",
    "track_inventory",
    "status",
  ],
  "08_vendors.csv": [
    "vendor_code",
    "name",
    "group_name",
    "address",
    "city",
    "state",
    "country",
    "postal_code",
    "sales_target",
    "credit_limit",
    "payment_terms",
    "tax_number",
    "notes",
    "status",
    "primary_name",
    "primary_phone",
    "primary_email",
    "manager_name",
    "manager_phone",
    "manager_email",
    "other_name",
    "other_phone",
    "other_email",
    "salesperson_name",
    "salesperson_phone",
    "salesperson_email",
  ],
  "09_vendor_skus.csv": [
    "vendor_code",
    "sku",
    "vendor_sku_code",
    "purchase_unit_abbreviation",
    "units_per_purchase_unit",
    "purchase_price",
    "minimum_order_quantity",
    "lead_time_days",
    "is_preferred",
    "notes",
    "status",
  ],
} as const satisfies Record<ImportFile, readonly string[]>;

type CsvColumn = (typeof HEADERS)[ImportFile][number];
type CsvRow = {
  file: ImportFile;
  line: number;
  values: Record<CsvColumn, string>;
};
type ParsedFiles = Record<ImportFile, CsvRow[]>;
type FileBuffers = Partial<Record<ImportFile, Buffer>>;
type FileCounts = Record<ImportFile, { created: number; updated: number }>;

const REQUIRED: Record<ImportFile, readonly CsvColumn[]> = {
  "01_units.csv": ["abbreviation", "name", "type", "status"],
  "02_brands.csv": ["name", "status"],
  "03_categories.csv": ["name", "status"],
  "04_warehouses.csv": ["code", "name", "status"],
  "05_vendor_groups.csv": ["name", "status"],
  "06_products.csv": [
    "import_key",
    "name",
    "brand_name",
    "category_name",
    "product_type",
    "status",
  ],
  "07_product_skus.csv": [
    "product_import_key",
    "sku",
    "variant_name",
    "units_per_purchase_unit",
    "cost_price",
    "selling_price",
    "selling_price_per_purchase_unit",
    "reorder_level",
    "minimum_stock_level",
    "track_inventory",
    "status",
  ],
  "08_vendors.csv": [
    "vendor_code",
    "name",
    "status",
    "primary_name",
    "primary_phone",
    "manager_name",
    "manager_phone",
  ],
  "09_vendor_skus.csv": [
    "vendor_code",
    "sku",
    "units_per_purchase_unit",
    "purchase_price",
    "minimum_order_quantity",
    "lead_time_days",
    "is_preferred",
    "status",
  ],
};

@Injectable()
export class MasterDataImportService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async import(
    uploads?: Express.Multer.File[],
  ): Promise<MasterDataImportResult> {
    if (!uploads || uploads.length === 0) {
      this.fail([
        this.uploadError(
          'Upload one ZIP package in field "file", or one to nine CSV files in field "files"',
        ),
      ]);
    }
    const oversized = uploads.find((upload) => upload.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      this.fail([
        this.uploadError(
          `Each uploaded file must not exceed 10 MB: ${this.baseName(oversized.originalname)}`,
        ),
      ]);
    }

    const errors: MasterDataImportError[] = [];
    const buffers = this.isArchiveUpload(uploads)
      ? this.readArchive(uploads[0]!.buffer, errors)
      : this.readCsvUploads(uploads, errors);
    if (!buffers) this.fail(errors);
    const selectedFiles = MASTER_DATA_IMPORT_FILES.filter(
      (name) => buffers[name] !== undefined,
    );
    const files = this.decodeAndParse(buffers, errors);
    if (!files) this.fail(errors);
    this.validateRows(files, errors);
    if (errors.length > 0) this.fail(errors);

    const counts = await this.dataSource.transaction((manager) =>
      this.validateReferencesAndImport(manager, files),
    );
    const results = selectedFiles.map((name) => ({
      file: name,
      rows: files[name].length,
      created: counts[name].created,
      updated: counts[name].updated,
    }));
    return {
      ok: true,
      files: results,
      totalRows: results.reduce((sum, item) => sum + item.rows, 0),
      totalCreated: results.reduce((sum, item) => sum + item.created, 0),
      totalUpdated: results.reduce((sum, item) => sum + item.updated, 0),
    };
  }

  private isArchiveUpload(uploads: Express.Multer.File[]): boolean {
    if (uploads.length !== 1) return false;
    const upload = uploads[0]!;
    return (
      upload.fieldname === "file" ||
      this.baseName(upload.originalname).toLowerCase().endsWith(".zip")
    );
  }

  private readCsvUploads(
    uploads: Express.Multer.File[],
    errors: MasterDataImportError[],
  ): FileBuffers | null {
    const expected = new Set<string>(MASTER_DATA_IMPORT_FILES);
    const buffers = {} as FileBuffers;
    const seen = new Set<string>();
    let totalSize = 0;

    for (const upload of uploads) {
      const raw = upload.originalname;
      const name = this.baseName(raw);
      if (raw !== name || name.includes("\0") || name === "..") {
        errors.push(
          this.uploadError(`File names must not contain a path: ${raw}`),
        );
        continue;
      }
      if (!expected.has(name)) {
        errors.push(this.uploadError(`Unexpected file: ${name}`));
      } else if (seen.has(name)) {
        errors.push(this.uploadError(`Duplicate file: ${name}`));
      } else {
        seen.add(name);
        buffers[name as ImportFile] = upload.buffer;
      }
      totalSize += upload.size;
    }
    if (totalSize > MAX_UNCOMPRESSED_BYTES) {
      errors.push(this.uploadError("Upload exceeds the 50 MB safety limit"));
    }
    return errors.length === 0 ? buffers : null;
  }

  private readArchive(
    buffer: Buffer,
    errors: MasterDataImportError[],
  ): FileBuffers | null {
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      !(
        (buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08)
      )
    ) {
      errors.push(this.uploadError("Uploaded file is not a valid ZIP archive"));
      return null;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      errors.push(this.uploadError("Uploaded file is not a valid ZIP archive"));
      return null;
    }

    let entries;
    try {
      entries = zip.getEntries();
    } catch {
      errors.push(this.uploadError("Unable to read ZIP archive"));
      return null;
    }
    const expected = new Set<string>(MASTER_DATA_IMPORT_FILES);
    const seen = new Set<string>();
    let totalSize = 0;

    for (const entry of entries) {
      const name = entry.entryName;
      const unixType = (entry.attr >>> 16) & 0o170000;
      if (
        entry.isDirectory ||
        !entry.rawEntryName.equals(Buffer.from(name, "utf8")) ||
        name.includes("/") ||
        name.includes("\\") ||
        name.includes("\0") ||
        unixType === 0o120000
      ) {
        errors.push(
          this.uploadError(
            `Archive entries must be regular files at the ZIP root: ${name}`,
          ),
        );
        continue;
      }
      if (!expected.has(name)) {
        errors.push(this.uploadError(`Unexpected archive file: ${name}`));
      } else if (seen.has(name)) {
        errors.push(this.uploadError(`Duplicate archive file: ${name}`));
      } else {
        seen.add(name);
      }
      if ((entry.header.flags & 1) !== 0) {
        errors.push(this.uploadError(`Encrypted file is not allowed: ${name}`));
      }
      totalSize += entry.header.size;
    }
    for (const name of MASTER_DATA_IMPORT_FILES) {
      if (!seen.has(name)) {
        errors.push(this.uploadError(`Missing archive file: ${name}`));
      }
    }
    if (entries.length !== MASTER_DATA_IMPORT_FILES.length) {
      errors.push(
        this.uploadError("Archive must contain exactly the nine CSV files"),
      );
    }
    if (totalSize > MAX_UNCOMPRESSED_BYTES) {
      errors.push(
        this.uploadError("Archive expands beyond the 50 MB safety limit"),
      );
    }
    if (errors.length > 0) return null;

    const buffers = {} as FileBuffers;
    for (const name of MASTER_DATA_IMPORT_FILES) {
      const entry = entries.find((candidate) => candidate.entryName === name)!;
      try {
        buffers[name] = entry.getData();
      } catch {
        errors.push(this.uploadError(`Unable to extract ${name}`));
      }
    }
    return errors.length === 0 ? buffers : null;
  }

  private decodeAndParse(
    buffers: FileBuffers,
    errors: MasterDataImportError[],
  ): ParsedFiles | null {
    const parsed = Object.fromEntries(
      MASTER_DATA_IMPORT_FILES.map((name) => [name, []]),
    ) as unknown as ParsedFiles;
    for (const name of MASTER_DATA_IMPORT_FILES) {
      const buffer = buffers[name];
      if (!buffer) continue;
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        errors.push({
          file: name,
          line: null,
          column: null,
          message: "File is not valid UTF-8",
        });
        continue;
      }
      parsed[name] = this.parseCsv(name, text, errors);
    }
    return errors.length === 0 ? parsed : null;
  }

  private parseCsv(
    file: ImportFile,
    text: string,
    errors: MasterDataImportError[],
  ): CsvRow[] {
    let records: Array<{ record: string[]; info: { lines: number } }>;
    try {
      records = parse(text, {
        bom: true,
        info: true,
        relax_column_count: false,
        skip_empty_lines: true,
      }) as unknown as Array<{
        record: string[];
        info: { lines: number };
      }>;
    } catch (error: unknown) {
      const csvError = error as { message?: string; lines?: number };
      errors.push({
        file,
        line: csvError.lines ?? null,
        column: null,
        message: `Invalid CSV: ${csvError.message ?? "parse error"}`,
      });
      return [];
    }
    if (records.length === 0) {
      errors.push({
        file,
        line: 1,
        column: null,
        message: "CSV header row is required",
      });
      return [];
    }
    const actual = records[0]!.record;
    const expected = HEADERS[file];
    if (
      actual.length !== expected.length ||
      actual.join("\0") !== expected.join("\0")
    ) {
      errors.push({
        file,
        line: 1,
        column: null,
        message: `Headers must exactly match: ${expected.join(",")}`,
      });
      return [];
    }
    return records.slice(1).map(({ record, info }) => ({
      file,
      line: info.lines,
      values: Object.fromEntries(
        expected.map((header, index) => [header, record[index]!.trim()]),
      ) as Record<CsvColumn, string>,
    }));
  }

  private validateRows(
    files: ParsedFiles,
    errors: MasterDataImportError[],
  ): void {
    for (const file of MASTER_DATA_IMPORT_FILES) {
      for (const row of files[file]) {
        for (const column of REQUIRED[file]) {
          if (!row.values[column]) {
            errors.push(this.rowError(row, column, "Value is required"));
          }
        }
        this.enumValue(row, "status", ENTITY_STATUSES, errors);
      }
    }

    for (const row of files["01_units.csv"]) {
      this.enumValue(row, "type", UNIT_TYPES, errors);
    }
    for (const row of files["06_products.csv"]) {
      this.enumValue(row, "product_type", PRODUCT_TYPES, errors);
    }
    for (const row of files["08_vendors.csv"]) {
      this.enumValue(row, "payment_terms", PAYMENT_TERMS, errors, true);
      for (const column of [
        "primary_email",
        "manager_email",
        "other_email",
        "salesperson_email",
      ] as const) {
        this.email(row, column, errors);
      }
      this.number(row, "sales_target", errors, { optional: true, min: 0 });
      this.number(row, "credit_limit", errors, { optional: true, min: 0 });
    }
    for (const row of files["07_product_skus.csv"]) {
      for (const column of [
    "cost_price",
    "selling_price",
    "selling_price_per_purchase_unit",
    "reorder_level",
        "minimum_stock_level",
      ] as const) {
        this.number(row, column, errors, { min: 0 });
      }
      this.number(row, "maximum_stock_level", errors, {
        optional: true,
        min: 0,
      });
      this.number(row, "units_per_purchase_unit", errors, {
        min: Number.EPSILON,
      });
      this.boolean(row, "track_inventory", errors);
    }
    for (const row of files["09_vendor_skus.csv"]) {
      this.number(row, "units_per_purchase_unit", errors, {
        min: Number.EPSILON,
      });
      this.number(row, "purchase_price", errors, { min: 0 });
      this.number(row, "minimum_order_quantity", errors, { min: 0 });
      this.number(row, "lead_time_days", errors, {
        min: 0,
        integer: true,
        max: 2_147_483_647,
      });
      this.boolean(row, "is_preferred", errors);
    }

    this.duplicates(files["01_units.csv"], ["abbreviation"], errors);
    this.duplicates(files["02_brands.csv"], ["name"], errors, true);
    this.duplicates(files["03_categories.csv"], ["name"], errors, true);
    this.duplicates(files["04_warehouses.csv"], ["code"], errors);
    this.duplicates(files["05_vendor_groups.csv"], ["name"], errors, true);
    this.duplicates(files["06_products.csv"], ["import_key"], errors);
    this.duplicates(files["07_product_skus.csv"], ["sku"], errors);
    this.duplicates(
      files["07_product_skus.csv"].filter((row) => row.values.barcode),
      ["barcode"],
      errors,
    );
    this.duplicates(files["08_vendors.csv"], ["vendor_code"], errors);
    this.duplicates(
      files["09_vendor_skus.csv"],
      ["vendor_code", "sku"],
      errors,
    );
  }

  private async validateReferencesAndImport(
    manager: EntityManager,
    files: ParsedFiles,
  ): Promise<FileCounts> {
    const tenantId = this.fixedTenant.tenantId;
    const [
      existingUnits,
      existingBrands,
      existingCategories,
      existingWarehouses,
      existingGroups,
      existingProducts,
      existingSkus,
      existingVendors,
      existingVendorSkus,
    ] = await Promise.all([
      manager.find(Unit, { where: { tenantId } }),
      manager.find(Brand, { where: { tenantId } }),
      manager.find(Category, { where: { tenantId } }),
      manager.find(Warehouse, { where: { tenantId } }),
      manager.find(VendorGroup, { where: { tenantId } }),
      manager.find(Product, { where: { tenantId } }),
      manager.find(ProductSku, { where: { tenantId } }),
      manager.find(Vendor, { where: { tenantId } }),
      manager.find(VendorSku, { where: { tenantId } }),
    ]);

    const errors: MasterDataImportError[] = [];
    const productByImportKey = new Map(
      existingProducts
        .filter((item) => item.importKey)
        .map((item) => [item.importKey!, item]),
    );
    const claimedProductIds = new Set(
      Array.from(productByImportKey.values(), (item) => item.id),
    );
    const incomingProductKeys = new Set([
      ...files["06_products.csv"].map((row) => row.values.import_key),
      ...files["07_product_skus.csv"].map(
        (row) => row.values.product_import_key,
      ),
    ]);
    for (const importKey of incomingProductKeys) {
      if (productByImportKey.has(importKey)) continue;
      const productIds = new Set(
        files["07_product_skus.csv"]
          .filter((row) => row.values.product_import_key === importKey)
          .map((row) => existingSkus.find((sku) => sku.sku === row.values.sku))
          .filter((sku): sku is ProductSku => Boolean(sku))
          .map((sku) => sku.productId),
      );
      if (productIds.size !== 1) continue;
      const productId = Array.from(productIds)[0]!;
      const candidate = existingProducts.find((item) => item.id === productId);
      if (
        candidate &&
        !candidate.importKey &&
        !claimedProductIds.has(candidate.id)
      ) {
        productByImportKey.set(importKey, candidate);
        claimedProductIds.add(candidate.id);
      }
    }
    const unitNames = new Set(existingUnits.map((item) => item.abbreviation));
    const brandNames = new Set(
      existingBrands.map((item) => normalizeStoredText(item.name)),
    );
    const categoryNames = new Set(
      existingCategories.map((item) => normalizeStoredText(item.name)),
    );
    const groupNames = new Set(
      existingGroups.map((item) => normalizeStoredText(item.name)),
    );
    const productKeys = new Set(productByImportKey.keys());
    const skuNames = new Set(existingSkus.map((item) => item.sku));
    const vendorCodes = new Set(existingVendors.map((item) => item.vendorCode));
    for (const row of files["01_units.csv"])
      unitNames.add(row.values.abbreviation);
    for (const row of files["02_brands.csv"])
      brandNames.add(normalizeStoredText(row.values.name));
    for (const row of files["03_categories.csv"])
      categoryNames.add(normalizeStoredText(row.values.name));
    for (const row of files["05_vendor_groups.csv"])
      groupNames.add(normalizeStoredText(row.values.name));
    for (const row of files["06_products.csv"])
      productKeys.add(row.values.import_key);
    for (const row of files["07_product_skus.csv"])
      skuNames.add(row.values.sku);
    for (const row of files["08_vendors.csv"])
      vendorCodes.add(row.values.vendor_code);

    for (const row of files["06_products.csv"]) {
      this.nameReference(row, "brand_name", brandNames, errors);
      this.nameReference(row, "category_name", categoryNames, errors);
    }
    for (const row of files["07_product_skus.csv"]) {
      this.reference(row, "product_import_key", productKeys, errors);
      this.reference(row, "base_unit_abbreviation", unitNames, errors, true);
      this.reference(
        row,
        "purchase_unit_abbreviation",
        unitNames,
        errors,
        true,
      );
      const existing = existingSkus.find(
        (candidate) => candidate.sku === row.values.sku,
      );
      const targetProduct = productByImportKey.get(
        row.values.product_import_key,
      );
      if (existing && existing.productId !== targetProduct?.id) {
        errors.push(
          this.rowError(
            row,
            "sku",
            "Existing SKU belongs to a different product and cannot be reassigned",
          ),
        );
      }
      if (row.values.barcode) {
        const barcodeOwner = existingSkus.find(
          (candidate) => candidate.barcode === row.values.barcode,
        );
        if (barcodeOwner && barcodeOwner.sku !== row.values.sku) {
          errors.push(
            this.rowError(
              row,
              "barcode",
              "Barcode is already assigned to another SKU",
            ),
          );
        }
      }
    }
    for (const row of files["08_vendors.csv"]) {
      this.nameReference(row, "group_name", groupNames, errors, true);
    }
    for (const row of files["09_vendor_skus.csv"]) {
      this.reference(row, "vendor_code", vendorCodes, errors);
      this.reference(row, "sku", skuNames, errors);
      this.reference(
        row,
        "purchase_unit_abbreviation",
        unitNames,
        errors,
        true,
      );
    }
    if (errors.length > 0) this.fail(errors);

    const counts = Object.fromEntries(
      MASTER_DATA_IMPORT_FILES.map((name) => [
        name,
        { created: 0, updated: 0 },
      ]),
    ) as FileCounts;

    const units = new Map(
      existingUnits.map((item) => [item.abbreviation, item]),
    );
    for (const row of files["01_units.csv"]) {
      const value = row.values;
      const item =
        units.get(value.abbreviation) ??
        manager.create(Unit, { tenantId, abbreviation: value.abbreviation });
      const created = !item.id;
      Object.assign(item, {
        name: normalizeStoredText(value.name),
        type: value.type,
        status: value.status,
      });
      const saved = await manager.save(item);
      units.set(saved.abbreviation, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }

    const brands = await this.upsertNamed(
      manager,
      Brand,
      existingBrands,
      files["02_brands.csv"],
      counts,
      tenantId,
    );
    const categories = await this.upsertNamed(
      manager,
      Category,
      existingCategories,
      files["03_categories.csv"],
      counts,
      tenantId,
    );
    const groups = await this.upsertNamed(
      manager,
      VendorGroup,
      existingGroups,
      files["05_vendor_groups.csv"],
      counts,
      tenantId,
    );

    const warehouses = new Map(
      existingWarehouses.map((item) => [item.code, item]),
    );
    for (const row of files["04_warehouses.csv"]) {
      const value = row.values;
      const item =
        warehouses.get(value.code) ??
        manager.create(Warehouse, { tenantId, code: value.code });
      const created = !item.id;
      Object.assign(item, {
        name: normalizeStoredText(value.name),
        location: value.location || null,
        status: value.status,
      });
      const saved = await manager.save(item);
      warehouses.set(saved.code, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }

    for (const [importKey, product] of productByImportKey) {
      if (!product.importKey) {
        product.importKey = importKey;
        await manager.save(product);
      }
    }

    const newProductCount = files["06_products.csv"].filter(
      (row) => !productByImportKey.has(row.values.import_key),
    ).length;
    const productCodes = await this.nextProductCodes(
      manager,
      tenantId,
      newProductCount,
    );
    let productCodeIndex = 0;
    const products = productByImportKey;
    for (const row of files["06_products.csv"]) {
      const value = row.values;
      const item =
        products.get(value.import_key) ??
        manager.create(Product, {
          tenantId,
          importKey: value.import_key,
          productCode: productCodes[productCodeIndex++]!,
          imagePath: null,
        });
      const created = !item.id;
      Object.assign(item, {
        importKey: value.import_key,
        name: normalizeStoredText(value.name),
        brandId: brands.get(value.brand_name.toLowerCase())!.id,
        categoryId: categories.get(value.category_name.toLowerCase())!.id,
        productType: value.product_type,
        description: normalizeOptionalStoredText(value.description),
        status: value.status,
      });
      const saved = await manager.save(item);
      products.set(value.import_key, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }

    const skus = new Map(existingSkus.map((item) => [item.sku, item]));
    for (const row of files["07_product_skus.csv"]) {
      const value = row.values;
      const item =
        skus.get(value.sku) ??
        manager.create(ProductSku, {
          tenantId,
          sku: value.sku,
        });
      const created = !item.id;
      Object.assign(item, {
        productId: products.get(value.product_import_key)!.id,
        barcode: value.barcode || null,
        variantName: normalizeStoredText(value.variant_name),
        sizeValue: value.size_value || null,
        sizeUnit: value.size_unit || null,
        baseUnitId: value.base_unit_abbreviation
          ? units.get(value.base_unit_abbreviation)!.id
          : null,
        purchaseUnitId: value.purchase_unit_abbreviation
          ? units.get(value.purchase_unit_abbreviation)!.id
          : null,
        unitsPerPurchaseUnit: value.units_per_purchase_unit,
        costPrice: value.cost_price,
        sellingPrice: value.selling_price,
        sellingPricePerPurchaseUnit: value.selling_price_per_purchase_unit || null,
        reorderLevel: value.reorder_level,
        minimumStockLevel: value.minimum_stock_level,
        maximumStockLevel: value.maximum_stock_level || null,
        trackInventory: value.track_inventory === "true",
        status: value.status,
      });
      const saved = await manager.save(item);
      skus.set(saved.sku, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }

    const vendors = new Map(
      existingVendors.map((item) => [item.vendorCode, item]),
    );
    for (const row of files["08_vendors.csv"]) {
      const value = row.values;
      const item =
        vendors.get(value.vendor_code) ??
        manager.create(Vendor, { tenantId, vendorCode: value.vendor_code });
      const created = !item.id;
      Object.assign(item, {
        name: normalizeStoredText(value.name),
        groupId: value.group_name
          ? groups.get(value.group_name.toLowerCase())!.id
          : null,
        address: value.address || null,
        city: value.city || null,
        state: value.state || null,
        country: value.country || null,
        postalCode: value.postal_code || null,
        salesTarget: value.sales_target || null,
        creditLimit: value.credit_limit || null,
        paymentTerms: value.payment_terms || null,
        taxNumber: value.tax_number || null,
        notes: value.notes,
        status: value.status,
      });
      const saved = await manager.save(item);
      await manager.delete(VendorContact, { tenantId, vendorId: saved.id });
      for (const contactType of [
        "PRIMARY",
        "MANAGER",
        "OTHER",
        "SALESPERSON",
      ] as const) {
        const prefix = contactType.toLowerCase();
        const name = value[`${prefix}_name` as CsvColumn];
        const phone = value[`${prefix}_phone` as CsvColumn];
        const email = value[`${prefix}_email` as CsvColumn];
        if (name || phone || email) {
          await manager.save(
            manager.create(VendorContact, {
              tenantId,
              vendorId: saved.id,
              contactType,
              name: name ? normalizeStoredText(name) : null,
              phone: phone || null,
              email: email || null,
            }),
          );
        }
      }
      vendors.set(saved.vendorCode, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }

    const vendorSkuByKey = new Map(
      existingVendorSkus.map((item) => [
        `${item.vendorId}\0${item.productSkuId}`,
        item,
      ]),
    );
    for (const row of files["09_vendor_skus.csv"]) {
      const value = row.values;
      const vendor = vendors.get(value.vendor_code)!;
      const sku = skus.get(value.sku)!;
      const key = `${vendor.id}\0${sku.id}`;
      const item =
        vendorSkuByKey.get(key) ??
        manager.create(VendorSku, {
          tenantId,
          vendorId: vendor.id,
          productSkuId: sku.id,
        });
      const created = !item.id;
      Object.assign(item, {
        vendorSkuCode: value.vendor_sku_code || null,
        purchaseUnitId: value.purchase_unit_abbreviation
          ? units.get(value.purchase_unit_abbreviation)!.id
          : null,
        unitsPerPurchaseUnit: value.units_per_purchase_unit,
        purchasePrice: value.purchase_price,
        minimumOrderQuantity: value.minimum_order_quantity,
        leadTimeDays: Number(value.lead_time_days),
        isPreferred: value.is_preferred === "true",
        notes: value.notes,
        status: value.status,
      });
      const saved = await manager.save(item);
      vendorSkuByKey.set(key, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }
    return counts;
  }

  private async upsertNamed<T extends Brand | Category | VendorGroup>(
    manager: EntityManager,
    entity: new () => T,
    existing: T[],
    rows: CsvRow[],
    counts: FileCounts,
    tenantId: string,
  ): Promise<Map<string, T>> {
    const items = new Map(
      existing.map((item) => [item.name.toLowerCase(), item]),
    );
    for (const row of rows) {
      const value = row.values;
      const key = value.name.toLowerCase();
      const item = items.get(key) ?? manager.create(entity);
      item.tenantId = tenantId;
      const created = !item.id;
      Object.assign(item, {
        name: normalizeStoredText(value.name),
        description: normalizeOptionalStoredText(value.description),
        status: value.status,
      });
      const saved = await manager.save(entity, item);
      items.set(key, saved);
      counts[row.file][created ? "created" : "updated"]++;
    }
    return items;
  }

  private async nextProductCodes(
    manager: EntityManager,
    tenantId: string,
    count: number,
  ): Promise<string[]> {
    const year = new Date().getFullYear();
    const prefix = `PRD-${year}-`;
    const latest = await manager
      .createQueryBuilder(Product, "product")
      .where("product.tenant_id = :tenantId", { tenantId })
      .andWhere("product.product_code LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("product.product_code", "DESC")
      .getOne();
    const parsed = latest ? Number(latest.productCode.slice(prefix.length)) : 0;
    const start = Number.isSafeInteger(parsed) ? parsed + 1 : 1;
    return Array.from(
      { length: count },
      (_, index) => `${prefix}${String(start + index).padStart(6, "0")}`,
    );
  }

  private duplicates(
    rows: CsvRow[],
    columns: CsvColumn[],
    errors: MasterDataImportError[],
    caseInsensitive = false,
  ): void {
    const seen = new Map<string, CsvRow>();
    for (const row of rows) {
      let key = columns.map((column) => row.values[column]).join("\0");
      if (caseInsensitive) key = key.toLowerCase();
      const prior = seen.get(key);
      if (prior) {
        errors.push(
          this.rowError(
            row,
            columns.join("+"),
            `Duplicate upload key (first used on line ${prior.line})`,
          ),
        );
      } else {
        seen.set(key, row);
      }
    }
  }

  private nameReference(
    row: CsvRow,
    column: CsvColumn,
    values: Set<string>,
    errors: MasterDataImportError[],
    optional = false,
  ): void {
    const value = row.values[column];
    if (optional && !value) return;
    if (!values.has(normalizeStoredText(value))) {
      errors.push(this.rowError(row, column, `Reference not found: ${value}`));
    }
  }

  private reference(
    row: CsvRow,
    column: CsvColumn,
    values: Set<string>,
    errors: MasterDataImportError[],
    optional = false,
  ): void {
    const value = row.values[column];
    if (optional && !value) return;
    if (!values.has(value)) {
      errors.push(this.rowError(row, column, `Reference not found: ${value}`));
    }
  }

  private enumValue(
    row: CsvRow,
    column: CsvColumn,
    allowed: readonly string[],
    errors: MasterDataImportError[],
    optional = false,
  ): void {
    const value = row.values[column];
    if ((optional && !value) || !value) return;
    if (!allowed.includes(value)) {
      errors.push(
        this.rowError(row, column, `Must be one of: ${allowed.join(", ")}`),
      );
    }
  }

  private number(
    row: CsvRow,
    column: CsvColumn,
    errors: MasterDataImportError[],
    options: {
      optional?: boolean;
      min: number;
      max?: number;
      integer?: boolean;
    },
  ): void {
    const value = row.values[column];
    if (!value) return;
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
      errors.push(this.rowError(row, column, "Must be a valid number"));
      return;
    }
    const parsed = Number(value);
    const unsigned = value.replace(/^-/, "");
    const [integerPart = "", fractionPart = ""] = unsigned.split(".");
    const integerDigits = integerPart.replace(/^0+/, "").length;
    if (
      !Number.isFinite(parsed) ||
      parsed < options.min ||
      (options.max != null && parsed > options.max) ||
      (options.integer && !Number.isInteger(parsed)) ||
      (!options.integer && (integerDigits > 10 || fractionPart.length > 4))
    ) {
      errors.push(
        this.rowError(
          row,
          column,
          options.integer
            ? `Must be an integer from ${options.min} to ${options.max}`
            : "Must fit a non-negative numeric(14,4) value",
        ),
      );
    }
  }

  private boolean(
    row: CsvRow,
    column: CsvColumn,
    errors: MasterDataImportError[],
  ): void {
    const value = row.values[column];
    if (value && !["true", "false"].includes(value)) {
      errors.push(this.rowError(row, column, "Must be true or false"));
    }
  }

  private email(
    row: CsvRow,
    column: CsvColumn,
    errors: MasterDataImportError[],
  ): void {
    const value = row.values[column];
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(this.rowError(row, column, "Must be a valid email address"));
    }
  }

  private rowError(
    row: CsvRow,
    column: string,
    message: string,
  ): MasterDataImportError {
    return { file: row.file, line: row.line, column, message };
  }

  private uploadError(message: string): MasterDataImportError {
    return { file: "archive", line: null, column: null, message };
  }

  private baseName(name: string): string {
    return name.split(/[\\/]/).pop() ?? name;
  }

  private fail(errors: MasterDataImportError[]): never {
    throw new UnprocessableEntityException({
      message: "Master-data import validation failed",
      errors,
    });
  }
}
