import { useEffect, useState } from "react";
import type { DashboardSummary } from "@blackbox/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@blackbox/ui/card";
import { Skeleton } from "@blackbox/ui/skeleton";
import { dashboardApi } from "@renderer/lib/api/dashboard";
import { ApiError } from "@renderer/lib/api/client";

const CARDS: {
  key: keyof DashboardSummary;
  label: string;
  hint: string;
}[] = [
  { key: "totalProducts", label: "Products", hint: "Catalog products" },
  { key: "totalSkus", label: "SKUs", hint: "Sellable variants" },
  { key: "totalStockLines", label: "Stock lines", hint: "Warehouse stock rows" },
  { key: "lowStockItems", label: "Low stock", hint: "At or below reorder" },
  {
    key: "pendingPurchaseOrders",
    label: "Pending POs",
    hint: "Draft / submitted / partial",
  },
  {
    key: "recentReceipts",
    label: "Recent receipts",
    hint: "Posted in last 30 days",
  },
];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void dashboardApi
      .getSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load dashboard");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Demo Store inventory overview from the API.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Card key={card.key} className="gap-3 py-5">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {loading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {summary?.[card.key] ?? "—"}
                </p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
