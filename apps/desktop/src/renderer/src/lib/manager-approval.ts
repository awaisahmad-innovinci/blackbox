import type { AuthUser } from "@blackbox/shared";

/** Manager Authy before open till or collect cash from till (tenant setting). */
export function requireManagerTillOperationsApproval(
  user: AuthUser | null | undefined,
): boolean {
  if (!user) return false;
  return (
    user.requireManagerApprovalTillOpen === true ||
    user.requireManagerApprovalTillWithdraw === true
  );
}

export function requireManagerRemoveSaleLineApproval(
  user: AuthUser | null | undefined,
): boolean {
  return user?.requireManagerApprovalRemoveSaleLine === true;
}
