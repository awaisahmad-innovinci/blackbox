import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from "class-validator";

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      "key may only contain letters, numbers, dots, underscores, and hyphens",
  })
  key!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  permissionIds?: string[];
}
