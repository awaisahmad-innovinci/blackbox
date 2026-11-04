import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class RecordVendorPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
