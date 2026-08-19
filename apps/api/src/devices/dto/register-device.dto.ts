import { IsString, MinLength } from "class-validator";

export class RegisterDeviceDto {
  @IsString()
  @MinLength(1)
  fingerprint!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
