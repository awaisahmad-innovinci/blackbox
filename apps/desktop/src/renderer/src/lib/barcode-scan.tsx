import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

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

  useEffect(() => {
    if (!enabled) return;

    let attached: HTMLInputElement | null = null;

    function onEnter(event: KeyboardEvent): void {
      if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) {
        return;
      }
      const code = event.target.value.trim();
      if (code.length < MIN_SCAN_LEN) return;
      onScanRef.current(code);
      onCompleteRef.current?.(code);
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
  }, [enabled, inputRef]);
}
