import { useSession } from "@renderer/lib/session/context";
import {
  canAccessSale,
  canAccessSalesList,
  canVoidSale,
  isCashierOnlyNav,
} from "./sales-access";

export function useSalesAccess() {
  const { user } = useSession();
  const permissions = user?.permissions ?? [];

  return {
    canWrite: canAccessSale(permissions),
    canReadList: canAccessSalesList(permissions),
    canVoid: canVoidSale(permissions),
    cashierOnly: isCashierOnlyNav(permissions),
  };
}
