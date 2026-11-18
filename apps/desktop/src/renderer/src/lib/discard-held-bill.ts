import type { ConfirmOptions } from "@renderer/components/confirm-provider";
import type { SupervisorTotpPromptResult } from "@renderer/components/supervisor-totp-provider";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { requireManagerDiscardHeldBillApproval } from "@renderer/lib/manager-approval";
import type { AuthUser } from "@blackbox/shared";

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

type PromptTotpFn = (options?: {
  audience?: "manager" | "supervisor";
}) => Promise<SupervisorTotpPromptResult>;

export type DiscardHeldBillInput = {
  saleId: string;
  saleNumber: string;
  user: AuthUser;
  confirm: ConfirmFn;
  promptSupervisorTotp: PromptTotpFn;
};

export type DiscardHeldBillResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "not_found" | "failed"; message?: string };

export async function discardHeldBillWithApproval(
  input: DiscardHeldBillInput,
): Promise<DiscardHeldBillResult> {
  let supervisorUserId: string | null = null;
  let supervisorDisplayName: string | null = null;

  if (requireManagerDiscardHeldBillApproval(input.user)) {
    const totp = await input.promptSupervisorTotp({ audience: "manager" });
    if (!totp.approved) {
      return { ok: false, reason: "cancelled" };
    }
    supervisorUserId = totp.supervisorUserId;
    supervisorDisplayName = totp.supervisorDisplayName;
  }

  const ok = await input.confirm({
    title: "Discard held bill?",
    description: `${input.saleNumber} will be removed from this device. Reserved stock is released.`,
    confirmLabel: "Discard",
  });
  if (!ok) {
    return { ok: false, reason: "cancelled" };
  }

  try {
    const result = await window.blackbox?.localDb?.deleteSaleDraft?.(
      input.saleId,
    );
    if (!result?.ok) {
      return {
        ok: false,
        reason: "not_found",
        message: "Held bill not found or already removed",
      };
    }
  } catch {
    return {
      ok: false,
      reason: "failed",
      message: "Failed to discard held bill",
    };
  }

  const actorName = input.user.fullName?.trim() || input.user.username;
  await logActivityEvent(
    {
      eventType: "sale.held_discarded",
      actorUserId: input.user.id,
      supervisorUserId,
      summary: `Discarded held bill ${input.saleNumber}`,
      metadata: {
        saleId: input.saleId,
        saleNumber: input.saleNumber,
      },
    },
    {
      actorName,
      supervisorName: supervisorDisplayName,
    },
  );

  return { ok: true };
}