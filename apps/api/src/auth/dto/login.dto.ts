import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { AuthClient } from "@blackbox/shared";

export class LoginDto {
  @IsString()
  @MinLength(1)
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(["web", "desktop"])
  client!: AuthClient;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fingerprint?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  deviceName?: string;
}
