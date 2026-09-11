import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  debugInputFreeze,
  installInputFreezeProbe,
  snapshotModalState,
} from "@renderer/lib/debug-input-freeze";
import { releaseStuckModalState } from "@renderer/lib/release-stuck-modal-state";

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

let resetWedgeFn: (() => void) | null = null;

/** Clear buffered wedge input — call when closing scan dialogs or on navigation. */
export function resetBarcodeWedge(): void {
  resetWedgeFn?.();
}

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
  if (el.isContentEditable) return true;
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

function activeFieldType(): FieldInPath {
  const active = document.activeElement;
  if (isScanField(active)) return "scan";
  if (isEditableField(active)) return "editable";
  return null;
}

function hasOpenModal(): boolean {
  return (
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"]',
    ) != null ||
    document.querySelector(
      '[data-slot="alert-dialog-content"][data-state="open"]',
    ) != null
  );
}

function shouldBlockWedgeForModal(event: KeyboardEvent): boolean {
  if (!hasOpenModal()) return false;
  return fieldInEventPath(event) !== "scan";
}

function shouldBailFromWedge(event: KeyboardEvent): boolean {
  if (event.isComposing) return true;
  if (event.repeat) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) return true;

  const pathField = fieldInEventPath(event);
  if (pathField === "scan") return true;
  if (pathField === "editable") return true;
  if (isEditableField(event.target)) return true;

  const active = activeFieldType();
  if (active === "scan") return true;
  if (active === "editable") return true;

  return false;
}

function isInsideOpenDialog(el: HTMLElement | null): boolean {
  if (!el) return false;
  const dialog = el.closest('[data-slot="dialog-content"]');
  if (!(dialog instanceof HTMLElement)) return false;
  return dialog.getAttribute("data-state") === "open";
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
  const el = target.inputRef?.current ?? null;
  if (!isScanFieldVisible(el)) return false;
  if (target.layer === "dialog") {
    return isInsideOpenDialog(el);
  }
  return true;
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
    installInputFreezeProbe();

    let buffer = "";
    let lastAt = 0;
    let wedgeActive = false;

    function reset(): void {
      buffer = "";
      lastAt = 0;
      wedgeActive = false;
    }

    resetWedgeFn = reset;

    function deliverScan(code: string, target: RegisteredTarget): void {
      target.onScan(code);
      target.onComplete?.(code);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (shouldBailFromWedge(event)) {
        reset();
        return;
      }

      if (shouldBlockWedgeForModal(event)) {
        reset();
        return;
      }

      const allTargets = [...targetsRef.current.values()];
      const visibleTarget = resolveVisibleTarget(allTargets);

      if (!visibleTarget) {
        reset();
        return;
      }

      const now = performance.now();
      const gap = lastAt === 0 ? Infinity : now - lastAt;

      if (event.key === "Enter") {
        if (wedgeActive && buffer.length >= MIN_SCAN_LEN) {
          if (shouldBailFromWedge(event)) {
            reset();
            return;
          }
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

      if (shouldBailFromWedge(event) || shouldBlockWedgeForModal(event)) {
        reset();
        return;
      }

      wedgeActive = true;
      buffer += event.key;
      lastAt = now;
      // #region agent log
      debugInputFreeze(
        "D",
        "barcode-scan.tsx:wedgePreventDefault",
        "wedge swallowing printable key",
        {
          key: event.key,
          buffer,
          ...snapshotModalState(),
        },
      );
      // #endregion
      event.preventDefault();
      event.stopPropagation();
    }

    function onMouseDown(): void {
      reset();
    }

    function onFocusIn(event: FocusEvent): void {
      const target = event.target;
      if (isEditableField(target) && !isScanField(target)) {
        reset();
      }
    }

    function onHashChange(): void {
      reset();
      releaseStuckModalState();
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("hashchange", onHashChange);

    return () => {
      resetWedgeFn = null;
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("hashchange", onHashChange);
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

  useEffect(() => {
    if (enabled) return;
    resetBarcodeWedge();
  }, [enabled]);

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
