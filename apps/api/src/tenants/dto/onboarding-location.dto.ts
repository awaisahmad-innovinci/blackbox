import { IsOptional, IsString, MinLength } from "class-validator";

export class OnboardingLocationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
