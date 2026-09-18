import type {
  CollectTillCashByAmountRequest,
  OpenTillRequest,
  ReopenTillRequest,
  TillListItem,
  TillSessionDetail,
  TillStatus,
  WithdrawTillRequest,
} from "@blackbox/shared";
import { computeTillDenominationTotal } from "@blackbox/shared";
import { tillsApi } from "@renderer/lib/api/tills";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";

export async function loadCurrentTill(
  userId: string,
): Promise<TillSessionDetail | null> {
  try {
    const local = await window.blackbox?.localDb?.getCurrentTill?.(userId);
    if (local !== undefined) return local;
  } catch {
    /* fall through */
  }
  return tillsApi.getCurrent();
}

export async function loadLatestTillSession(
  userId: string,
): Promise<TillSessionDetail | null> {
  try {
    const local = await window.blackbox?.localDb?.getLatestTillSession?.(userId);
    if (local !== undefined) return local;
  } catch {
    /* fall through */
  }
  return null;
}

export async function loadTills(query: {
  status?: TillStatus;
  userId?: string;
} = {}): Promise<TillListItem[]> {
  try {
    const local = await window.blackbox?.localDb?.listTills?.(query);
    if (local) return local;
  } catch {
    /* fall through */
  }
  return tillsApi.list(query);
}

export async function openTill(input: {
  userId: string;
  userName: string;
  body: OpenTillRequest;
  requireApproval: boolean;
  supervisorDisplayName?: string;
}): Promise<TillSessionDetail> {
  try {
    if (window.blackbox?.localDb?.openTill) {
      const detail = await window.blackbox.localDb.openTill(input);
      if (detail.status === "OPEN") {
        const amount = input.body.openingBalance;
        const authenticatorName =
          input.supervisorDisplayName?.trim() || input.userName;
        const hasSupervisor = Boolean(input.body.supervisorUserId);
        await logActivityEvent(
          {
            eventType: "till.opened",
            actorUserId: input.body.supervisorUserId ?? input.userId,
            supervisorUserId: input.body.supervisorUserId ?? null,
            subjectUserId: input.userId,
            summary: `${authenticatorName} opened ${input.userName}'s till with opening balance Rs ${amount.toLocaleString()}`,
            metadata: {
              tillSessionId: detail.id,
              openingBalance: amount,
            },
          },
          {
            actorName: authenticatorName,
            supervisorName: hasSupervisor ? authenticatorName : null,
            subjectName: input.userName,
          },
        );
      }
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.open(input.body);
}

export async function approveTill(input: {
  id: string;
  managerId: string;
  managerName: string;
}): Promise<TillSessionDetail> {
  try {
    if (window.blackbox?.localDb?.approveTill) {
      const detail = await window.blackbox.localDb.approveTill(input);
      await logActivityEvent(
        {
          eventType: "till.opened",
          actorUserId: input.managerId,
          supervisorUserId: input.managerId,
          subjectUserId: detail.userId,
          summary: `${input.managerName} opened ${detail.userName}'s till with opening balance Rs ${detail.openingBalance.toLocaleString()}`,
          metadata: { tillSessionId: detail.id, openingBalance: detail.openingBalance },
        },
        {
          actorName: input.managerName,
          supervisorName: input.managerName,
          subjectName: detail.userName,
        },
      );
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.approve(input.id);
}

export async function collectCashTill(input: {
  id: string;
  managerId: string;
  managerName: string;
  body: WithdrawTillRequest;
  supervisorDisplayName?: string;
}): Promise<TillSessionDetail> {
  try {
    if (window.blackbox?.localDb?.collectCashTill) {
      const detail = await window.blackbox.localDb.collectCashTill(input);
      const amount = computeTillDenominationTotal(input.body);
      const supervisorId = input.body.supervisorUserId ?? input.managerId;
      const authenticatorName =
        input.supervisorDisplayName?.trim() || input.managerName;
      await logActivityEvent(
        {
          eventType: "till.cash_collected",
          actorUserId: supervisorId,
          supervisorUserId: supervisorId,
          subjectUserId: detail.userId,
          summary: `${authenticatorName} received Rs ${amount.toLocaleString()} cash from ${detail.userName}'s till`,
          metadata: {
            tillSessionId: detail.id,
            amount,
            remainingBalance: detail.currentCashBalance,
          },
        },
        {
          actorName: authenticatorName,
          supervisorName: authenticatorName,
          subjectName: detail.userName,
        },
      );
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.collectCash(input.id, input.body);
}

export async function collectCashByAmountFromTill(input: {
  cashierUserId: string;
  cashierName: string;
  amount: number;
  supervisorUserId?: string;
  supervisorDisplayName?: string;
}): Promise<TillSessionDetail> {
  const body: CollectTillCashByAmountRequest = {
    amount: input.amount,
    supervisorUserId: input.supervisorUserId,
  };
  try {
    if (window.blackbox?.localDb?.collectCashByAmount) {
      const detail = await window.blackbox.localDb.collectCashByAmount({
        userId: input.cashierUserId,
        userName: input.cashierName,
        amount: input.amount,
        supervisorUserId: input.supervisorUserId,
      });
      const supervisorId = input.supervisorUserId ?? input.cashierUserId;
      const authenticatorName =
        input.supervisorDisplayName?.trim() || "Manager";
      await logActivityEvent(
        {
          eventType: "till.cash_collected",
          actorUserId: supervisorId,
          supervisorUserId: input.supervisorUserId ?? null,
          subjectUserId: input.cashierUserId,
          summary: `${authenticatorName} received Rs ${input.amount.toLocaleString()} cash from ${input.cashierName}'s till`,
          metadata: {
            tillSessionId: detail.id,
            amount: input.amount,
            remainingBalance: detail.currentCashBalance,
          },
        },
        {
          actorName: authenticatorName,
          supervisorName: input.supervisorUserId ? authenticatorName : null,
          subjectName: input.cashierName,
        },
      );
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.collectCashByAmount(body);
}

export async function withdrawTill(input: {
  id: string;
  managerId: string;
  managerName: string;
  body: WithdrawTillRequest;
}): Promise<TillSessionDetail> {
  try {
    if (window.blackbox?.localDb?.withdrawTill) {
      const detail = await window.blackbox.localDb.withdrawTill(input);
      const amount = computeTillDenominationTotal(input.body);
      await logActivityEvent(
        {
          eventType: "till.withdrawn_full",
          actorUserId: input.managerId,
          supervisorUserId: input.body.supervisorUserId ?? input.managerId,
          subjectUserId: detail.userId,
          summary: `Withdrew Rs ${amount.toLocaleString()} from ${detail.userName} till`,
          metadata: { tillSessionId: detail.id, amount },
        },
        {
          actorName: input.managerName,
          supervisorName: input.managerName,
          subjectName: detail.userName,
        },
      );
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.withdraw(input.id, input.body);
}

export async function reopenTill(input: {
  id: string;
  managerId: string;
  managerName: string;
  body: ReopenTillRequest;
  supervisorDisplayName?: string;
  cashierName?: string;
}): Promise<TillSessionDetail> {
  try {
    if (window.blackbox?.localDb?.reopenTill) {
      const detail = await window.blackbox.localDb.reopenTill(input);
      const authenticatorName =
        input.supervisorDisplayName?.trim() || input.managerName;
      const cashierName = input.cashierName?.trim() || detail.userName;
      await logActivityEvent(
        {
          eventType: "till.reopened",
          actorUserId: input.body.supervisorUserId ?? input.managerId,
          supervisorUserId: input.body.supervisorUserId ?? input.managerId,
          subjectUserId: detail.userId,
          summary: `${authenticatorName} opened ${cashierName}'s till with opening balance Rs ${input.body.openingBalance.toLocaleString()}`,
          metadata: {
            tillSessionId: detail.id,
            openingBalance: input.body.openingBalance,
          },
        },
        {
          actorName: authenticatorName,
          supervisorName: authenticatorName,
          subjectName: cashierName,
        },
      );
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.reopen(input.id, input.body);
}

export async function closeTill(input: {
  userId: string;
  userName: string;
}): Promise<TillSessionDetail> {
  const closedAtLabel = new Date().toLocaleString();
  try {
    if (window.blackbox?.localDb?.closeTill) {
      const detail = await window.blackbox.localDb.closeTill(input);
      await logActivityEvent(
        {
          eventType: "till.closed",
          actorUserId: input.userId,
          subjectUserId: input.userId,
          summary: `${input.userName} closed till on ${closedAtLabel} — current cash Rs ${detail.currentCashBalance.toLocaleString()}`,
          metadata: {
            tillSessionId: detail.id,
            currentCashBalance: detail.currentCashBalance,
            closeReason: detail.closeReason,
          },
        },
        {
          actorName: input.userName,
          subjectName: input.userName,
        },
      );
      return detail;
    }
  } catch {
    /* fall through */
  }
  return tillsApi.closeCurrent();
}

export async function assertTillCanPostSale(input: {
  userId: string;
  skipForManager?: boolean;
  cashPaymentTotal: number;
}): Promise<void> {
  if (window.blackbox?.localDb?.assertTillCanPostSale) {
    await window.blackbox.localDb.assertTillCanPostSale(input);
    return;
  }
}

export async function applyTillCashFromSale(input: {
  userId: string;
  skipForManager?: boolean;
  cashPaymentTotal: number;
}): Promise<void> {
  if (window.blackbox?.localDb?.applyTillCashFromSale) {
    await window.blackbox.localDb.applyTillCashFromSale(input);
  }
}
