import { useEffect, useRef } from "react";

const SCAN_GAP_MS = 40;
const MIN_SCAN_LEN = 3;

function isPrintable(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1;
}

function stripLastTypedChar(el: HTMLInputElement | HTMLTextAreaElement): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  if (start < 1 || start !== end) return;
  const next = el.value.slice(0, start - 1) + el.value.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(start - 1, start - 1);
}

/**
 * Capture HID barcode-scanner bursts (fast keys + Enter) and route them
 * to onScan instead of the focused field.
 */
export function useBarcodeScanCapture(
  enabled: boolean,
  onScan: (code: string) => void,
  barcodeInput: HTMLInputElement | null,
): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const barcodeRef = useRef(barcodeInput);
  barcodeRef.current = barcodeInput;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastAt = 0;
    let burst = false;
    let leakedFrom: HTMLInputElement | HTMLTextAreaElement | null = null;
    let strippedLeak = false;

    function reset(): void {
      buffer = "";
      lastAt = 0;
      burst = false;
      leakedFrom = null;
      strippedLeak = false;
    }

    function maybeStripLeak(): void {
      if (strippedLeak || !leakedFrom) return;
      if (leakedFrom === barcodeRef.current) return;
      stripLastTypedChar(leakedFrom);
      strippedLeak = true;
    }

    function onKeyDown(event: KeyboardEvent): void {
      const now = performance.now();
      const gap = now - lastAt;

      if (event.key === "Enter") {
        const code = buffer;
        const isScan = burst && code.length >= MIN_SCAN_LEN;
        if (isScan) {
          event.preventDefault();
          event.stopPropagation();
          maybeStripLeak();
          reset();
          onScanRef.current(code);
          return;
        }
        reset();
        return;
      }

      if (!isPrintable(event)) {
        if (gap > SCAN_GAP_MS) reset();
        return;
      }

      if (lastAt === 0 || gap > SCAN_GAP_MS) {
        buffer = event.key;
        lastAt = now;
        burst = false;
        strippedLeak = false;
        const target = event.target;
        leakedFrom =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
            ? target
            : null;
        return;
      }

      burst = true;
      buffer += event.key;
      lastAt = now;
      event.preventDefault();
      event.stopPropagation();
      maybeStripLeak();
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled]);
}
