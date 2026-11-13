import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { CashExpenseRow, CashFlowReport, DrawerPerson } from "@blackbox/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { CashFlowService } from "./cash-flow.service";
import {
  CashFlowQueryDto,
  RecordCashExpenseDto,
  RecordManagerDrawerOpeningDto,
  RecordManagerDrawerSubmissionDto,
  RecordOwnerCashDto,
} from "./dto/cash-flow.dto";

@Controller("cash-flow")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashFlowController {
  constructor(private readonly cashFlow: CashFlowService) {}

  @Get()
  report(
    @CurrentUser() user: TenantContext,
    @Query() query: CashFlowQueryDto,
  ): Promise<CashFlowReport> {
    this.assertCanView(user);
    return this.cashFlow.report(user, query.from, query.to);
  }

  @Post("expenses")
  @RequirePermissions("till.manage")
  record(
    @CurrentUser() user: TenantContext,
    @Body() body: RecordCashExpenseDto,
  ): Promise<CashExpenseRow> {
    return this.cashFlow.record(user, body);
  }

  @Get("managers")
  @RequirePermissions("web.access")
  managers(@CurrentUser() user: TenantContext): Promise<DrawerPerson[]> {
    return this.cashFlow.listPeople(user.tenantId, "till.manage", "web.access");
  }

  @Post("owner-cash")
  @RequirePermissions("web.access")
  recordOwnerCash(
    @CurrentUser() user: TenantContext,
    @Body() body: RecordOwnerCashDto,
  ): Promise<{ id: string; amount: number }> {
    return this.cashFlow.recordOwnerCash(user, body.amount, body.note);
  }

  @Post("drawer-openings")
  @RequirePermissions("web.access")
  recordOpening(
    @CurrentUser() user: TenantContext,
    @Body() body: RecordManagerDrawerOpeningDto,
  ): Promise<{ id: string }> {
    return this.cashFlow.recordOpening(user, body);
  }

  @Post("drawer-submissions")
  @RequirePermissions("till.manage")
  recordSubmission(
    @CurrentUser() user: TenantContext,
    @Body() body: RecordManagerDrawerSubmissionDto,
  ): Promise<{ id: string; amount: number }> {
    return this.cashFlow.recordSubmission(user, body.amount);
  }

  private assertCanView(user: TenantContext): void {
    const permissions = user.permissions ?? [];
    if (
      !permissions.includes("sales.read") &&
      !permissions.includes("till.manage")
    ) {
      throw new ForbiddenException();
    }
  }
}
