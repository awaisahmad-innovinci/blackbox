import { Type } from "class-transformer";
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import {
  ACTIVITY_LOG_EVENT_TYPES,
  type ActivityLogEventType,
} from "@blackbox/shared";

export class CreateActivityLogDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn([...ACTIVITY_LOG_EVENT_TYPES])
  eventType!: ActivityLogEventType;

  @IsUUID()
  actorUserId!: string;

  @IsOptional()
  @IsUUID()
  supervisorUserId?: string | null;

  @IsOptional()
  @IsUUID()
  subjectUserId?: string | null;

  @IsString()
  @MinLength(1)
  summary!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListActivityLogsQueryDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn([...ACTIVITY_LOG_EVENT_TYPES])
  eventType?: ActivityLogEventType;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}
