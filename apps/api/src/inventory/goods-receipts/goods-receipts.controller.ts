import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import type { GoodsReceiptDetail } from "@blackbox/shared";
import { GoodsReceiptsService } from "./goods-receipts.service";

@Controller("goods-receipts")
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptsService) {}

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<GoodsReceiptDetail> {
    return this.goodsReceipts.getById(id);
  }
}
