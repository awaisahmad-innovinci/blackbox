import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from "class-validator";

export class CreateUserDto {
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
  @MinLength(1)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  roleIds?: string[];
}
