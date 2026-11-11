import { useEffect, useRef, useState } from "react";
import { DEFAULT_POS_CARD_TERMINAL_SETTINGS } from "@blackbox/shared";
import type { SalePaymentMode } from "./resolve-card-terminal-amount";

const DEBOUNCE_MS = 300;
const DEFERRED_RETRY_MS = 100;

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

function roundCardAmount(amount: number): number {
  return Math.round(amount * 10000) / 10000;
}

export function useCardTerminalAmountSync({
  paymentMode,
  cardAmount,
  linesCount,
}: UseCardTerminalAmountSyncArgs): CardTerminalSyncStatus {
  const [status, setStatus] = useState<CardTerminalSyncStatus>({
    state: "idle",
  });
  const [settingsReady, setSettingsReady] = useState(0);
  const integrationEnabledRef = useRef(false);
  const hidKeysRef = useRef(
    DEFAULT_POS_CARD_TERMINAL_SETTINGS.connection.type === "hid-keys",
  );
  const lastSentRef = useRef<number | null>(null);
  const pendingAmountRef = useRef<number | null>(null);
  const deferredRetryForRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef<number | null>(null);
  const paymentModeRef = useRef(paymentMode);
  const cardAmountRef = useRef(cardAmount);
  const linesCountRef = useRef(linesCount);
  const pushHeldRef = useRef<(amount: number) => Promise<void>>(
    async () => undefined,
  );

  paymentModeRef.current = paymentMode;
  cardAmountRef.current = cardAmount;
  linesCountRef.current = linesCount;

  function heldAmountStillCurrent(amount: number): boolean {
    const current = cardAmountRef.current;
    const rounded =
      current != null && current > 0 ? roundCardAmount(current) : null;
    return (
      linesCountRef.current > 0 &&
      paymentModeRef.current !== "cash" &&
      rounded === amount
    );
  }

  pushHeldRef.current = async (amount: number) => {
    if (!heldAmountStillCurrent(amount)) {
      pendingAmountRef.current = null;
      return;
    }
    if (lastSentRef.current === amount) {
      pendingAmountRef.current = null;
      return;
    }
    if (sendingRef.current === amount) return;

    if (!integrationEnabledRef.current) {
      pendingAmountRef.current = null;
      setStatus({ state: "idle" });
      return;
    }
    const push = window.blackbox?.pos?.pushCardAmount;
    if (!push) {
      pendingAmountRef.current = null;
      setStatus({ state: "idle" });
      return;
    }

    if (hidKeysRef.current && document.hasFocus()) {
      pendingAmountRef.current = amount;
      setStatus({ state: "pending" });
      return;
    }

    sendingRef.current = amount;
    const result = await push(amount);
    if (sendingRef.current === amount) sendingRef.current = null;
    if (!heldAmountStillCurrent(amount)) return;

    if (result.ok) {
      pendingAmountRef.current = null;
      deferredRetryForRef.current = null;
      lastSentRef.current = amount;
      setStatus({ state: "sent", amount });
      return;
    }
    if (result.deferred) {
      pendingAmountRef.current = amount;
      setStatus({ state: "pending" });
      if (!document.hasFocus() && deferredRetryForRef.current !== amount) {
        deferredRetryForRef.current = amount;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (pendingAmountRef.current === amount && !document.hasFocus()) {
            void pushHeldRef.current(amount);
          }
        }, DEFERRED_RETRY_MS);
      }
      return;
    }
    pendingAmountRef.current = null;
    setStatus({ state: "error", message: result.message });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved =
        (await window.blackbox?.pos?.getCardTerminalSettings?.()) ??
        DEFAULT_POS_CARD_TERMINAL_SETTINGS;
      if (cancelled) return;
      integrationEnabledRef.current = saved.enabled === true;
      hidKeysRef.current = saved.connection.type === "hid-keys";
      setSettingsReady((ready) => ready + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onWindowBlur(): void {
      deferredRetryForRef.current = null;
      const amount = pendingAmountRef.current;
      if (amount == null) return;
      const current = cardAmountRef.current;
      const rounded =
        current != null && current > 0 ? roundCardAmount(current) : null;
      if (
        linesCountRef.current === 0 ||
        paymentModeRef.current === "cash" ||
        rounded == null ||
        rounded !== amount ||
        lastSentRef.current === amount
      ) {
        pendingAmountRef.current = null;
        return;
      }
      void pushHeldRef.current(amount);
    }

    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    deferredRetryForRef.current = null;
    pendingAmountRef.current = null;

    if (linesCount === 0 || paymentMode === "cash") {
      lastSentRef.current = null;
      setStatus({ state: "idle" });
      return;
    }

    if (cardAmount == null || !(cardAmount > 0)) {
      setStatus({ state: "idle" });
      return;
    }

    const rounded = roundCardAmount(cardAmount);
    if (lastSentRef.current === rounded) return;

    setStatus({ state: "pending" });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void pushHeldRef.current(rounded);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [paymentMode, cardAmount, linesCount, settingsReady]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return status;
}
