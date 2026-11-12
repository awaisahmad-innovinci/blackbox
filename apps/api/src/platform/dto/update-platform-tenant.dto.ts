import { IsBoolean } from "class-validator";

export class UpdatePlatformTenantDto {
  @IsBoolean()
  isActive!: boolean;
}
