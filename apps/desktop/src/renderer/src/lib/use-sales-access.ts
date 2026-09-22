import { useSession } from "@renderer/lib/session/context";
import {
  canAccessSale,
  canAccessSalesList,
  canAccessTill,
  canManageTill,
  canAccessActivity,
  canAccessSaleReturn,
  canAccessSaleRefund,
  canVoidSale,
  isCashierOnlyNav,
  isWarehouseOnlyNav,
  showInventoryDashboard,
  showManagerDashboard,
} from "./sales-access";

export function useSalesAccess() {
  const { user } = useSession();
  const permissions = user?.permissions ?? [];

  return {
    canWrite: canAccessSale(permissions),
    canReadList: canAccessSalesList(permissions),
    canReadTill: canAccessTill(permissions),
    canManageTill: canManageTill(permissions),
    canReadActivity: canAccessActivity(permissions),
    canVoid: canVoidSale(permissions),
    canReturn: canAccessSaleReturn(permissions),
    canRefund: canAccessSaleRefund(permissions),
    cashierOnly: isCashierOnlyNav(permissions),
    warehouseOnly: isWarehouseOnlyNav(permissions),
    showManagerDashboard: showManagerDashboard(permissions),
    showInventoryDashboard: showInventoryDashboard(permissions),
  };
}
