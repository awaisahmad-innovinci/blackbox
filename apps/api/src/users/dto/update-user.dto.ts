import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      "username may only contain letters, numbers, dots, underscores, and hyphens",
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
