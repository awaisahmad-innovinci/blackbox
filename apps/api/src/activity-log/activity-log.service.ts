import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  ActivityLogItem,
  CreateActivityLogRequest,
  PaginatedActivityLogs,
} from "@blackbox/shared";
import { randomUUID } from "node:crypto";
import { Repository } from "typeorm";
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
    const qb = this.logs
      .createQueryBuilder("log")
      .leftJoinAndSelect("log.actorUser", "actor")
      .leftJoinAndSelect("log.supervisorUser", "supervisor")
      .leftJoinAndSelect("log.subjectUser", "subject")
      .where("log.tenant_id = :tenantId", { tenantId })
      .orderBy("log.created_at", "DESC");

    if (query.eventType) {
      qb.andWhere("log.event_type = :eventType", { eventType: query.eventType });
    }
    if (query.dateFrom) {
      qb.andWhere("log.created_at >= :dateFrom", {
        dateFrom: `${query.dateFrom}T00:00:00.000Z`,
      });
    }
    if (query.dateTo) {
      qb.andWhere("log.created_at <= :dateTo", {
        dateTo: `${query.dateTo}T23:59:59.999Z`,
      });
    }

    const total = await qb.getCount();
    const rows = await qb.skip(offset).take(pageSize).getMany();
    return {
      items: rows.map((row) => this.toItem(row)),
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
    await this.logs.save(row);
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
