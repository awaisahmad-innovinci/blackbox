import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  OpenTillRequest,
  ReopenTillRequest,
  TillListItem,
  TillNoteCounts,
  TillSessionDetail,
  WithdrawTillRequest,
} from "@blackbox/shared";
import {
  computeTillDenominationTotal,
  TILL_CLOSE_REASON_CASHIER_CLOSED,
  tillMaxLimit,
  validateTillOpeningBalance,
  validateTillOpeningBalanceAmount,
} from "@blackbox/shared";
import { randomUUID } from "node:crypto";
import { EntityManager, Repository } from "typeorm";
import { getRequestTenant } from "../common/request-tenant";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { Tenant, TillSession, TillWithdrawal, User } from "../db/entities";
import type { ListTillsQueryDto, CollectTillCashByAmountDto, OpenTillDto, ReopenTillDto, WithdrawTillDto } from "./dto/till.dto";

const ACTIVE_STATUSES = ["PENDING_APPROVAL", "OPEN", "CLOSED_LIMIT"] as const;

function toNum(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function notesFromDto(dto: TillNoteCounts): Pick<
  TillSession,
  "note10" | "note20" | "note50" | "note100" | "note500" | "note1000" | "note5000"
> {
  return {
    note10: dto.note10,
    note20: dto.note20,
    note50: dto.note50,
    note100: dto.note100,
    note500: dto.note500,
    note1000: dto.note1000,
    note5000: dto.note5000,
  };
}

function notesFromRow(row: TillSession): TillNoteCounts {
  return {
    note10: row.note10,
    note20: row.note20,
    note50: row.note50,
    note100: row.note100,
    note500: row.note500,
    note1000: row.note1000,
    note5000: row.note5000,
  };
}

@Injectable()
export class TillsService {
  constructor(
    @InjectRepository(TillSession)
    private readonly sessions: Repository<TillSession>,
    @InjectRepository(TillWithdrawal)
    private readonly withdrawals: Repository<TillWithdrawal>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly activityLog: ActivityLogService,
  ) {}

  async getCurrent(): Promise<TillSessionDetail | null> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) return null;
    const row = await this.findActiveSession(ctx.tenantId, ctx.userId);
    if (!row) return null;
    return this.toDetail(row);
  }

  async list(query: ListTillsQueryDto): Promise<TillListItem[]> {
    const tenantId = getRequestTenant()?.tenantId;
    if (!tenantId) return [];

    const qb = this.sessions
      .createQueryBuilder("t")
      .leftJoinAndSelect("t.user", "user")
      .where("t.tenant_id = :tenantId", { tenantId })
      .orderBy("t.opened_at", "DESC", "NULLS LAST")
      .addOrderBy("t.created_at", "DESC");

    if (query.status) {
      qb.andWhere("t.status = :status", { status: query.status });
    }
    if (query.userId) {
      qb.andWhere("t.user_id = :userId", { userId: query.userId });
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.toListItem(row));
  }

  async open(dto: OpenTillDto): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const validationError = validateTillOpeningBalanceAmount(dto.openingBalance);
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    const existing = await this.findActiveSession(ctx.tenantId, ctx.userId);
    if (existing) {
      throw new BadRequestException("You already have an active till session");
    }

    const latest = await this.sessions.findOne({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      order: { createdAt: "DESC" },
    });
    if (latest?.status === "CLOSED") {
      throw new BadRequestException("Contact a manager to reopen your till");
    }

    const tenant = await this.tenants.findOne({ where: { id: ctx.tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    const openingBalance = round4(dto.openingBalance);
    const openingTotal = openingBalance;
    const maxLimit = round4(tillMaxLimit(openingBalance));
    const now = new Date();

    const requireApproval = tenant.requireManagerApprovalTillOpen;
    const approvedNow =
      !requireApproval || dto.supervisorApproved === true;
    if (requireApproval && !dto.supervisorApproved) {
      const row = this.sessions.create({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        status: "PENDING_APPROVAL",
        ...notesFromDto(dto),
        openingTotal: String(openingTotal),
        openingBalance: String(openingBalance),
        currentCashBalance: String(openingBalance),
        maxCashLimit: String(maxLimit),
        openedAt: now,
      });
      await this.sessions.save(row);
      return this.toDetail(await this.loadSession(row.id, ctx.tenantId));
    }

    const row = this.sessions.create({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      status: "OPEN",
      ...notesFromDto(dto),
      openingTotal: String(openingTotal),
      openingBalance: String(openingBalance),
      currentCashBalance: String(openingBalance),
      maxCashLimit: String(maxLimit),
      openedAt: now,
      approvedAt: approvedNow ? now : null,
      approvedByUserId: approvedNow ? ctx.userId : null,
    });
    await this.sessions.save(row);
    const detail = await this.loadSession(row.id, ctx.tenantId);
    const cashierName =
      detail.user?.fullName?.trim() || detail.user?.username || "cashier";
    let authenticatorName = cashierName;
    if (requireApproval && dto.supervisorUserId) {
      const supervisorUser = await this.users.findOne({
        where: { id: dto.supervisorUserId, tenantId: ctx.tenantId },
      });
      authenticatorName =
        supervisorUser?.fullName?.trim() ||
        supervisorUser?.username ||
        "Manager";
    }
    await this.activityLog.logFromContext({
      tenantId: ctx.tenantId,
      eventType: "till.opened",
      actorUserId: requireApproval && dto.supervisorUserId ? dto.supervisorUserId : ctx.userId,
      supervisorUserId: requireApproval ? dto.supervisorUserId ?? null : null,
      subjectUserId: ctx.userId,
      summary: `${authenticatorName} opened ${cashierName}'s till with opening balance Rs ${openingBalance.toLocaleString()}`,
      metadata: {
        tillSessionId: row.id,
        openingBalance,
      },
    });
    return this.toDetail(detail);
  }

  async approve(id: string): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const row = await this.loadSession(id, ctx.tenantId);
    if (row.status !== "PENDING_APPROVAL") {
      throw new BadRequestException("Till session is not pending approval");
    }

    row.status = "OPEN";
    row.approvedAt = new Date();
    row.approvedByUserId = ctx.userId;
    await this.sessions.save(row);
    const detail = await this.loadSession(id, ctx.tenantId);
    const approvedOpeningBalance = round4(toNum(row.openingBalance));
    const managerUser = await this.users.findOne({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
    });
    const managerName =
      managerUser?.fullName?.trim() || managerUser?.username || "Manager";
    const cashierName =
      detail.user?.fullName?.trim() || detail.user?.username || "cashier";
    await this.activityLog.logFromContext({
      tenantId: ctx.tenantId,
      eventType: "till.opened",
      actorUserId: ctx.userId,
      supervisorUserId: ctx.userId,
      subjectUserId: row.userId,
      summary: `${managerName} opened ${cashierName}'s till with opening balance Rs ${approvedOpeningBalance.toLocaleString()}`,
      metadata: {
        tillSessionId: row.id,
        openingBalance: approvedOpeningBalance,
      },
    });
    return this.toDetail(detail);
  }

  async collectCash(
    id: string,
    dto: WithdrawTillDto,
  ): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const row = await this.loadSession(id, ctx.tenantId);
    if (row.status !== "OPEN" && row.status !== "CLOSED_LIMIT") {
      throw new BadRequestException(
        "Till must be open or at cash limit to collect cash",
      );
    }

    const withdrawalTotal = computeTillDenominationTotal(dto);
    if (withdrawalTotal <= 0) {
      throw new BadRequestException("Enter at least one note count to collect");
    }

    const detail = await this.loadSession(id, ctx.tenantId);
    return this.applyPartialCashCollection({
      tenantId: ctx.tenantId,
      row,
      withdrawalTotal: round4(withdrawalTotal),
      withdrawnByUserId: ctx.userId,
      notes: notesFromDto(dto),
      actorUserId: ctx.userId,
      supervisorUserId: dto.supervisorUserId ?? ctx.userId,
      subjectUserId: row.userId,
      summary: `Collected Rs ${round4(withdrawalTotal).toLocaleString()} from ${detail.user?.fullName?.trim() || "cashier"} till`,
    });
  }

  async collectCashByAmount(
    dto: CollectTillCashByAmountDto,
  ): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const row = await this.findActiveSession(ctx.tenantId, ctx.userId);
    if (!row) {
      throw new BadRequestException("No active till session");
    }
    if (row.status !== "OPEN" && row.status !== "CLOSED_LIMIT") {
      throw new BadRequestException(
        "Till must be open or at cash limit to collect cash",
      );
    }
    if (row.userId !== ctx.userId) {
      throw new ForbiddenException("You can only collect from your own till");
    }

    const amount = round4(dto.amount);
    const currentBalance = round4(toNum(row.currentCashBalance));
    if (amount <= 0) {
      throw new BadRequestException("Enter a valid cash received amount");
    }
    if (amount > currentBalance) {
      throw new BadRequestException(
        "Collection amount exceeds current till cash balance",
      );
    }

    const withdrawnByUserId = dto.supervisorUserId ?? ctx.userId;
    const supervisorUser = await this.users.findOne({
      where: { id: withdrawnByUserId, tenantId: ctx.tenantId },
    });
    const supervisorName =
      supervisorUser?.fullName?.trim() ||
      supervisorUser?.username ||
      "Manager";
    const cashierName =
      row.user?.fullName?.trim() || row.user?.username || "cashier";
    return this.applyPartialCashCollection({
      tenantId: ctx.tenantId,
      row,
      withdrawalTotal: amount,
      withdrawnByUserId,
      notes: {
        note10: 0,
        note20: 0,
        note50: 0,
        note100: 0,
        note500: 0,
        note1000: 0,
        note5000: 0,
      },
      actorUserId: withdrawnByUserId,
      supervisorUserId: dto.supervisorUserId ?? withdrawnByUserId,
      subjectUserId: row.userId,
      summary: `${supervisorName} received Rs ${amount.toLocaleString()} cash from ${cashierName}'s till`,
    });
  }

  async closeCurrent(): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const row = await this.findActiveSession(ctx.tenantId, ctx.userId);
    if (!row) {
      throw new BadRequestException("No active till session");
    }
    if (row.status !== "OPEN") {
      throw new BadRequestException("Till must be open to close");
    }
    if (row.userId !== ctx.userId) {
      throw new ForbiddenException("You can only close your own till");
    }

    const now = new Date();
    const currentBalance = round4(toNum(row.currentCashBalance));
    row.status = "CLOSED";
    row.closedAt = now;
    row.closeReason = TILL_CLOSE_REASON_CASHIER_CLOSED;
    await this.sessions.save(row);

    const detail = await this.loadSession(row.id, ctx.tenantId);
    const userName =
      detail.user?.fullName?.trim() || detail.user?.username || "Cashier";
    const closedAtLabel = now.toLocaleString();
    await this.activityLog.logFromContext({
      tenantId: ctx.tenantId,
      eventType: "till.closed",
      actorUserId: ctx.userId,
      subjectUserId: ctx.userId,
      summary: `${userName} closed till on ${closedAtLabel} — current cash Rs ${currentBalance.toLocaleString()}`,
      metadata: {
        tillSessionId: row.id,
        currentCashBalance: currentBalance,
        closeReason: TILL_CLOSE_REASON_CASHIER_CLOSED,
      },
    });
    return this.toDetail(detail);
  }

  async withdraw(id: string, dto: WithdrawTillDto): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const row = await this.loadSession(id, ctx.tenantId);
    if (row.status !== "CLOSED_LIMIT") {
      throw new BadRequestException("Till must be at cash limit before withdrawal");
    }

    const withdrawalTotal = computeTillDenominationTotal(dto);
    if (withdrawalTotal <= 0) {
      throw new BadRequestException("Enter at least one note count to withdraw");
    }

    const currentBalance = toNum(row.currentCashBalance);
    if (round4(withdrawalTotal) > round4(currentBalance)) {
      throw new BadRequestException(
        "Withdrawal total exceeds current till cash balance",
      );
    }

    await this.withdrawals.save(
      this.withdrawals.create({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        tillSessionId: row.id,
        withdrawnByUserId: ctx.userId,
        ...notesFromDto(dto),
        withdrawalTotal: String(round4(withdrawalTotal)),
        kind: "full",
      }),
    );

    row.status = "CLOSED";
    row.closedAt = new Date();
    row.closeReason = "WITHDRAWN";
    await this.sessions.save(row);

    const detail = await this.loadSession(id, ctx.tenantId);
    await this.activityLog.logFromContext({
      tenantId: ctx.tenantId,
      eventType: "till.withdrawn_full",
      actorUserId: ctx.userId,
      supervisorUserId: dto.supervisorUserId ?? ctx.userId,
      subjectUserId: row.userId,
      summary: `Withdrew Rs ${round4(withdrawalTotal).toLocaleString()} from ${detail.user?.fullName?.trim() || "cashier"} till`,
      metadata: {
        tillSessionId: row.id,
        amount: round4(withdrawalTotal),
      },
    });
    return this.toDetail(detail);
  }

  async reopen(id: string, dto: ReopenTillDto): Promise<TillSessionDetail> {
    const ctx = getRequestTenant();
    if (!ctx?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const previous = await this.loadSession(id, ctx.tenantId);
    if (previous.status !== "CLOSED") {
      throw new BadRequestException("Till must be closed before reopening");
    }

    const notesTotal = computeTillDenominationTotal(dto);
    const amountOnly = notesTotal <= 0;
    if (amountOnly) {
      const amountError = validateTillOpeningBalanceAmount(dto.openingBalance);
      if (amountError) {
        throw new BadRequestException(amountError);
      }
    } else {
      const denomError = validateTillOpeningBalance(dto, dto.openingBalance);
      if (denomError) {
        throw new BadRequestException(denomError);
      }
    }

    const active = await this.findActiveSession(ctx.tenantId, previous.userId);
    if (active) {
      throw new BadRequestException("Cashier already has an active till session");
    }

    const openingBalance = round4(dto.openingBalance);
    const openingTotal = amountOnly ? openingBalance : round4(notesTotal);
    const maxLimit = round4(tillMaxLimit(openingBalance));
    const now = new Date();
    const supervisorId = dto.supervisorUserId ?? ctx.userId;
    const supervisorUser = await this.users.findOne({
      where: { id: supervisorId, tenantId: ctx.tenantId },
    });
    const supervisorName =
      supervisorUser?.fullName?.trim() ||
      supervisorUser?.username ||
      "Manager";
    const cashierName =
      previous.user?.fullName?.trim() || previous.user?.username || "cashier";

    const row = this.sessions.create({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      userId: previous.userId,
      status: "OPEN",
      ...(amountOnly
        ? {
            note10: 0,
            note20: 0,
            note50: 0,
            note100: 0,
            note500: 0,
            note1000: 0,
            note5000: 0,
          }
        : notesFromDto(dto)),
      openingTotal: String(openingTotal),
      openingBalance: String(openingBalance),
      currentCashBalance: String(openingBalance),
      maxCashLimit: String(maxLimit),
      openedAt: now,
      approvedAt: now,
      approvedByUserId: supervisorId,
      reopenedByUserId: supervisorId,
    });
    await this.sessions.save(row);
    const detail = await this.loadSession(row.id, ctx.tenantId);
    await this.activityLog.logFromContext({
      tenantId: ctx.tenantId,
      eventType: "till.reopened",
      actorUserId: supervisorId,
      supervisorUserId: supervisorId,
      subjectUserId: previous.userId,
      summary: `${supervisorName} opened ${cashierName}'s till with opening balance Rs ${openingBalance.toLocaleString()}`,
      metadata: {
        tillSessionId: row.id,
        openingBalance,
      },
    });
    return this.toDetail(detail);
  }

  async assertCanPostSale(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    permissions: string[],
    cashPaymentTotal: number,
  ): Promise<void> {
    if (permissions.includes("till.manage")) return;

    const row = await manager.getRepository(TillSession).findOne({
      where: { tenantId, userId, status: "OPEN" },
    });
    if (!row) {
      const pending = await manager.getRepository(TillSession).findOne({
        where: { tenantId, userId, status: "PENDING_APPROVAL" },
      });
      if (pending) {
        throw new ForbiddenException("Till is pending manager approval");
      }
      const limited = await manager.getRepository(TillSession).findOne({
        where: { tenantId, userId, status: "CLOSED_LIMIT" },
      });
      if (limited) {
        throw new ForbiddenException(
          "Till cash limit reached. Contact a manager to withdraw and reopen.",
        );
      }
      throw new ForbiddenException("Open your till before posting sales");
    }

    if (cashPaymentTotal <= 0) return;

    const nextBalance = round4(toNum(row.currentCashBalance) + cashPaymentTotal);
    if (nextBalance > round4(toNum(row.maxCashLimit))) {
      throw new BadRequestException(
        "This sale would exceed the till cash limit. Contact a manager.",
      );
    }
  }

  async applyCashFromSale(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    permissions: string[],
    cashPaymentTotal: number,
  ): Promise<void> {
    if (permissions.includes("till.manage") || cashPaymentTotal <= 0) return;

    const row = await manager.getRepository(TillSession).findOne({
      where: { tenantId, userId, status: "OPEN" },
      relations: { user: true },
    });
    if (!row) return;

    const nextBalance = round4(toNum(row.currentCashBalance) + cashPaymentTotal);
    row.currentCashBalance = String(nextBalance);
    const hitLimit = nextBalance >= round4(toNum(row.maxCashLimit));
    if (hitLimit) {
      row.status = "CLOSED_LIMIT";
      row.closedAt = new Date();
      row.closeReason = "LIMIT_REACHED";
    }
    await manager.save(row);

    if (hitLimit) {
      await this.activityLog.logFromContext({
        tenantId,
        eventType: "till.limit_reached",
        actorUserId: userId,
        subjectUserId: userId,
        summary: `Till cash limit reached for ${row.user?.fullName?.trim() || "cashier"}`,
        metadata: {
          tillSessionId: row.id,
          currentCashBalance: nextBalance,
          maxCashLimit: round4(toNum(row.maxCashLimit)),
        },
      });
    }
  }

  private async applyPartialCashCollection(input: {
    tenantId: string;
    row: TillSession;
    withdrawalTotal: number;
    withdrawnByUserId: string;
    notes: Pick<
      TillSession,
      | "note10"
      | "note20"
      | "note50"
      | "note100"
      | "note500"
      | "note1000"
      | "note5000"
    >;
    actorUserId: string;
    supervisorUserId: string | null;
    subjectUserId: string;
    summary: string;
  }): Promise<TillSessionDetail> {
    const currentBalance = round4(toNum(input.row.currentCashBalance));
    if (input.withdrawalTotal > currentBalance) {
      throw new BadRequestException(
        "Collection total exceeds current till cash balance",
      );
    }

    await this.withdrawals.save(
      this.withdrawals.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        tillSessionId: input.row.id,
        withdrawnByUserId: input.withdrawnByUserId,
        ...input.notes,
        withdrawalTotal: String(input.withdrawalTotal),
        kind: "partial",
      }),
    );

    const nextBalance = round4(currentBalance - input.withdrawalTotal);
    input.row.currentCashBalance = String(nextBalance);
    if (
      input.row.status === "CLOSED_LIMIT" &&
      nextBalance < round4(toNum(input.row.maxCashLimit))
    ) {
      input.row.status = "OPEN";
      input.row.closedAt = null;
      input.row.closeReason = null;
    }
    await this.sessions.save(input.row);

    const detail = await this.loadSession(input.row.id, input.tenantId);
    await this.activityLog.logFromContext({
      tenantId: input.tenantId,
      eventType: "till.cash_collected",
      actorUserId: input.actorUserId,
      supervisorUserId: input.supervisorUserId,
      subjectUserId: input.subjectUserId,
      summary: input.summary,
      metadata: {
        tillSessionId: input.row.id,
        amount: input.withdrawalTotal,
        remainingBalance: nextBalance,
      },
    });
    return this.toDetail(detail);
  }

  private async findActiveSession(
    tenantId: string,
    userId: string,
  ): Promise<TillSession | null> {
    return this.sessions.findOne({
      where: ACTIVE_STATUSES.map((status) => ({ tenantId, userId, status })),
      relations: { user: true, approvedByUser: true, reopenedByUser: true },
      order: { openedAt: "DESC", createdAt: "DESC" },
    });
  }

  private async loadSession(id: string, tenantId: string): Promise<TillSession> {
    const row = await this.sessions.findOne({
      where: { id, tenantId },
      relations: { user: true, approvedByUser: true, reopenedByUser: true },
    });
    if (!row) throw new NotFoundException("Till session not found");
    return row;
  }

  private toDetail(row: TillSession): TillSessionDetail {
    return {
      ...notesFromRow(row),
      id: row.id,
      userId: row.userId,
      userName: row.user?.fullName?.trim() || "—",
      status: row.status as TillSessionDetail["status"],
      openingTotal: toNum(row.openingTotal),
      openingBalance: toNum(row.openingBalance),
      currentCashBalance: toNum(row.currentCashBalance),
      maxCashLimit: toNum(row.maxCashLimit),
      openedAt: row.openedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      approvedByUserId: row.approvedByUserId,
      approvedByName: row.approvedByUser?.fullName?.trim() || null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      reopenedByUserId: row.reopenedByUserId,
      reopenedByName: row.reopenedByUser?.fullName?.trim() || null,
      closeReason: row.closeReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toListItem(row: TillSession): TillListItem {
    return {
      id: row.id,
      userId: row.userId,
      userName: row.user?.fullName?.trim() || "—",
      status: row.status as TillListItem["status"],
      openingBalance: toNum(row.openingBalance),
      currentCashBalance: toNum(row.currentCashBalance),
      maxCashLimit: toNum(row.maxCashLimit),
      openedAt: row.openedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  }
}
