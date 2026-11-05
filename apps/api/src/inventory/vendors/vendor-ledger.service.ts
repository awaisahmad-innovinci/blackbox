import {
  BadRequestException,
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
} from "@blackbox/shared";
import { roundMoney4 } from "@blackbox/shared";
import { Repository } from "typeorm";
import { Vendor, VendorLedgerEntry as VendorLedgerEntryEntity } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { RecordVendorPaymentDto } from "./dto/record-vendor-payment.dto";
import {
  ListVendorCreditsQueryDto,
  ListVendorPaymentsQueryDto,
} from "./dto/vendor.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

@Injectable()
export class VendorLedgerService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Vendor)
    private readonly vendors: Repository<Vendor>,
    @InjectRepository(VendorLedgerEntryEntity)
    private readonly entries: Repository<VendorLedgerEntryEntity>,
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
          credit: roundMoney4(charges - payments),
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
        "(v.name ILIKE :search OR e.note ILIKE :search OR coalesce(e.receipt_number, '') ILIKE :search)",
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
        note: string | null;
        occurredAt: Date | string;
      }>();
    const items: VendorPaymentListItem[] = rows.map((row) => ({
      id: row.id,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      amount: toNum(row.amount),
      receiptNumber: row.receiptNumber,
      note: row.note ?? "",
      occurredAt:
        row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : new Date(row.occurredAt).toISOString(),
    }));
    return { items, total, page, pageSize };
  }

  async getLedger(vendorId: string): Promise<VendorLedger> {
    await this.requireVendor(vendorId);
    return this.load(vendorId);
  }

  async recordPayment(
    vendorId: string,
    dto: RecordVendorPaymentDto,
  ): Promise<VendorLedger> {
    await this.requireVendor(vendorId);
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
    const now = new Date();
    await this.entries.save(
      this.entries.create({
        tenantId: this.fixedTenant.tenantId,
        vendorId,
        entryType: "PAYMENT",
        amount: String(amount),
        goodsReceiptId: null,
        receiptNumber: null,
        note: dto.note?.trim() ?? "",
        occurredAt: now,
      }),
    );
    return this.load(vendorId);
  }

  private async requireVendor(vendorId: string): Promise<void> {
    const vendor = await this.vendors.findOne({
      where: { id: vendorId, tenantId: this.fixedTenant.tenantId },
    });
    if (!vendor) throw new NotFoundException("Vendor not found");
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
      note: row.note ?? "",
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    const credit = roundMoney4(
      entries.reduce(
        (sum, entry) =>
          sum + (entry.entryType === "CHARGE" ? entry.amount : -entry.amount),
        0,
      ),
    );
    return { credit, entries };
  }
}
