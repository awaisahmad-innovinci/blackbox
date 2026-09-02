import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "Code must be a 6-digit number" })
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
