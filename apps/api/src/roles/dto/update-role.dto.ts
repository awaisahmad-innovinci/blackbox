import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      "key may only contain letters, numbers, dots, underscores, and hyphens",
  })
  key?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
