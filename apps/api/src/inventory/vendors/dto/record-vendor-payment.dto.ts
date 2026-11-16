import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class RecordVendorPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsIn(["CASH", "BANK"])
  method!: "CASH" | "BANK";

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
