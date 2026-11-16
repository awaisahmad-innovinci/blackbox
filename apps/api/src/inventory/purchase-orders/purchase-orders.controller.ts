import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  GoodsReceiptDetail,
  PaginatedPurchaseOrders,
  PurchaseOrderDetail,
  ReceivingDraft,
} from "@blackbox/shared";
import { CreateGoodsReceiptDto } from "../goods-receipts/dto/goods-receipt.dto";
import { GoodsReceiptsService } from "../goods-receipts/goods-receipts.service";
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  UpdatePurchaseOrderItemPriceDto,
  UpdatePurchaseOrderDto,
} from "./dto/purchase-order.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly goodsReceipts: GoodsReceiptsService,
  ) {}

  @Get()
  list(
    @Query() query: ListPurchaseOrdersQueryDto,
  ): Promise<PaginatedPurchaseOrders> {
    return this.purchaseOrders.list(query);
  }

  @RequirePermissions("purchasing.access")
  @Post()
  create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrderDetail> {
    return this.purchaseOrders.create(dto);
  }

  @Get(":id/receiving")
  getReceiving(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ReceivingDraft> {
    return this.goodsReceipts.getReceivingDraft(id);
  }

  @RequirePermissions("purchasing.access")
  @Post(":id/receipts")
  createReceipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateGoodsReceiptDto,
  ): Promise<GoodsReceiptDetail> {
    return this.goodsReceipts.createReceipt(id, dto);
  }

  @RequirePermissions("purchasing.access")
  @Patch(":id/items/:itemId/price")
  updateItemPrice(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePurchaseOrderItemPriceDto,
  ): Promise<PurchaseOrderDetail> {
    return this.purchaseOrders.updateItemPrice(
      id,
      itemId,
      dto.unitCost,
      dto.sellingPrice,
    );
  }

  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderDetail> {
    return this.purchaseOrders.getById(id);
  }

  @RequirePermissions("purchasing.access")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderDetail> {
    return this.purchaseOrders.update(id, dto);
  }

  @RequirePermissions("purchasing.access")
  @Post(":id/submit")
  submit(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderDetail> {
    return this.purchaseOrders.submit(id);
  }

  @RequirePermissions("purchasing.access")
  @Post(":id/cancel")
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderDetail> {
    return this.purchaseOrders.cancel(id);
  }
}
