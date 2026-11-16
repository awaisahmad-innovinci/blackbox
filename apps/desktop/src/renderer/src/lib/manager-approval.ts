import type { AuthUser } from "@blackbox/shared";

/** Manager authentication code before opening a cashier till (tenant setting). */
export function requireManagerTillOpenApproval(
  user: AuthUser | null | undefined,
): boolean {
  return user?.requireManagerApprovalTillOpen === true;
}

/** Cash withdrawal always needs a manager authentication code. */
export function requireManagerTillWithdrawApproval(
  _user: AuthUser | null | undefined,
): boolean {
  return true;
}

/** Manager authentication code before posting a sale that includes FOC (tenant setting). */
export function requireManagerFocApproval(
  user: AuthUser | null | undefined,
): boolean {
  return user?.requireManagerApprovalFoc === true;
}

export function requireManagerRemoveSaleLineApproval(
  user: AuthUser | null | undefined,
): boolean {
  return user?.requireManagerApprovalRemoveSaleLine === true;
}
