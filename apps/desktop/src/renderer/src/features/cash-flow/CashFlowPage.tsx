import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  CASH_EXPENSE_CATEGORIES,
  expenseExceedsDrawer,
  expenseOverDrawerMessage,
  formatMoney,
  type CashExpenseCategory,
  type CashFlowReport,
  type DrawerPerson,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@blackbox/ui/card";
import { Input } from "@blackbox/ui/input";
import { cashFlowApi } from "@renderer/lib/api/cash-flow";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { ApiError } from "@renderer/lib/api/client";
import { isDeviceBound, commitLocalChange } from "@renderer/lib/local-db/local-write";
import { useSession } from "@renderer/lib/session/context";
import { useSalesAccess } from "@renderer/lib/use-sales-access";

type Preset = "today" | "week" | "month" | "day";

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function periodFor(preset: Preset, day: string): { from: string; to: string } {
  const now = new Date();
  if (preset === "day") return { from: day, to: day };
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: isoDate(start), to: isoDate(end) };
  }
  if (preset === "week") {
    const weekday = now.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: isoDate(monday), to: isoDate(sunday) };
  }
  const today = isoDate(now);
  return { from: today, to: today };
}

function money(value: number): string {
  return `Rs ${formatMoney(value)}`;
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function CashFlowPage() {
  const { user } = useSession();
  const { showManagerDashboard, canManageTill } = useSalesAccess();
  const seeAll = user?.permissions.includes("web.access") ?? false;
  const [preset, setPreset] = useState<Preset>("today");
  const [day, setDay] = useState(() => isoDate(new Date()));
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CashExpenseCategory>("Rent");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [managers, setManagers] = useState<DrawerPerson[]>([]);
  const [floatManagerId, setFloatManagerId] = useState("");
  const [floatAmount, setFloatAmount] = useState("");
  const [floatSaving, setFloatSaving] = useState(false);
  const [floatError, setFloatError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitAmount, setSubmitAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { from, to } = periodFor(preset, day);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const bound = await isDeviceBound();
      if (bound && window.blackbox?.localDb?.getCashFlow) {
        setReport(
          await window.blackbox.localDb.getCashFlow({
            userId: user.id,
            managerName: user.fullName || user.username,
            seeAll,
            from,
            to,
          }),
        );
      } else {
        setReport(await cashFlowApi.get(from, to));
      }
    } catch (err: unknown) {
      setReport(null);
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to load cash flow");
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.fullName, user?.username, seeAll, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!seeAll) return;
    void cashFlowApi.listManagers().then((rows) => {
      setManagers(rows);
      setFloatManagerId((current) => current || rows[0]?.id || "");
    }).catch(() => {
      setManagers([]);
    });
  }, [seeAll]);

  if (!showManagerDashboard) {
    return <Navigate to="/" replace />;
  }

  async function onRecord(event: FormEvent) {
    event.preventDefault();
    if (!user || !canManageTill) return;
    const parsed = Number(amount);
    if (!(parsed > 0)) {
      setFormError("Enter an amount greater than zero");
      return;
    }
    const owner = user.permissions.includes("web.access");
    const boundForCheck = await isDeviceBound();
    const drawerBalance = owner
      ? (report?.ownerCashBalance ??
        (boundForCheck
          ? ((await window.blackbox?.localDb?.getOwnerCashBalance?.(user.id)) ??
            0)
          : 0))
      : (report?.drawers.find((row) => row.managerUserId === user.id)?.balance ??
        0);
    if (
      (!owner || boundForCheck || report != null) &&
      expenseExceedsDrawer(parsed, drawerBalance)
    ) {
      setFormError(expenseOverDrawerMessage(drawerBalance));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const bound = await isDeviceBound();
      if (bound) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await commitLocalChange({
          entityType: "cash_expense",
          entityId: id,
          operation: "UPSERT",
          payload: {
            recordedByUserId: user.id,
            recordedByName: user.fullName || user.username,
            category,
            amount: parsed,
            note: note.trim(),
            occurredAt: now,
            ...(user.permissions.includes("web.access")
              ? { ownerCash: true }
              : {}),
            createdAt: now,
            updatedAt: now,
          },
        });
        await logActivityEvent(
          {
            eventType: "cash_expense.recorded",
            actorUserId: user.id,
            summary: `Recorded ${category} of Rs ${formatMoney(parsed)}`,
            metadata: { expenseId: id, category, amount: parsed },
          },
          { actorName: user.fullName?.trim() || user.username },
        );
      } else {
        await cashFlowApi.record({
          category,
          amount: parsed,
          note: note.trim(),
        });
      }
      setAmount("");
      setNote("");
      await load();
    } catch (err: unknown) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save the expense",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onFundDrawer(event: FormEvent) {
    event.preventDefault();
    if (!user || !seeAll) return;
    const manager = managers.find((row) => row.id === floatManagerId);
    const parsed = Number(floatAmount);
    if (!manager) {
      setFloatError("Choose a manager");
      return;
    }
    if (!(parsed > 0)) {
      setFloatError("Enter an amount greater than zero");
      return;
    }
    const boundForFund = await isDeviceBound();
    if (boundForFund) {
      const ownerCash =
        (await window.blackbox?.localDb?.getOwnerCashBalance?.(user.id)) ?? 0;
      if (expenseExceedsDrawer(parsed, ownerCash)) {
        setFloatError(expenseOverDrawerMessage(ownerCash));
        return;
      }
    }
    setFloatSaving(true);
    setFloatError(null);
    const managerName = manager.fullName.trim() || manager.username;
    const openerName = user.fullName?.trim() || user.username;
    try {
      const bound = await isDeviceBound();
      if (bound) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await commitLocalChange({
          entityType: "manager_drawer_opening",
          entityId: id,
          operation: "UPSERT",
          payload: {
            managerUserId: manager.id,
            managerName,
            amount: parsed,
            openedByUserId: user.id,
            openedByName: openerName,
            openedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
        await logActivityEvent(
          {
            eventType: "drawer.opened",
            actorUserId: user.id,
            subjectUserId: manager.id,
            summary: `${openerName} opened ${managerName}'s drawer with Rs ${formatMoney(parsed)}`,
            metadata: { openingId: id, managerUserId: manager.id, amount: parsed },
          },
          {
            actorName: openerName,
            subjectName: managerName,
          },
        );
      } else {
        await cashFlowApi.recordOpening({
          managerUserId: manager.id,
          amount: parsed,
        });
      }
      setFloatAmount("");
      await load();
    } catch (err: unknown) {
      setFloatError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not fund the drawer",
      );
    } finally {
      setFloatSaving(false);
    }
  }

  async function onSubmitCash(event: FormEvent) {
    event.preventDefault();
    if (!user || !canManageTill) return;
    const balance =
      report?.drawers.find((row) => row.managerUserId === user.id)?.balance ?? 0;
    const parsed = Number(submitAmount);
    if (!(parsed > 0)) {
      setSubmitError("Enter an amount greater than zero");
      return;
    }
    if (!(balance > 0) || expenseExceedsDrawer(parsed, balance)) {
      setSubmitError(
        balance > 0
          ? `Submit no more than the drawer balance of Rs ${formatMoney(balance)}`
          : "There is no cash to submit",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const managerName = user.fullName?.trim() || user.username;
    try {
      const bound = await isDeviceBound();
      if (bound) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await commitLocalChange({
          entityType: "manager_drawer_submission",
          entityId: id,
          operation: "UPSERT",
          payload: {
            managerUserId: user.id,
            managerName,
            amount: parsed,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
        await logActivityEvent(
          {
            eventType: "drawer.submitted",
            actorUserId: user.id,
            summary: `${managerName} submitted Rs ${formatMoney(parsed)} cash to the owner`,
            metadata: { submissionId: id, amount: parsed },
          },
          { actorName: managerName },
        );
      } else {
        await cashFlowApi.submit(parsed);
      }
      setSubmitAmount("");
      await load();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not submit the cash",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const ownBalance =
    report?.drawers.find((row) => row.managerUserId === user?.id)?.balance ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash flow</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {seeAll
              ? "Every manager has a separate drawer. Opening float and collections increase it. Till floats, expenses, and cash submitted to the owner decrease it."
              : "Your drawer is the opening float plus cash you collected, minus till floats, expenses, and cash you submitted to the owner."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Today"],
              ["week", "This week"],
              ["month", "This month"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={preset === id ? "default" : "outline"}
              onClick={() => setPreset(id)}
            >
              {label}
            </Button>
          ))}
          <Input
            type="date"
            className="w-40"
            value={preset === "day" ? day : ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              setDay(value);
              setPreset("day");
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Drawer balance</h2>
          <p className="text-muted-foreground text-xs">
            All time. The date filter changes the lists below, not this balance.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {seeAll ? (
            <Card className="gap-3 py-5">
              <CardHeader className="px-5 pb-0">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Owner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-5">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {money(report?.ownerCashBalance ?? 0)}
                </p>
                <p className="text-muted-foreground text-xs">
                  Cash collected. It stays until you spend it on expenses or
                  manager drawers.
                </p>
              </CardContent>
            </Card>
          ) : null}
          {(report?.drawers ?? []).map((drawer) => (
            <Card key={drawer.managerUserId} className="gap-3 py-5">
              <CardHeader className="px-5 pb-0">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {drawer.managerName}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {money(drawer.balance)}
                </p>
              </CardContent>
            </Card>
          ))}
          {!loading && !seeAll && (report?.drawers.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">No drawer activity yet.</p>
          ) : null}
        </div>
        {canManageTill && ownBalance > 0 ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => void onSubmitCash(event)}
          >
            <label className="grid gap-1 text-sm">
              Amount to pay the owner
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-40"
                value={submitAmount}
                aria-invalid={Boolean(submitError)}
                onChange={(event) => setSubmitAmount(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit cash to owner"}
            </Button>
            <p className="text-muted-foreground basis-full text-xs">
              The amount leaves your drawer, {money(ownBalance)}, and is added to the owner&apos;s collected cash.
            </p>
            {submitError ? (
              <p className="text-destructive basis-full text-sm" role="alert">
                {submitError}
              </p>
            ) : null}
          </form>
        ) : null}
      </section>

      {seeAll ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Fund a manager drawer</h2>
          <p className="text-muted-foreground text-xs">
            Morning floats add together. The manager uses this cash to open cashier tills and pay expenses.
          </p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => void onFundDrawer(event)}
          >
            <label className="grid gap-1 text-sm">
              Manager
              <select
                className="border-input bg-background h-9 rounded-md border px-2"
                value={floatManagerId}
                onChange={(event) => setFloatManagerId(event.target.value)}
              >
                {managers.length === 0 ? (
                  <option value="">No managers</option>
                ) : null}
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName.trim() || manager.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Opening float
              <Input
                inputMode="decimal"
                className="w-36"
                value={floatAmount}
                onChange={(event) => setFloatAmount(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={floatSaving}>
              {floatSaving ? "Saving…" : "Fund drawer"}
            </Button>
            {floatError ? (
              <p className="text-destructive w-full text-sm">{floatError}</p>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Cashier cash sales</h2>
        <p className="text-muted-foreground text-xs">
          Cash on posted sales in this period, minus cash refunds. Card payments are not included.
        </p>
        <MoneyTable
          loading={loading}
          empty="No cash sales in this period."
          columns={["Cashier", "Cash sales", "Cash refunds", "Net cash"]}
          rows={(report?.cashierCashSales ?? []).map((row) => [
            row.cashierName,
            money(row.cashSales),
            money(row.cashRefunds),
            money(row.netCash),
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Collections</h2>
        <p className="text-muted-foreground text-xs">
          Cash taken from cashier tills in this period.
        </p>
        <MoneyTable
          loading={loading}
          empty="No collections in this period."
          columns={["When", "Manager", "Cashier", "Kind", "Amount"]}
          rows={(report?.collections ?? []).map((row) => [
            when(row.at),
            row.managerName,
            row.cashierName,
            row.kind === "partial" ? "Partial" : "Full",
            money(row.amount),
          ])}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Expenses</h2>
        {canManageTill ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => void onRecord(event)}
          >
            <label className="grid gap-1 text-sm">
              Category
              <select
                className="border-input bg-background h-9 rounded-md border px-2"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as CashExpenseCategory)
                }
              >
                {CASH_EXPENSE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Amount
              <Input
                inputMode="decimal"
                className="w-36"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Note
              <Input
                className="w-56"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add expense"}
            </Button>
            {formError ? (
              <p className="text-destructive w-full text-sm">{formError}</p>
            ) : (
              <p className="text-muted-foreground w-full text-xs">
                {seeAll
                  ? "This expense is deducted from the owner drawer. Maximum "
                  : "This expense is deducted from your drawer. Maximum "}
                {money(
                  seeAll
                    ? (report?.ownerCashBalance ?? 0)
                    : (report?.drawers.find(
                        (row) => row.managerUserId === user?.id,
                      )?.balance ?? 0),
                )}
                .
              </p>
            )}
          </form>
        ) : null}
        <MoneyTable
          loading={loading}
          empty="No expenses in this period."
          columns={["When", "Manager", "Category", "Note", "Amount"]}
          rows={(report?.expenses ?? []).map((row) => [
            when(row.at),
            row.managerName,
            row.category,
            row.note || "—",
            money(row.amount),
          ])}
        />
      </section>
    </div>
  );
}

function MoneyTable({
  columns,
  rows,
  empty,
  loading,
}: {
  columns: string[];
  rows: string[][];
  empty: string;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
