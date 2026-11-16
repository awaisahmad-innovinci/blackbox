"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@blackbox/shared";
import { useAuth } from "@/components/auth-provider";
import { getCurrentTenant } from "@/lib/admin-api";

// ponytail: one fetch per page load; reload picks up a currency change from Settings.
let cached: Promise<string | null> | null = null;

/** The shop's currency code (PKR when unknown or not readable by this user). */
export function useCurrency(): {
  currency: string | null;
  money: (value: number) => string;
} {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("tenant.settings.read");
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    cached ??= getCurrentTenant()
      .then((t) => t.currency)
      .catch(() => {
        cached = null;
        return null;
      });
    void cached.then((code) => {
      if (!cancelled) setCurrency(code);
    });
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  return { currency, money: (value: number) => formatCurrency(value, currency) };
}
