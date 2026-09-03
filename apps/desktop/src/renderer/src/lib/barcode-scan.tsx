import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

const SCAN_GAP_MS = 40;
const MIN_SCAN_LEN = 3;

export const BARCODE_SCAN_INPUT = "data-barcode-scan-input";

export function barcodeScanInputProps(): { [BARCODE_SCAN_INPUT]: true } {
  return { [BARCODE_SCAN_INPUT]: true };
}

export type BarcodeScanKind = "barcode" | "search";
export type BarcodeScanLayer = "main" | "dialog";

export type BarcodeScanTargetOptions = {
  kind: BarcodeScanKind;
  layer?: BarcodeScanLayer;
  enabled: boolean;
  inputRef?: RefObject<HTMLElement | null>;
  onScan: (code: string) => void;
  onComplete?: (code: string) => void;
};

type RegisteredTarget = BarcodeScanTargetOptions & {
  id: symbol;
};

type BarcodeScanRegistry = {
  register: (target: RegisteredTarget) => void;
  unregister: (id: symbol) => void;
};

const BarcodeScanContext = createContext<BarcodeScanRegistry | null>(null);

function isPrintable(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1;
}

function isScanField(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && el.hasAttribute(BARCODE_SCAN_INPUT);
}

function isEditableField(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }
  return false;
}

type FieldInPath = "scan" | "editable" | null;

function fieldInEventPath(event: KeyboardEvent): FieldInPath {
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement)) continue;
    if (isScanField(node)) return "scan";
    if (isEditableField(node)) return "editable";
  }
  return null;
}

function eventTargetTag(el: EventTarget | null): string {
  if (el instanceof HTMLElement) {
    return `${el.tagName}${el instanceof HTMLInputElement ? `[${el.type}]` : ""}`;
  }
  return String(el ?? "null");
}

// #region agent log
function debugBarcodeLog(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
): void {
  const payload = {
    hypothesisId,
    location: "barcode-scan.tsx",
    message,
    data: { platform: window.blackbox?.platform, ...data },
    runId: "win32-no-global-wedge",
  };
  void window.blackbox?.debugLog?.(payload);
  fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b2ecf6",
    },
    body: JSON.stringify({ sessionId: "b2ecf6", ...payload, timestamp: Date.now() }),
  }).catch(() => {});
}
// #endregion

function isScanFieldVisible(el: HTMLElement | null): boolean {
  if (!el?.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const hit = document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
  return hit === el || (hit instanceof Node && el.contains(hit));
}

function targetIsVisible(target: RegisteredTarget): boolean {
  return isScanFieldVisible(target.inputRef?.current ?? null);
}

function resolveVisibleTarget(
  targets: RegisteredTarget[],
): RegisteredTarget | null {
  const active = targets.filter((t) => t.enabled);
  const priority: Array<(t: RegisteredTarget) => boolean> = [
    (t) => t.kind === "barcode" && t.layer === "dialog",
    (t) => t.kind === "barcode" && (t.layer ?? "main") === "main",
    (t) => t.kind === "search" && t.layer === "dialog",
    (t) => t.kind === "search" && (t.layer ?? "main") === "main",
  ];
  for (const match of priority) {
    const found = active.find(match);
    if (found && targetIsVisible(found)) return found;
  }
  return null;
}

export function BarcodeScanProvider({ children }: { children: ReactNode }) {
  const targetsRef = useRef<Map<symbol, RegisteredTarget>>(new Map());

  const registry = useMemo<BarcodeScanRegistry>(
    () => ({
      register(target) {
        targetsRef.current.set(target.id, target);
      },
      unregister(id) {
        targetsRef.current.delete(id);
      },
    }),
    [],
  );

  useEffect(() => {
    const platform = window.blackbox?.platform ?? "unknown";

    // Packaged Windows builds deliver scanner/keyboard events with timing that
    // falsely triggers the global wedge and preventDefault() in normal fields.
    // Scanning still works via native input when the barcode/search field is focused.
    if (platform === "win32") {
      // #region agent log
      debugBarcodeLog("H-WIN", "global wedge disabled on Windows", {
        platform,
      });
      // #endregion
      return;
    }

    let buffer = "";
    let lastAt = 0;
    let wedgeActive = false;

    function reset(): void {
      buffer = "";
      lastAt = 0;
      wedgeActive = false;
    }

    function deliverScan(code: string, target: RegisteredTarget): void {
      target.onScan(code);
      target.onComplete?.(code);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat) return;

      const pathField = fieldInEventPath(event);
      const active = event.target;
      const now = performance.now();
      const gap = lastAt === 0 ? Infinity : now - lastAt;

      if (pathField === "scan" || pathField === "editable") {
        reset();
        return;
      }

      const visibleTarget = resolveVisibleTarget([
        ...targetsRef.current.values(),
      ]);

      if (!visibleTarget) {
        reset();
        return;
      }

      if (event.key === "Enter") {
        if (wedgeActive && buffer.length >= MIN_SCAN_LEN) {
          event.preventDefault();
          event.stopPropagation();
          deliverScan(buffer, visibleTarget);
          reset();
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
        wedgeActive = false;
        return;
      }

      if (!wedgeActive) {
        wedgeActive = true;
      }

      buffer += event.key;
      lastAt = now;
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return (
    <BarcodeScanContext.Provider value={registry}>
      {children}
    </BarcodeScanContext.Provider>
  );
}

/** Register a barcode or search field as the scan target for the current view. */
export function useBarcodeScanTarget({
  kind,
  layer = "main",
  enabled,
  inputRef,
  onScan,
  onComplete,
}: BarcodeScanTargetOptions): void {
  const registry = useContext(BarcodeScanContext);
  const onScanRef = useRef(onScan);
  const onCompleteRef = useRef(onComplete);
  onScanRef.current = onScan;
  onCompleteRef.current = onComplete;

  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) {
    idRef.current = Symbol("barcode-scan-target");
  }

  useEffect(() => {
    if (!registry) return;
    const id = idRef.current!;
    const entry: RegisteredTarget = {
      id,
      kind,
      layer,
      enabled,
      inputRef,
      onScan: (code) => onScanRef.current(code),
      onComplete: onCompleteRef.current
        ? (code) => onCompleteRef.current?.(code)
        : undefined,
    };
    registry.register(entry);
    return () => registry.unregister(id);
  }, [registry, kind, layer, enabled, inputRef]);

  // Windows: no global wedge — fire onComplete when Enter is pressed in the scan input.
  useEffect(() => {
    if (window.blackbox?.platform !== "win32" || !enabled) return;

    let attached: HTMLInputElement | null = null;

    function onEnter(event: KeyboardEvent): void {
      if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) {
        return;
      }
      const code = event.target.value.trim();
      if (code.length < MIN_SCAN_LEN) return;
      onScanRef.current(code);
      onCompleteRef.current?.(code);
      // #region agent log
      debugBarcodeLog("H-WIN", "scan enter handled on input", {
        codeLen: code.length,
        kind,
      });
      // #endregion
    }

    function tryAttach(): void {
      const el = inputRef?.current;
      if (!(el instanceof HTMLInputElement) || el === attached) return;
      attached?.removeEventListener("keydown", onEnter);
      attached = el;
      el.addEventListener("keydown", onEnter);
    }

    tryAttach();
    const poll = window.setInterval(tryAttach, 250);

    return () => {
      window.clearInterval(poll);
      attached?.removeEventListener("keydown", onEnter);
    };
  }, [enabled, inputRef, kind]);
}
