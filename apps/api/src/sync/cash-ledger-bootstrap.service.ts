import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYNC_CASH_LEDGER_SECTIONS,
  SYNC_CATALOG_PAGE_SIZE,
  type SyncCashLedgerBootstrapItem,
  type SyncCashLedgerBootstrapPage,
  type SyncCashLedgerSection,
  type SyncEntityType,
} from "@blackbox/shared";
import { Repository } from "typeorm";
import type { TenantContext } from "../common/tenant-context";
import {
  CashExpense,
  ManagerDrawerOpening,
  ManagerDrawerSubmission,
  OwnerCashEntry,
  TillSession,
  TillWithdrawal,
  User,
} from "../db/entities";
import { SyncService } from "./sync.service";

function pageArgs(pageRaw?: string, pageSizeRaw?: string) {
  const parsedPage = Number(pageRaw);
  const parsedSize = Number(pageSizeRaw);
  const page =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const pageSize =
    Number.isFinite(parsedSize) && parsedSize >= 1
      ? Math.min(Math.floor(parsedSize), 500)
      : SYNC_CATALOG_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function userDisplay(user: User | null | undefined): string {
  if (!user) return "";
  return user.fullName?.trim() || user.username?.trim() || "";
}

@Injectable()
export class CashLedgerBootstrapService {
  constructor(
    private readonly sync: SyncService,
    @InjectRepository(OwnerCashEntry)
    private readonly ownerCash: Repository<OwnerCashEntry>,
    @InjectRepository(ManagerDrawerOpening)
    private readonly openings: Repository<ManagerDrawerOpening>,
    @InjectRepository(ManagerDrawerSubmission)
    private readonly submissions: Repository<ManagerDrawerSubmission>,
    @InjectRepository(CashExpense)
    private readonly expenses: Repository<CashExpense>,
    @InjectRepository(TillSession)
    private readonly tillSessions: Repository<TillSession>,
    @InjectRepository(TillWithdrawal)
    private readonly tillWithdrawals: Repository<TillWithdrawal>,
  ) {}

  async page(
    user: TenantContext,
    sectionRaw: string,
    pageRaw?: string,
    pageSizeRaw?: string,
  ): Promise<SyncCashLedgerBootstrapPage> {
    await this.sync.assertCanSync(user);
    if (
      !SYNC_CASH_LEDGER_SECTIONS.includes(sectionRaw as SyncCashLedgerSection)
    ) {
      throw new BadRequestException("Unknown cash ledger section");
    }
    const section = sectionRaw as SyncCashLedgerSection;
    const tenantId = user.tenantId;
    const { page, pageSize, skip } = pageArgs(pageRaw, pageSizeRaw);

    let items: SyncCashLedgerBootstrapItem[] = [];
    let total = 0;

    switch (section) {
      case "owner_cash": {
        total = await this.ownerCash.count({ where: { tenantId } });
        const rows = await this.ownerCash.find({
          where: { tenantId },
          order: { recordedAt: "ASC" },
          skip,
          take: pageSize,
        });
        items = rows.map((row) => ({
          entityType: "owner_cash_entry" as SyncEntityType,
          entityId: row.id,
          payload: {
            recordedByUserId: row.recordedByUserId,
            recordedByName: row.recordedByName,
            amount: Number(row.amount),
            note: row.note,
            recordedAt: iso(row.recordedAt),
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
          },
        }));
        break;
      }
      case "manager_drawer_openings": {
        total = await this.openings.count({ where: { tenantId } });
        const rows = await this.openings.find({
          where: { tenantId },
          order: { openedAt: "ASC" },
          skip,
          take: pageSize,
        });
        items = rows.map((row) => ({
          entityType: "manager_drawer_opening" as SyncEntityType,
          entityId: row.id,
          payload: {
            managerUserId: row.managerUserId,
            managerName: row.managerName,
            amount: Number(row.amount),
            openedByUserId: row.openedByUserId,
            openedByName: row.openedByName,
            openedAt: iso(row.openedAt),
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
          },
        }));
        break;
      }
      case "manager_drawer_submissions": {
        total = await this.submissions.count({ where: { tenantId } });
        const rows = await this.submissions.find({
          where: { tenantId },
          order: { submittedAt: "ASC" },
          skip,
          take: pageSize,
        });
        items = rows.map((row) => ({
          entityType: "manager_drawer_submission" as SyncEntityType,
          entityId: row.id,
          payload: {
            managerUserId: row.managerUserId,
            managerName: row.managerName,
            amount: Number(row.amount),
            submittedAt: iso(row.submittedAt),
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
          },
        }));
        break;
      }
      case "cash_expenses": {
        total = await this.expenses.count({ where: { tenantId } });
        const rows = await this.expenses.find({
          where: { tenantId },
          order: { occurredAt: "ASC" },
          skip,
          take: pageSize,
        });
        items = rows.map((row) => ({
          entityType: "cash_expense" as SyncEntityType,
          entityId: row.id,
          payload: {
            recordedByUserId: row.recordedByUserId,
            recordedByName: row.recordedByName,
            category: row.category,
            amount: Number(row.amount),
            note: row.note,
            occurredAt: iso(row.occurredAt),
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
          },
        }));
        break;
      }
      case "till_sessions": {
        total = await this.tillSessions.count({ where: { tenantId } });
        const rows = await this.tillSessions.find({
          where: { tenantId },
          relations: {
            user: true,
            approvedByUser: true,
            reopenedByUser: true,
          },
          order: { openedAt: "ASC", createdAt: "ASC" },
          skip,
          take: pageSize,
        });
        items = rows.map((row) => ({
          entityType: "till_session" as SyncEntityType,
          entityId: row.id,
          payload: {
            userId: row.userId,
            userName: userDisplay(row.user),
            tillName: row.tillName,
            status: row.status,
            note10: row.note10,
            note20: row.note20,
            note50: row.note50,
            note100: row.note100,
            note500: row.note500,
            note1000: row.note1000,
            note5000: row.note5000,
            openingTotal: Number(row.openingTotal),
            openingBalance: Number(row.openingBalance),
            currentCashBalance: Number(row.currentCashBalance),
            maxCashLimit: Number(row.maxCashLimit),
            openedAt: iso(row.openedAt),
            closedAt: iso(row.closedAt),
            approvedByUserId: row.approvedByUserId,
            approvedByName: userDisplay(row.approvedByUser),
            approvedAt: iso(row.approvedAt),
            reopenedByUserId: row.reopenedByUserId,
            reopenedByName: userDisplay(row.reopenedByUser),
            closeReason: row.closeReason,
            fundedByUserId: row.fundedByUserId,
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
          },
        }));
        break;
      }
      case "till_withdrawals": {
        total = await this.tillWithdrawals.count({ where: { tenantId } });
        const rows = await this.tillWithdrawals.find({
          where: { tenantId },
          relations: { withdrawnByUser: true },
          order: { createdAt: "ASC" },
          skip,
          take: pageSize,
        });
        items = rows.map((row) => ({
          entityType: "till_withdrawal" as SyncEntityType,
          entityId: row.id,
          payload: {
            tillSessionId: row.tillSessionId,
            withdrawnByUserId: row.withdrawnByUserId,
            withdrawnByName: userDisplay(row.withdrawnByUser),
            note10: row.note10,
            note20: row.note20,
            note50: row.note50,
            note100: row.note100,
            note500: row.note500,
            note1000: row.note1000,
            note5000: row.note5000,
            withdrawalTotal: Number(row.withdrawalTotal),
            kind: row.kind,
            createdAt: iso(row.createdAt),
          },
        }));
        break;
      }
    }

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }
}