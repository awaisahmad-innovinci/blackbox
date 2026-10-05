import type { AuthUser } from "@blackbox/shared";

/** Manager Authy before opening a cashier till (tenant setting). */
export function requireManagerTillOpenApproval(
  user: AuthUser | null | undefined,
): boolean {
  return user?.requireManagerApprovalTillOpen === true;
}

/** Manager Authy before collecting or withdrawing till cash (tenant setting). */
export function requireManagerTillWithdrawApproval(
  user: AuthUser | null | undefined,
): boolean {
  return user?.requireManagerApprovalTillWithdraw === true;
}

/** Manager Authy before posting a sale that includes FOC (tenant setting). */
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
