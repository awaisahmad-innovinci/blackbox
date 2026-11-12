import { IsString, Length, Matches } from "class-validator";

export class TotpEnrollConfirmDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
