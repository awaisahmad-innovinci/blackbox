import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { TillListItem, TillSessionDetail } from "@blackbox/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import {
  CollectTillCashByAmountDto,
  ListTillsQueryDto,
  OpenTillDto,
  ReopenTillDto,
  WithdrawTillDto,
} from "./dto/till.dto";
import { TillsService } from "./tills.service";

@Controller("tills")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TillsController {
  constructor(private readonly tills: TillsService) {}

  @Get("current")
  @RequirePermissions("till.read")
  getCurrent(): Promise<TillSessionDetail | null> {
    return this.tills.getCurrent();
  }

  @Get()
  @RequirePermissions("till.manage")
  list(@Query() query: ListTillsQueryDto): Promise<TillListItem[]> {
    return this.tills.list(query);
  }

  @Post("open")
  @RequirePermissions("till.read", "sales.write")
  open(@Body() dto: OpenTillDto): Promise<TillSessionDetail> {
    return this.tills.open(dto);
  }

  @Post("current/collect-cash-by-amount")
  @RequirePermissions("till.read", "sales.write")
  collectCashByAmount(
    @Body() dto: CollectTillCashByAmountDto,
  ): Promise<TillSessionDetail> {
    return this.tills.collectCashByAmount(dto);
  }

  @Post("current/close")
  @RequirePermissions("till.read", "sales.write")
  closeCurrent(): Promise<TillSessionDetail> {
    return this.tills.closeCurrent();
  }

  @Post(":id/approve")
  @RequirePermissions("till.manage")
  approve(@Param("id", ParseUUIDPipe) id: string): Promise<TillSessionDetail> {
    return this.tills.approve(id);
  }

  @Post(":id/withdraw")
  @RequirePermissions("till.manage")
  withdraw(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: WithdrawTillDto,
  ): Promise<TillSessionDetail> {
    return this.tills.withdraw(id, dto);
  }

  @Post(":id/collect-cash")
  @RequirePermissions("till.manage")
  collectCash(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: WithdrawTillDto,
  ): Promise<TillSessionDetail> {
    return this.tills.collectCash(id, dto);
  }

  @Post(":id/reopen")
  @RequirePermissions("till.manage")
  reopen(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReopenTillDto,
  ): Promise<TillSessionDetail> {
    return this.tills.reopen(id, dto);
  }
}
