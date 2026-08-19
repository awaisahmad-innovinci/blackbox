import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  SYNC_OPERATIONS,
  SYNC_PUSH_BATCH_SIZE,
  SYNC_STREAMS,
  type SyncOperation,
  type SyncStream,
} from "@blackbox/shared";

export class SyncChangeInputDto {
  @IsUUID()
  changeId!: string;

  @IsString()
  @MinLength(1)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsIn(SYNC_OPERATIONS)
  operation!: SyncOperation;

  @IsInt()
  @Min(0)
  baseEntityVersion!: number;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncPushDto {
  @IsIn(SYNC_STREAMS)
  stream!: SyncStream;

  @IsArray()
  @ArrayMaxSize(SYNC_PUSH_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => SyncChangeInputDto)
  changes!: SyncChangeInputDto[];
}

export class SyncConflictAckDto {
  @IsUUID()
  conflictId!: string;

  @IsIn(["accepted_local", "accepted_cloud", "merged"])
  resolution!: "accepted_local" | "accepted_cloud" | "merged";
}
