import { IsString, MinLength } from "class-validator";

export class ResetPlatformOwnerPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
