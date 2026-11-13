import { CASH_EXPENSE_CATEGORIES } from "@blackbox/shared";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class CashFlowQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class RecordCashExpenseDto {
  @IsIn(CASH_EXPENSE_CATEGORIES)
  category!: (typeof CASH_EXPENSE_CATEGORIES)[number];

  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RecordManagerDrawerOpeningDto {
  @IsUUID()
  managerUserId!: string;

  @IsNumber()
  @Min(0.0001)
  amount!: number;
}

export class RecordOwnerCashDto {
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RecordManagerDrawerSubmissionDto {
  @IsNumber()
  @Min(0.0001)
  amount!: number;
}
