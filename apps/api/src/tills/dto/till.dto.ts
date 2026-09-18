import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import type { TillStatus } from "@blackbox/shared";

export class TillNoteCountsDto {
  @IsInt()
  @Min(0)
  note10!: number;

  @IsInt()
  @Min(0)
  note20!: number;

  @IsInt()
  @Min(0)
  note50!: number;

  @IsInt()
  @Min(0)
  note100!: number;

  @IsInt()
  @Min(0)
  note500!: number;

  @IsInt()
  @Min(0)
  note1000!: number;

  @IsInt()
  @Min(0)
  note5000!: number;
}

export class OpenTillDto extends TillNoteCountsDto {
  @IsNumber()
  @Min(0)
  openingBalance!: number;

  @IsOptional()
  @IsBoolean()
  supervisorApproved?: boolean;

  @IsOptional()
  @IsUUID()
  supervisorUserId?: string;
}

export class WithdrawTillDto extends TillNoteCountsDto {
  @IsOptional()
  @IsUUID()
  supervisorUserId?: string;
}

export class ReopenTillDto extends TillNoteCountsDto {
  @IsNumber()
  @Min(0)
  openingBalance!: number;

  @IsOptional()
  @IsUUID()
  supervisorUserId?: string;
}

export class CollectTillCashByAmountDto {
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @IsUUID()
  supervisorUserId?: string;
}

export class ListTillsQueryDto {
  @IsOptional()
  @IsString()
  status?: TillStatus;

  @IsOptional()
  @IsString()
  userId?: string;
}
