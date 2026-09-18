import { useSession } from "@renderer/lib/session/context";
import {
  canAccessSale,
  canAccessSalesList,
  canAccessTill,
  canManageTill,
  canAccessActivity,
  canAccessSaleReturn,
  canVoidSale,
  isCashierOnlyNav,
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
    cashierOnly: isCashierOnlyNav(permissions),
  };
}
