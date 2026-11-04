import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  CASH_EXPENSE_CATEGORIES,
  type CashExpenseCategory,
  type CashFlowReport,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@blackbox/ui/card";
import { Input } from "@blackbox/ui/input";
import { cashFlowApi } from "@renderer/lib/api/cash-flow";
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
  return `Rs ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
            createdAt: now,
            updatedAt: now,
          },
        });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash flow</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {seeAll
              ? "Every manager has a separate drawer. Collections increase it. Expenses decrease it."
              : "Your drawer is the cash you collected minus the expenses you recorded."}
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
          {(report?.drawers ?? []).map((drawer) => (
            <Card key={drawer.managerUserId} className="gap-3 py-5">
              <CardHeader className="px-5 pb-0">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {drawer.managerName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-5">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {money(drawer.balance)}
                </p>
                <p className="text-muted-foreground text-xs">
                  Collected {money(drawer.collected)} · Expenses {money(drawer.expenses)}
                </p>
              </CardContent>
            </Card>
          ))}
          {!loading && (report?.drawers.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">No drawer activity yet.</p>
          ) : null}
        </div>
      </section>

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
                This expense is deducted from your drawer.
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
