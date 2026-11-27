import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  PaginatedVendorPayments,
  VendorCreditLedger,
  VendorCreditSummary,
  VendorLedger,
  VendorLedgerEntry,
  VendorPaymentListItem,
  VendorPaymentMethod,
} from "@blackbox/shared";
import {
  expenseExceedsDrawer,
  expenseOverDrawerMessage,
  formatMoney,
  roundMoney4,
} from "@blackbox/shared";
import { DataSource, Repository } from "typeorm";
import { ActivityLogService } from "../../activity-log/activity-log.service";
import type { TenantContext } from "../../common/tenant-context";
import { CashFlowService } from "../../cash-flow/cash-flow.service";
import {
  CashExpense,
  User,
  Vendor,
  VendorLedgerEntry as VendorLedgerEntryEntity,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { RecordVendorPaymentDto } from "./dto/record-vendor-payment.dto";
import {
  ListVendorCreditsQueryDto,
  ListVendorPaymentsQueryDto,
} from "./dto/vendor.dto";

function paymentMethodOf(value: string | null | undefined): VendorPaymentMethod | null {
  return value === "CASH" || value === "BANK" ? value : null;
}

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

@Injectable()
export class VendorLedgerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fixedTenant: FixedTenantContext,
    private readonly cashFlow: CashFlowService,
    private readonly activityLog: ActivityLogService,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(VendorLedgerEntryEntity)
    private readonly entries: Repository<VendorLedgerEntryEntity>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async listCredits(
    query: ListVendorCreditsQueryDto,
  ): Promise<VendorCreditLedger> {
    const qb = this.entries
      .createQueryBuilder("e")
      .innerJoin(Vendor, "v", "v.id = e.vendor_id AND v.tenant_id = e.tenant_id")
      .where("e.tenant_id = :tenantId", { tenantId: this.fixedTenant.tenantId });
    if (query.vendorId) {
      qb.andWhere("e.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    const rows = await qb
      .select("v.id", "vendorId")
      .addSelect("v.name", "vendorName")
      .addSelect(
        "coalesce(sum(case when e.entry_type = 'CHARGE' then e.amount else 0 end), 0)",
        "charges",
      )
      .addSelect(
        "coalesce(sum(case when e.entry_type = 'PAYMENT' then e.amount else 0 end), 0)",
        "payments",
      )
      .groupBy("v.id")
      .addGroupBy("v.name")
      .getRawMany<{
        vendorId: string;
        vendorName: string;
        charges: string;
        payments: string;
      }>();
    const vendors: VendorCreditSummary[] = rows
      .map((row) => {
        const charges = roundMoney4(toNum(row.charges));
        const payments = roundMoney4(toNum(row.payments));
        return {
          vendorId: row.vendorId,
          vendorName: row.vendorName,
          charges,
          payments,
          credit: roundMoney4(Math.max(0, charges - payments)),
        };
      })
      .sort((a, b) => b.credit - a.credit || a.vendorName.localeCompare(b.vendorName));
    const totalCredit = roundMoney4(
      vendors.reduce((sum, row) => sum + row.credit, 0),
    );
    return { totalCredit, vendors };
  }

  async listPayments(
    query: ListVendorPaymentsQueryDto,
  ): Promise<PaginatedVendorPayments> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const qb = this.entries
      .createQueryBuilder("e")
      .innerJoin(Vendor, "v", "v.id = e.vendor_id AND v.tenant_id = e.tenant_id")
      .where("e.tenant_id = :tenantId", { tenantId: this.fixedTenant.tenantId })
      .andWhere("e.entry_type = :entryType", { entryType: "PAYMENT" });
    if (query.vendorId) {
      qb.andWhere("e.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        "(v.name ILIKE :search OR e.note ILIKE :search OR coalesce(e.receipt_number, '') ILIKE :search OR coalesce(e.reference_number, '') ILIKE :search)",
        { search: `%${search}%` },
      );
    }
    const total = await qb.getCount();
    const rows = await qb
      .select("e.id", "id")
      .addSelect("e.vendor_id", "vendorId")
      .addSelect("v.name", "vendorName")
      .addSelect("e.amount", "amount")
      .addSelect("e.receipt_number", "receiptNumber")
      .addSelect("e.payment_method", "paymentMethod")
      .addSelect("e.reference_number", "referenceNumber")
      .addSelect("e.note", "note")
      .addSelect("e.occurred_at", "occurredAt")
      .orderBy("e.occurred_at", "DESC")
      .addOrderBy("e.created_at", "DESC")
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany<{
        id: string;
        vendorId: string;
        vendorName: string;
        amount: string;
        receiptNumber: string | null;
        paymentMethod: string | null;
        referenceNumber: string | null;
        note: string | null;
        occurredAt: Date | string;
      }>();
    const items: VendorPaymentListItem[] = rows.map((row) => ({
      id: row.id,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      amount: toNum(row.amount),
      receiptNumber: row.receiptNumber,
      paymentMethod: paymentMethodOf(row.paymentMethod),
      referenceNumber: row.referenceNumber,
      note: row.note ?? "",
      occurredAt:
        row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : new Date(row.occurredAt).toISOString(),
    }));
    return { items, total, page, pageSize };
  }

  async getLedger(vendorId: string): Promise<VendorLedger> {
    // #region agent log
    fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "9ce663",
      },
      body: JSON.stringify({
        sessionId: "9ce663",
        hypothesisId: "B",
        location: "vendor-ledger.service.ts:getLedger",
        message: "getLedger entry",
        data: {
          vendorId,
          fixedTenantId: this.fixedTenant.tenantId,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => undefined);
    // #endregion
    await this.requireVendor(vendorId);
    return this.load(vendorId);
  }

  async recordPayment(
    user: TenantContext,
    vendorId: string,
    dto: RecordVendorPaymentDto,
  ): Promise<VendorLedger> {
    if (
      !user.permissions.includes("web.access") &&
      !user.permissions.includes("till.manage")
    ) {
      throw new ForbiddenException(
        "Only an owner or a manager can record a vendor payment",
      );
    }
    const vendor = await this.requireVendor(vendorId);
    const method = dto.method;
    if (method !== "CASH" && method !== "BANK") {
      throw new BadRequestException("Choose cash or bank transfer");
    }
    const referenceNumber =
      method === "BANK" ? dto.referenceNumber?.trim() ?? "" : "";
    if (method === "BANK" && !referenceNumber) {
      throw new BadRequestException("Enter the transaction id");
    }
    const amount = roundMoney4(Number(dto.amount));
    if (!(amount > 0)) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }
    const current = await this.load(vendorId);
    if (amount > current.credit) {
      throw new BadRequestException(
        `Payment cannot exceed vendor credit (${current.credit})`,
      );
    }
    const owner = user.permissions.includes("web.access");
    if (method === "CASH") {
      const available = owner
        ? await this.cashFlow.ownerCashBalance(user.tenantId, user.userId)
        : (
            await this.cashFlow.drawerBalances(
              user.tenantId,
              user.userId,
              "",
              false,
            )
          ).find((row) => row.managerUserId === user.userId)?.balance ?? 0;
      if (expenseExceedsDrawer(amount, available)) {
        throw new BadRequestException(expenseOverDrawerMessage(available));
      }
    }
    const payer = await this.users.findOne({
      where: { id: user.userId, tenantId: user.tenantId },
    });
    const payerName = payer?.fullName?.trim() || payer?.username || "User";
    const now = new Date();
    const entryId = randomUUID();
    const expenseId = method === "CASH" ? randomUUID() : null;
    const note = dto.note?.trim() ?? "";
    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(VendorLedgerEntryEntity, {
          id: entryId,
          tenantId: user.tenantId,
          vendorId,
          entryType: "PAYMENT",
          amount: String(amount),
          goodsReceiptId: null,
          receiptNumber: null,
          paymentMethod: method,
          referenceNumber: referenceNumber || null,
          note,
          occurredAt: now,
        }),
      );
      if (expenseId) {
        await manager.save(
          manager.create(CashExpense, {
            id: expenseId,
            tenantId: user.tenantId,
            recordedByUserId: user.userId,
            recordedByName: payerName,
            category: "Vendor payment",
            amount: String(amount),
            note: note || `Vendor payment to ${vendor.name}`,
            occurredAt: now,
          }),
        );
      }
    });
    const methodLabel = method === "BANK" ? "bank transfer" : "cash";
    const reference =
      method === "BANK" ? ` (ref ${referenceNumber})` : "";
    try {
      await this.activityLog.logFromContext({
        tenantId: user.tenantId,
        eventType: "vendor.paid",
        actorUserId: user.userId,
        summary: `${payerName} paid Rs ${formatMoney(amount)} by ${methodLabel} to ${vendor.name}${reference}`,
        metadata: {
          vendorId,
          entryId,
          expenseId,
          amount,
          method,
          referenceNumber: referenceNumber || null,
        },
      });
    } catch {
      /* the payment is already saved */
    }
    return this.load(vendorId);
  }

  private async requireVendor(vendorId: string): Promise<Vendor> {
    const vendor = await this.vendors.findOne({
      where: { id: vendorId, tenantId: this.fixedTenant.tenantId },
    });
    if (!vendor) throw new NotFoundException("Vendor not found");
    return vendor;
  }

  private async load(vendorId: string): Promise<VendorLedger> {
    const rows = await this.entries.find({
      where: { tenantId: this.fixedTenant.tenantId, vendorId },
      order: { occurredAt: "DESC", createdAt: "DESC" },
    });
    const entries: VendorLedgerEntry[] = rows.map((row) => ({
      id: row.id,
      vendorId: row.vendorId,
      entryType: row.entryType === "PAYMENT" ? "PAYMENT" : "CHARGE",
      amount: toNum(row.amount),
      goodsReceiptId: row.goodsReceiptId,
      receiptNumber: row.receiptNumber,
      paymentMethod: paymentMethodOf(row.paymentMethod),
      referenceNumber: row.referenceNumber,
      note: row.note ?? "",
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    const credit = roundMoney4(
      Math.max(
        0,
        entries.reduce(
          (sum, entry) =>
            sum + (entry.entryType === "CHARGE" ? entry.amount : -entry.amount),
          0,
        ),
      ),
    );
    return { credit, entries };
  }
}
