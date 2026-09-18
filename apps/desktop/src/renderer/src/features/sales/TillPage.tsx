import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TillListItem, TillSessionDetail } from "@blackbox/shared";
import {
  computeTillDenominationTotal,
  emptyTillNotes,
  isTillNearLimit,
  validateTillOpeningBalance,
  validateTillOpeningBalanceAmount,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import {
  createEmptyTillFormState,
  TillDenominationForm,
} from "@renderer/components/till-denomination-form";
import { useSupervisorTotp } from "@renderer/components/supervisor-totp-provider";
import { CollectCashDialog } from "@renderer/features/sales/CollectCashDialog";
import { OpenTillDialog } from "@renderer/features/sales/OpenTillDialog";
import { ReopenTillDialog } from "@renderer/features/sales/ReopenTillDialog";
import {
  approveTill,
  closeTill,
  collectCashTill,
  loadCurrentTill,
  loadLatestTillSession,
  loadTills,
  openTill,
  reopenTill,
  withdrawTill,
} from "@renderer/lib/local-db/till-source";
import { useSession } from "@renderer/lib/session/context";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import { useSalesAccess } from "@renderer/lib/use-sales-access";

function statusLabel(status: TillSessionDetail["status"]): string {
  if (status === "PENDING_APPROVAL") return "Pending approval";
  if (status === "OPEN") return "Open";
  if (status === "CLOSED_LIMIT") return "Limit reached";
  return "Closed";
}

export function TillPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const permissions = user?.permissions ?? [];
  const { canReadTill, canManageTill } = useSalesAccess();
  const { promptSupervisorTotp } = useSupervisorTotp();
  const requireTillApproval = user?.requireManagerApprovalTillOpen ?? true;
  const requireTillWithdrawApproval =
    user?.requireManagerApprovalTillWithdraw ?? true;

  const [session, setSession] = useState<TillSessionDetail | null>(null);
  const [latestClosedSession, setLatestClosedSession] =
    useState<TillSessionDetail | null>(null);
  const [awaitingManagerReopen, setAwaitingManagerReopen] = useState(false);
  const [managerItems, setManagerItems] = useState<TillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [managerDialog, setManagerDialog] = useState<
    | { kind: "collect"; tillId: string }
    | { kind: "withdraw"; tillId: string }
    | { kind: "reopen"; tillId: string }
    | null
  >(null);
  const [managerForm, setManagerForm] = useState(createEmptyTillFormState());
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  useEffect(() => {
    if (!canReadTill) navigate(defaultRouteForUser(permissions), { replace: true });
  }, [canReadTill, navigate, permissions]);

  async function refresh(): Promise<void> {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const current = await loadCurrentTill(user.id);
      setSession(current);
      if (!current && !canManageTill) {
        const latest = await loadLatestTillSession(user.id);
        if (latest?.status === "CLOSED") {
          setLatestClosedSession(latest);
          setAwaitingManagerReopen(true);
        } else {
          setLatestClosedSession(null);
          setAwaitingManagerReopen(false);
        }
      } else {
        setLatestClosedSession(null);
        setAwaitingManagerReopen(false);
      }
      if (canManageTill) {
        const rows = await loadTills({
          status: undefined,
        });
        setManagerItems(
          rows.filter((row) =>
            ["PENDING_APPROVAL", "OPEN", "CLOSED_LIMIT", "CLOSED"].includes(
              row.status,
            ),
          ),
        );
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to load till"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [user?.id, canManageTill]);

  async function onOpenTillDirect(): Promise<void> {
    if (!user) return;
    const balance = Number(openingBalance);
    const validationError = validateTillOpeningBalanceAmount(balance);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const detail = await openTill({
        userId: user.id,
        userName: user.fullName?.trim() || user.username,
        body: {
          ...emptyTillNotes(),
          openingBalance: balance,
        },
        requireApproval: false,
      });
      setSession(detail);
      setOpeningBalance("");
      setAwaitingManagerReopen(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to open till"));
    } finally {
      setBusy(false);
    }
  }

  async function onApprove(id: string): Promise<void> {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await approveTill({
        id,
        managerId: user.id,
        managerName: user.fullName?.trim() || user.username,
      });
      await refresh();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to approve till"));
    } finally {
      setBusy(false);
    }
  }

  async function onManagerSubmit(): Promise<void> {
    if (!user || !managerDialog) return;

    if (managerDialog.kind === "reopen") {
      const balance = Number(managerForm.openingBalance);
      const validationError = validateTillOpeningBalance(
        managerForm.notes,
        balance,
      );
      if (validationError) {
        setError(validationError);
        return;
      }
    } else if (computeTillDenominationTotal(managerForm.notes) <= 0) {
      setError("Enter at least one note count.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (managerDialog.kind === "collect") {
        let supervisorUserId: string | undefined;
        let supervisorDisplayName: string | undefined;
        if (requireTillWithdrawApproval) {
          const totp = await promptSupervisorTotp();
          if (!totp.approved) return;
          supervisorUserId = totp.supervisorUserId;
          supervisorDisplayName = totp.supervisorDisplayName;
        }
        await collectCashTill({
          id: managerDialog.tillId,
          managerId: user.id,
          managerName: user.fullName?.trim() || user.username,
          supervisorDisplayName,
          body: {
            ...managerForm.notes,
            supervisorUserId,
          },
        });
      } else if (managerDialog.kind === "withdraw") {
        await withdrawTill({
          id: managerDialog.tillId,
          managerId: user.id,
          managerName: user.fullName?.trim() || user.username,
          body: managerForm.notes,
        });
      } else {
        const balance = Number(managerForm.openingBalance);
        await reopenTill({
          id: managerDialog.tillId,
          managerId: user.id,
          managerName: user.fullName?.trim() || user.username,
          body: {
            ...managerForm.notes,
            openingBalance: balance,
          },
        });
      }
      setManagerDialog(null);
      setManagerForm(createEmptyTillFormState());
      await refresh();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Till action failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onCloseTill(): Promise<void> {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await closeTill({
        userId: user.id,
        userName: user.fullName?.trim() || user.username,
      });
      setCloseDialogOpen(false);
      await refresh();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to close till"));
    } finally {
      setBusy(false);
    }
  }

  const canOpenNewTill =
    !session && !loading && !canManageTill && !awaitingManagerReopen;

  const progressPct =
    session && session.maxCashLimit > 0
      ? Math.min(100, (session.currentCashBalance / session.maxCashLimit) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My till</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cash drawer session and balance
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/sales/new")}>
          Back to sale
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : session ? (
        <div className="border-border space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{session.userName}</p>
              <p className="text-muted-foreground text-sm">
                Status: {statusLabel(session.status)}
              </p>
            </div>
            {session.status === "CLOSED_LIMIT" ? (
              <p className="text-destructive text-sm">
                Contact a manager to withdraw cash and reopen your till.
              </p>
            ) : isTillNearLimit(session) ? (
              <p className="text-amber-700 text-sm dark:text-amber-400">
                Till is near the cash limit. Tap Withdraw cash and ask a manager
                to authorize.
              </p>
            ) : null}
          </div>

          {!canManageTill && session.status === "OPEN" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCollectDialogOpen(true)}
              >
                Withdraw cash
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCloseDialogOpen(true)}
              >
                Close till
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">Opening balance</p>
              <p className="text-lg font-semibold tabular-nums">
                {session.openingBalance.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Current cash</p>
              <p className="text-lg font-semibold tabular-nums">
                {session.currentCashBalance.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Max limit</p>
              <p className="text-lg font-semibold tabular-nums">
                {session.maxCashLimit.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {session.currentCashBalance.toLocaleString()} /{" "}
              {session.maxCashLimit.toLocaleString()} cash in till
            </p>
          </div>
        </div>
      ) : null}

      {!loading && !session && latestClosedSession && !canManageTill ? (
        <div className="border-border space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Till closed</h2>
          <p className="text-muted-foreground text-sm">
            Your till was closed. Open it again with manager authorization before
            you can post sales.
          </p>
          <div>
            <p className="text-muted-foreground text-xs">Last session cash</p>
            <p className="text-lg font-semibold tabular-nums">
              Rs {latestClosedSession.currentCashBalance.toLocaleString()}
            </p>
          </div>
          <Button disabled={busy} onClick={() => setReopenDialogOpen(true)}>
            Open till
          </Button>
        </div>
      ) : null}

      {canOpenNewTill ? (
        <div className="border-border space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Open till</h2>
          {requireTillApproval ? (
            <>
              <p className="text-muted-foreground text-sm">
                Ask a manager to authorize and enter the opening cash balance.
              </p>
              <Button disabled={busy} onClick={() => setOpenDialogOpen(true)}>
                Open till
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                Enter the opening cash balance for your till.
              </p>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="cashierOpeningBalance">Opening balance (Rs)</Label>
                <Input
                  id="cashierOpeningBalance"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  disabled={busy}
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                />
              </div>
              <Button disabled={busy} onClick={() => void onOpenTillDirect()}>
                {busy ? "Opening…" : "Open till"}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {canManageTill ? (
        <div className="border-border space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-medium">Manage cashier tills</h2>
          {managerItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tills need manager action.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cashier</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Current cash</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {managerItems.map((row) => (
                    <tr key={row.id} className="border-border border-t">
                      <td className="px-4 py-3">{row.userName}</td>
                      <td className="px-4 py-3">{statusLabel(row.status)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {row.currentCashBalance.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.status === "PENDING_APPROVAL" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void onApprove(row.id)}
                            >
                              Approve
                            </Button>
                          ) : null}
                          {row.status === "OPEN" || row.status === "CLOSED_LIMIT" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setManagerDialog({
                                  kind: "collect",
                                  tillId: row.id,
                                });
                                setManagerForm(createEmptyTillFormState());
                              }}
                            >
                              Collect cash
                            </Button>
                          ) : null}
                          {row.status === "CLOSED_LIMIT" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setManagerDialog({ kind: "withdraw", tillId: row.id });
                                setManagerForm(createEmptyTillFormState());
                              }}
                            >
                              Withdraw
                            </Button>
                          ) : null}
                          {row.status === "CLOSED" ? (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setManagerDialog({ kind: "reopen", tillId: row.id });
                                setManagerForm(createEmptyTillFormState());
                              }}
                            >
                              Reopen
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <Dialog
        open={managerDialog != null}
        onOpenChange={(open) => {
          if (!open) setManagerDialog(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {managerDialog?.kind === "collect"
                ? "Collect cash"
                : managerDialog?.kind === "withdraw"
                  ? "Withdraw cash"
                  : "Reopen till"}
            </DialogTitle>
          </DialogHeader>
          <TillDenominationForm
            notes={managerForm.notes}
            openingBalance={managerForm.openingBalance}
            onNotesChange={(notes) => {
              const total = computeTillDenominationTotal(notes);
              setManagerForm({
                notes,
                openingBalance:
                  managerDialog?.kind === "reopen"
                    ? String(total)
                    : managerForm.openingBalance,
              });
            }}
            onOpeningBalanceChange={(value) =>
              setManagerForm((current) => ({ ...current, openingBalance: value }))
            }
            disabled={busy || managerDialog?.kind !== "reopen"}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setManagerDialog(null)}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void onManagerSubmit()}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close till</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Close your till for this shift? You will not be able to post sales
            until a manager reopens your till.
          </p>
          {session ? (
            <p className="text-sm font-medium tabular-nums">
              Current cash in till: Rs{" "}
              {session.currentCashBalance.toLocaleString()}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCloseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void onCloseTill()}>
              {busy ? "Closing…" : "Close till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user ? (
        <OpenTillDialog
          open={openDialogOpen}
          onOpenChange={setOpenDialogOpen}
          cashierUserId={user.id}
          cashierName={user.fullName?.trim() || user.username}
          requireApproval={requireTillApproval}
          onSuccess={(detail) => {
            setSession(detail);
            setLatestClosedSession(null);
            setAwaitingManagerReopen(false);
          }}
        />
      ) : null}

      {latestClosedSession && user ? (
        <ReopenTillDialog
          open={reopenDialogOpen}
          onOpenChange={setReopenDialogOpen}
          closedSessionId={latestClosedSession.id}
          cashierName={user.fullName?.trim() || user.username}
          onSuccess={(detail) => {
            setSession(detail);
            setLatestClosedSession(null);
            setAwaitingManagerReopen(false);
          }}
        />
      ) : null}

      {session && user ? (
        <CollectCashDialog
          open={collectDialogOpen}
          onOpenChange={setCollectDialogOpen}
          session={session}
          cashierUserId={user.id}
          cashierName={user.fullName?.trim() || user.username}
          requireApproval={true}
          onSuccess={(updated) => setSession(updated)}
        />
      ) : null}
    </div>
  );
}
