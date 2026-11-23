import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  businessDayEndUtc,
  businessDayStartUtc,
  type ActivityLogItem,
  type CreateActivityLogRequest,
  type PaginatedActivityLogs,
} from "@blackbox/shared";
import { randomUUID } from "node:crypto";
import { In, Repository } from "typeorm";
import { getRequestTenant } from "../common/request-tenant";
import type { TenantContext } from "../common/tenant-context";
import { ActivityLog, User } from "../db/entities";
import type { CreateActivityLogDto, ListActivityLogsQueryDto } from "./dto/activity-log.dto";

function pageParams(page?: number, pageSize?: number) {
  const resolvedPage = Math.max(1, page ?? 1);
  const resolvedPageSize = Math.min(100, Math.max(1, pageSize ?? 25));
  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    offset: (resolvedPage - 1) * resolvedPageSize,
  };
}

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly logs: Repository<ActivityLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async list(query: ListActivityLogsQueryDto): Promise<PaginatedActivityLogs> {
    const tenantId = getRequestTenant()?.tenantId;
    if (!tenantId) return { items: [], total: 0, page: 1, pageSize: 25 };

    const { page, pageSize, offset } = pageParams(query.page, query.pageSize);
    const idQb = this.logs
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId });

    if (query.eventType) {
      idQb.andWhere("log.event_type = :eventType", { eventType: query.eventType });
    }
    if (query.dateFrom) {
      idQb.andWhere("log.created_at >= :dateFrom", {
        dateFrom: businessDayStartUtc(query.dateFrom),
      });
    }
    if (query.dateTo) {
      idQb.andWhere("log.created_at <= :dateTo", {
        dateTo: businessDayEndUtc(query.dateTo),
      });
    }

    const total = await idQb.getCount();
    const idRows = await idQb
      .clone()
      .select("log.id", "id")
      .orderBy("log.created_at", "DESC")
      .addOrderBy("log.id", "ASC")
      .offset(offset)
      .limit(pageSize)
      .getRawMany<Record<string, unknown>>();
    const ids = idRows
      .map((row) => {
        const value = row.id ?? row.log_id;
        return typeof value === "string" ? value : "";
      })
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const rows = await this.logs.find({
      where: { id: In(ids), tenantId },
      relations: { actorUser: true, supervisorUser: true, subjectUser: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      items: ids
        .map((id) => byId.get(id))
        .filter((row): row is ActivityLog => row != null)
        .map((row) => this.toItem(row)),
      total,
      page,
      pageSize,
    };
  }

  async create(
    user: TenantContext,
    dto: CreateActivityLogDto,
  ): Promise<ActivityLogItem> {
    const isSelf = dto.actorUserId === user.userId;
    const canManage = user.permissions.includes("till.manage");
    const isDelegatedSupervisorAction =
      dto.supervisorUserId != null &&
      dto.supervisorUserId === dto.actorUserId &&
      dto.subjectUserId === user.userId;

    if (!isSelf && !canManage && !isDelegatedSupervisorAction) {
      throw new ForbiddenException("Cannot log activity for another user");
    }
    return this.insertLog(user.tenantId, dto, dto.id);
  }

  async logFromContext(input: {
    tenantId: string;
    eventType: CreateActivityLogRequest["eventType"];
    actorUserId: string;
    supervisorUserId?: string | null;
    subjectUserId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.insertLog(input.tenantId, input);
  }

  private async insertLog(
    tenantId: string,
    dto: CreateActivityLogRequest,
    id?: string,
  ): Promise<ActivityLogItem> {
    const logId = id ?? dto.id ?? randomUUID();

    if (id ?? dto.id) {
      const existing = await this.logs.findOne({
        where: { id: logId, tenantId },
        relations: { actorUser: true, supervisorUser: true, subjectUser: true },
      });
      if (existing) return this.toItem(existing);
    }

    const row = this.logs.create({
      id: logId,
      tenantId,
      eventType: dto.eventType,
      actorUserId: dto.actorUserId,
      supervisorUserId: dto.supervisorUserId ?? null,
      subjectUserId: dto.subjectUserId ?? null,
      summary: dto.summary.trim(),
      metadata: dto.metadata ?? {},
    });
  // #region agent log
    fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "52d579",
      },
      body: JSON.stringify({
        sessionId: "52d579",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "activity-log.service.ts:insertLog",
        message: "activity log insert attempt",
        data: { eventType: dto.eventType, tenantId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      await this.logs.save(row);
      // #region agent log
      fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "52d579",
        },
        body: JSON.stringify({
          sessionId: "52d579",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "activity-log.service.ts:insertLog",
          message: "activity log insert ok",
          data: { eventType: dto.eventType, logId: row.id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (error: unknown) {
      const pgCode =
        error &&
        typeof error === "object" &&
        "driverError" in error &&
        error.driverError &&
        typeof error.driverError === "object" &&
        "code" in error.driverError
          ? String((error.driverError as { code?: string }).code)
          : null;
      // #region agent log
      fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "52d579",
        },
        body: JSON.stringify({
          sessionId: "52d579",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "activity-log.service.ts:insertLog",
          message: "activity log insert failed",
          data: { eventType: dto.eventType, pgCode },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw error;
    }
    const saved = await this.logs.findOne({
      where: { id: row.id, tenantId },
      relations: { actorUser: true, supervisorUser: true, subjectUser: true },
    });
    return this.toItem(saved ?? row);
  }

  private toItem(row: ActivityLog): ActivityLogItem {
    return {
      id: row.id,
      eventType: row.eventType as ActivityLogItem["eventType"],
      actorUserId: row.actorUserId,
      actorName: row.actorUser?.fullName?.trim() || "—",
      supervisorUserId: row.supervisorUserId,
      supervisorName: row.supervisorUser?.fullName?.trim() || null,
      subjectUserId: row.subjectUserId,
      subjectName: row.subjectUser?.fullName?.trim() || null,
      summary: row.summary,
      metadata: row.metadata ?? {},
      createdAt: row.createdAt.toISOString(),
    };
  }
}
