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
import {
  PERSON_NAME_MESSAGE,
  PERSON_NAME_PATTERN,
  USERNAME_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@blackbox/shared";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString()
  @Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE })
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
