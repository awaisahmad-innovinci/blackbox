import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";
import {
  PERSON_NAME_MESSAGE,
  PERSON_NAME_PATTERN,
  USERNAME_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@blackbox/shared";

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE })
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
