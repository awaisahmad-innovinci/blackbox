import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DEFAULT_FBR_SCENARIO_ID,
  DEFAULT_SALE_CUSTOMER_NAME,
  FBR_PRODUCTION_POST_URL,
  FBR_SANDBOX_BUYER_NAME,
  FBR_SANDBOX_BUYER_NTN,
  FBR_SANDBOX_POST_URL,
  FBR_STANDARD_SALE_TYPE,
  FBR_UOM_NUMBERS,
  splitInclusiveGst,
  type SaleDetail,
} from "@blackbox/shared";
import { Repository } from "typeorm";
import { getRequestTenant, requestTenantAls } from "../common/request-tenant";
import { ProductSku, Sale, SaleLine, Tenant } from "../db/entities";
import { SalesService } from "../sales/sales.service";
import { SyncService } from "../sync/sync.service";

type FbrItemStatus = {
  statusCode?: string;
  status?: string;
  error?: string;
  errorCode?: string;
};

type FbrPostResponse = {
  invoiceNumber?: string;
  validationResponse?: {
    statusCode?: string;
    status?: string;
    error?: string;
    errorCode?: string;
    invoiceStatuses?: FbrItemStatus[] | null;
  };
};

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatRate(percent: number): string {
  const rounded = Math.round(percent * 10000) / 10000;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)}%`;
}

function invoiceDateKarachi(iso: Date | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(iso ?? new Date());
}

function clip(value: string, max = 500): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

@Injectable()
export class FbrService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleLine) private readonly saleLines: Repository<SaleLine>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(ProductSku) private readonly skus: Repository<ProductSku>,
    private readonly sync: SyncService,
    @Inject(forwardRef(() => SalesService))
    private readonly salesService: SalesService,
  ) {}

  async submitSale(
    saleId: string,
    incoming?: Record<string, unknown>,
  ): Promise<SaleDetail> {
    const tenantId = getRequestTenant()?.tenantId;
    if (!tenantId) {
      throw new BadRequestException("Tenant is required");
    }

    let sale = await this.sales.findOne({
      where: { id: saleId, tenantId },
    });
    // #region agent log
    fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"c77da1"},body:JSON.stringify({sessionId:"c77da1",hypothesisId:"A",location:"fbr.service.ts:submitSale",message:"fbr lookup before upsert",data:{saleId,tenantId,found:Boolean(sale),hasIncoming:Boolean(incoming&&Object.keys(incoming).length>0),incomingSaleNumber:incoming?.saleNumber??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!sale && incoming && Object.keys(incoming).length > 0) {
      await this.sync.upsertPostedSale(tenantId, saleId, incoming);
      sale = await this.sales.findOne({
        where: { id: saleId, tenantId },
      });
    }
    if (!sale) throw new NotFoundException("Sale not found");
    if (sale.status !== "POSTED") {
      throw new BadRequestException("Only a posted sale can be sent to FBR");
    }
    if (sale.fbrStatus === "submitted" && sale.fbrInvoiceNumber) {
      return this.salesService.getById(saleId);
    }
    if (sale.fbrStatus === "excluded") {
      return this.salesService.getById(saleId);
    }

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    if (!tenant.fbrEnabled) {
      return this.salesService.getById(saleId);
    }

    const configError = this.configError(tenant);
    if (configError) {
      await this.markFailed(sale, configError, tenant.fbrSellerNtn);
      return this.publishAndLoad(saleId);
    }

    const lines = await this.saleLines.find({
      where: { saleId, tenantId },
      relations: { productSku: { product: true } },
      order: { createdAt: "ASC" },
    });
    const lineError = await this.snapshotHsCodes(tenantId, lines);
    if (lineError) {
      await this.markFailed(sale, lineError, tenant.fbrSellerNtn);
      return this.publishAndLoad(saleId);
    }

    const payload = this.buildPayload(sale, lines, tenant);
    try {
      const invoiceNumber = await this.postInvoice(
        tenant.fbrEnvironment === "production"
          ? FBR_PRODUCTION_POST_URL
          : FBR_SANDBOX_POST_URL,
        tenant.fbrToken!.trim(),
        payload,
      );
      await this.saveSale(sale, {
        fbrInvoiceNumber: invoiceNumber,
        fbrStatus: "submitted",
        fbrError: null,
        fbrSubmittedAt: new Date(),
        fbrSellerNtn: tenant.fbrSellerNtn,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "FBR rejected the invoice";
      await this.markFailed(sale, clip(message), tenant.fbrSellerNtn);
    }

    return this.publishAndLoad(saleId);
  }

  private configError(tenant: Tenant): string | null {
    if (!tenant.fbrToken?.trim()) {
      return "FBR is not configured. Add the sandbox token in Settings.";
    }
    if (!tenant.fbrSellerNtn?.trim()) {
      return "Seller NTN is required before an FBR invoice can be issued.";
    }
    if (!tenant.fbrSellerProvince?.trim()) {
      return "Seller province is required before an FBR invoice can be issued.";
    }
    if (!tenant.fbrSellerAddress?.trim()) {
      return "Seller address is required before an FBR invoice can be issued.";
    }
    return null;
  }

  private async snapshotHsCodes(
    tenantId: string,
    lines: SaleLine[],
  ): Promise<string | null> {
    const missing: string[] = [];
    for (const line of lines) {
      if (line.hsCode?.trim()) continue;
      const sku =
        line.productSku ??
        (await this.skus.findOne({
          where: { id: line.productSkuId, tenantId },
        }));
      const hsCode = sku?.hsCode?.trim() || null;
      if (!hsCode) {
        missing.push(sku?.sku || line.productSkuId);
        continue;
      }
      line.hsCode = hsCode;
      await this.saleLines.update({ id: line.id, tenantId }, { hsCode });
    }
    if (missing.length === 0) return null;
    return `Add an HS code before FBR can invoice: ${missing.join(", ")}`;
  }

  private buildPayload(
    sale: Sale,
    lines: SaleLine[],
    tenant: Tenant,
  ): Record<string, unknown> {
    const sandbox = tenant.fbrEnvironment !== "production";
    const customerName = sale.customerName?.trim() || DEFAULT_SALE_CUSTOMER_NAME;
    const sellerProvince = tenant.fbrSellerProvince!.trim();
    const sellerAddress = tenant.fbrSellerAddress!.trim();

    const items = lines.map((line) => {
      const inclusive = Number(line.lineTotal ?? 0);
      const split = splitInclusiveGst(inclusive, Number(line.gstPercent ?? 0));
      const valueSalesExcludingST = money(split.exGst);
      const salesTaxApplicable = money(split.gstAmount);
      const paidQty = Number(line.quantity ?? 0);
      const focQty = Number(line.focQuantity ?? 0);
      const quantity = paidQty > 0 ? paidQty : focQty;
      const productName = line.productSku?.product?.name?.trim() || "";
      const variant = line.productSku?.variantName?.trim() || "";
      const description =
        [productName, variant].filter(Boolean).join(" ") ||
        line.productSku?.sku ||
        "Item";
      return {
        hsCode: line.hsCode,
        productDescription: clip(description, 150),
        rate: formatRate(Number(line.gstPercent ?? 0)),
        uoM: FBR_UOM_NUMBERS,
        quantity,
        totalValues: money(valueSalesExcludingST + salesTaxApplicable),
        valueSalesExcludingST,
        fixedNotifiedValueOrRetailPrice: 0,
        salesTaxApplicable,
        salesTaxWithheldAtSource: 0,
        extraTax: 0,
        furtherTax: 0,
        sroScheduleNo: "",
        fedPayable: 0,
        discount: 0,
        saleType: FBR_STANDARD_SALE_TYPE,
        sroItemSerialNo: "",
      };
    });

    return {
      invoiceType: "Sale Invoice",
      invoiceDate: invoiceDateKarachi(sale.postedAt),
      sellerNTNCNIC: tenant.fbrSellerNtn!.trim(),
      sellerBusinessName: tenant.name,
      sellerProvince,
      sellerAddress,
      buyerNTNCNIC: sandbox ? FBR_SANDBOX_BUYER_NTN : "",
      buyerBusinessName: sandbox ? FBR_SANDBOX_BUYER_NAME : customerName,
      buyerProvince: sellerProvince,
      buyerAddress: sellerAddress,
      buyerRegistrationType: "Unregistered",
      invoiceRefNo: "",
      ...(sandbox
        ? { scenarioId: tenant.fbrScenarioId?.trim() || DEFAULT_FBR_SCENARIO_ID }
        : {}),
      items,
    };
  }

  private async postInvoice(
    url: string,
    token: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error: unknown) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (timedOut) throw new Error("FBR did not respond in time");
      const message = error instanceof Error ? error.message : "network error";
      throw new Error(`Could not reach FBR (${message})`);
    }

    const text = await response.text();
    let body: FbrPostResponse = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text) as FbrPostResponse;
      } catch {
        throw new Error(
          response.ok
            ? "FBR returned a response that was not JSON"
            : `FBR request failed (${response.status})`,
        );
      }
    }

    const validation = body.validationResponse;
    const headerOk =
      validation?.statusCode === "00" &&
      validation.status?.toLowerCase() === "valid";
    const itemError = (validation?.invoiceStatuses ?? []).find(
      (item) => item.status?.toLowerCase() !== "valid",
    );
    const invoiceNumber = body.invoiceNumber?.trim() ?? "";
    if (response.ok && headerOk && !itemError && invoiceNumber) {
      return invoiceNumber;
    }

    const detail =
      itemError?.error ||
      validation?.error ||
      (text.trim() ? text.trim().slice(0, 400) : `FBR request failed (${response.status})`);
    throw new Error(detail);
  }

  private async markFailed(
    sale: Sale,
    message: string,
    sellerNtn: string | null,
  ): Promise<void> {
    await this.saveSale(sale, {
      fbrStatus: "failed",
      fbrError: clip(message),
      fbrSubmittedAt: new Date(),
      fbrSellerNtn: sellerNtn,
    });
  }

  private async saveSale(
    sale: Sale,
    fields: Partial<
      Pick<
        Sale,
        | "fbrInvoiceNumber"
        | "fbrStatus"
        | "fbrError"
        | "fbrSubmittedAt"
        | "fbrSellerNtn"
      >
    >,
  ): Promise<void> {
    Object.assign(sale, fields);
    const current = getRequestTenant();
    if (!current) {
      await this.sales.save(sale);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      requestTenantAls.run({ ...current, skipSyncPublish: true }, () => {
        this.sales.save(sale).then(() => resolve(), reject);
      });
    });
  }

  private async publishAndLoad(saleId: string): Promise<SaleDetail> {
    const detail = await this.salesService.getById(saleId);
    await this.sync.publishFromRest({
      entityType: "sale",
      entityId: saleId,
      operation: "UPSERT",
      payload: { ...detail } as Record<string, unknown>,
    });
    return detail;
  }
}
