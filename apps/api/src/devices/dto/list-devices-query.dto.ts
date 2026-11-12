import { IsIn, IsOptional } from "class-validator";

export class ListDevicesQueryDto {
  @IsOptional()
  @IsIn(["all", "deleted"])
  status?: "all" | "deleted";
}
