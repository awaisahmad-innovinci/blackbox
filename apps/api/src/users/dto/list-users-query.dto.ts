import { IsIn, IsOptional } from "class-validator";
import { ENTITY_STATUS_FILTERS, type EntityStatusFilter } from "@blackbox/shared";

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn([...ENTITY_STATUS_FILTERS])
  status?: EntityStatusFilter;
}
