import { Controller, Get, Param, ParseUUIDPipe, Query,
  UseGuards,
} from "@nestjs/common";
import type { GoodsReceiptDetail, PaginatedGoodsReceipts } from "@blackbox/shared";
import { ListGoodsReceiptsQueryDto } from "./dto/list-goods-receipts-query.dto";
import { GoodsReceiptsService } from "./goods-receipts.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("goods-receipts")
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptsService) {}

  @Get()
  list(@Query() query: ListGoodsReceiptsQueryDto): Promise<PaginatedGoodsReceipts> {
    return this.goodsReceipts.list(query);
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<GoodsReceiptDetail> {
    return this.goodsReceipts.getById(id);
  }
}
