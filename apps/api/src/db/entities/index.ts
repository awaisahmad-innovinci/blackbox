import { DeviceUser } from "./device-user.entity";
import { Device } from "./device.entity";
import { Location } from "./location.entity";
import { Permission } from "./permission.entity";
import { RefreshToken } from "./refresh-token.entity";
import { RolePermission } from "./role-permission.entity";
import { Role } from "./role.entity";
import { SyncChange } from "./sync-change.entity";
import { SyncConflict } from "./sync-conflict.entity";
import { SyncCursor } from "./sync-cursor.entity";
import { Tenant } from "./tenant.entity";
import { UserRole } from "./user-role.entity";
import { User } from "./user.entity";
import { Category } from "./category.entity";
import { Brand } from "./brand.entity";
import { Unit } from "./unit.entity";
import { Product } from "./product.entity";
import { ProductSku } from "./product-sku.entity";
import { VendorGroup } from "./vendor-group.entity";
import { Vendor } from "./vendor.entity";
import { VendorContact } from "./vendor-contact.entity";
import { VendorSku } from "./vendor-sku.entity";
import { Warehouse } from "./warehouse.entity";
import { InventoryStock } from "./inventory-stock.entity";
import { InventoryMovement } from "./inventory-movement.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { PurchaseOrderItem } from "./purchase-order-item.entity";
import { GoodsReceipt } from "./goods-receipt.entity";
import { GoodsReceiptItem } from "./goods-receipt-item.entity";
import { InventoryOut } from "./inventory-out.entity";
import { InventoryOutItem } from "./inventory-out-item.entity";

export const entities = [
  Tenant,
  Permission,
  Role,
  User,
  RolePermission,
  UserRole,
  Device,
  DeviceUser,
  RefreshToken,
  SyncCursor,
  SyncChange,
  SyncConflict,
  Location,
  Category,
  Brand,
  Unit,
  Product,
  ProductSku,
  VendorGroup,
  Vendor,
  VendorContact,
  VendorSku,
  Warehouse,
  InventoryStock,
  InventoryMovement,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryOut,
  InventoryOutItem,
] as const;

export {
  Tenant,
  Permission,
  Role,
  User,
  RolePermission,
  UserRole,
  Device,
  DeviceUser,
  RefreshToken,
  SyncCursor,
  SyncChange,
  SyncConflict,
  Location,
  Category,
  Brand,
  Unit,
  Product,
  ProductSku,
  VendorGroup,
  Vendor,
  VendorContact,
  VendorSku,
  Warehouse,
  InventoryStock,
  InventoryMovement,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryOut,
  InventoryOutItem,
};
