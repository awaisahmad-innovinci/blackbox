import { IsIn, IsString, MinLength } from "class-validator";
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
}
