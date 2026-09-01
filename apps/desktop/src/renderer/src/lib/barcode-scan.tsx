import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

const SCAN_GAP_MS = 40;
const MIN_SCAN_LEN = 3;

export type BarcodeScanKind = "barcode" | "search";
export type BarcodeScanLayer = "main" | "dialog";

export type BarcodeScanTargetOptions = {
  kind: BarcodeScanKind;
  layer?: BarcodeScanLayer;
  enabled: boolean;
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

function resolveTarget(targets: RegisteredTarget[]): RegisteredTarget | null {
  const active = targets.filter((t) => t.enabled);

  const dialogBarcode = active.find(
    (t) => t.kind === "barcode" && t.layer === "dialog",
  );
  if (dialogBarcode) return dialogBarcode;

  const mainBarcode = active.find(
    (t) => t.kind === "barcode" && (t.layer ?? "main") === "main",
  );
  if (mainBarcode) return mainBarcode;

  const dialogSearch = active.find(
    (t) => t.kind === "search" && t.layer === "dialog",
  );
  if (dialogSearch) return dialogSearch;

  const mainSearch = active.find(
    (t) => t.kind === "search" && (t.layer ?? "main") === "main",
  );
  if (mainSearch) return mainSearch;

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
    let buffer = "";
    let lastAt = 0;
    let leakedFrom: HTMLInputElement | HTMLTextAreaElement | null = null;
    let strippedLeak = false;

    function reset(): void {
      buffer = "";
      lastAt = 0;
      leakedFrom = null;
      strippedLeak = false;
    }

    function maybeStripLeak(): void {
      if (strippedLeak || !leakedFrom) return;
      stripLastTypedChar(leakedFrom);
      strippedLeak = true;
    }

    function deliverScan(code: string): void {
      const target = resolveTarget([...targetsRef.current.values()]);
      if (!target) return;
      target.onScan(code);
      target.onComplete?.(code);
    }

    function onKeyDown(event: KeyboardEvent): void {
      const now = performance.now();
      const gap = now - lastAt;

      if (event.key === "Enter") {
        const code = buffer;
        if (code.length >= MIN_SCAN_LEN) {
          event.preventDefault();
          event.stopPropagation();
          maybeStripLeak();
          reset();
          deliverScan(code);
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
        strippedLeak = false;
        const target = event.target;
        leakedFrom =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
            ? target
            : null;
        return;
      }

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
      onScan: (code) => onScanRef.current(code),
      onComplete: onCompleteRef.current
        ? (code) => onCompleteRef.current?.(code)
        : undefined,
    };
    registry.register(entry);
    return () => registry.unregister(id);
  }, [registry, kind, layer, enabled]);
}
