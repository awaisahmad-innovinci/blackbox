import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class SignupTenantDto {
  @IsString()
  @MinLength(1)
  businessName!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      "username may only contain letters, numbers, dots, underscores, and hyphens",
  })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
