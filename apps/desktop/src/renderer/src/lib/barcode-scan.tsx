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

function setInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
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
    let buffer = "";
    let lastAt = 0;
    let wedgeActive = false;
    let leakedFrom: HTMLInputElement | HTMLTextAreaElement | null = null;
    let leakSnapshot: string | null = null;

    function reset(): void {
      buffer = "";
      lastAt = 0;
      wedgeActive = false;
      leakedFrom = null;
      leakSnapshot = null;
    }

    function restoreLeakSnapshot(): void {
      if (!leakedFrom || leakSnapshot === null) return;
      setInputValue(leakedFrom, leakSnapshot);
      leakedFrom = null;
      leakSnapshot = null;
    }

    function deliverScan(code: string): void {
      const target = resolveVisibleTarget([...targetsRef.current.values()]);
      if (!target) return;
      target.onScan(code);
      target.onComplete?.(code);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat) return;

      const visibleTarget = resolveVisibleTarget([
        ...targetsRef.current.values(),
      ]);
      const targetEl = visibleTarget?.inputRef?.current ?? null;
      const now = performance.now();
      const gap = now - lastAt;

      if (event.key === "Enter") {
        if (wedgeActive && buffer.length >= MIN_SCAN_LEN) {
          event.preventDefault();
          event.stopPropagation();
          restoreLeakSnapshot();
          deliverScan(buffer);
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
        const active = event.target;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement
        ) {
          if (active !== targetEl) {
            leakedFrom = active;
            leakSnapshot = active.value;
          } else {
            leakedFrom = null;
            leakSnapshot = null;
          }
        } else {
          leakedFrom = null;
          leakSnapshot = null;
        }
        return;
      }

      if (!wedgeActive) {
        wedgeActive = true;
        restoreLeakSnapshot();
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
}
