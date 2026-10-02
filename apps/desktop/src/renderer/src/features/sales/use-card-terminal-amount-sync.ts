import { useEffect, useRef, useState } from "react";
import { DEFAULT_POS_CARD_TERMINAL_SETTINGS } from "@blackbox/shared";
import type { SalePaymentMode } from "./resolve-card-terminal-amount";

const DEBOUNCE_MS = 300;

export type CardTerminalSyncStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "sent"; amount: number }
  | { state: "error"; message: string };

type UseCardTerminalAmountSyncArgs = {
  paymentMode: SalePaymentMode;
  cardAmount: number | null;
  linesCount: number;
};

export function useCardTerminalAmountSync({
  paymentMode,
  cardAmount,
  linesCount,
}: UseCardTerminalAmountSyncArgs): CardTerminalSyncStatus {
  const [status, setStatus] = useState<CardTerminalSyncStatus>({
    state: "idle",
  });
  const integrationEnabledRef = useRef(false);
  const lastSentRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved =
        (await window.blackbox?.pos?.getCardTerminalSettings?.()) ??
        DEFAULT_POS_CARD_TERMINAL_SETTINGS;
      if (!cancelled) {
        integrationEnabledRef.current = saved.enabled === true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (linesCount === 0 || paymentMode === "cash") {
      lastSentRef.current = null;
      setStatus({ state: "idle" });
      return;
    }

    if (cardAmount == null || !(cardAmount > 0)) {
      setStatus({ state: "idle" });
      return;
    }

    const rounded = Math.round(cardAmount * 10000) / 10000;
    if (lastSentRef.current === rounded) {
      return;
    }

    setStatus({ state: "pending" });
    timerRef.current = setTimeout(() => {
      void (async () => {
        if (!integrationEnabledRef.current) {
          setStatus({ state: "idle" });
          return;
        }
        const push = window.blackbox?.pos?.pushCardAmount;
        if (!push) {
          setStatus({ state: "idle" });
          return;
        }
        const result = await push(rounded);
        if (result.ok) {
          lastSentRef.current = rounded;
          setStatus({ state: "sent", amount: rounded });
          return;
        }
        setStatus({ state: "error", message: result.message });
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [paymentMode, cardAmount, linesCount]);

  return status;
}
