import { useEffect, useRef } from "react";
import {
  matchFormShortcut,
  type FormShortcutAction,
} from "@blackbox/ui/lib/form-keyboard";

export type PageKeyboardHandlers = {
  onSave?: () => void;
  onScan?: () => void;
  onAddItem?: () => void;
  onNew?: () => void;
  enabled?: boolean;
};

export function usePageKeyboard({
  onSave,
  onScan,
  onAddItem,
  onNew,
  enabled = true,
}: PageKeyboardHandlers): void {
  const handlersRef = useRef({ onSave, onScan, onAddItem, onNew });
  handlersRef.current = { onSave, onScan, onAddItem, onNew };

  useEffect(() => {
    if (!enabled) return;

    function run(action: FormShortcutAction): void {
      const h = handlersRef.current;

      if (action === "save") {
        h.onSave?.();
        return;
      }

      if (action === "scan") h.onScan?.();
      if (action === "add") h.onAddItem?.();
      if (action === "new") h.onNew?.();
    }

    function onKeyDown(event: KeyboardEvent): void {
      const action = matchFormShortcut(event);
      if (!action) return;

      const h = handlersRef.current;
      if (action === "save" && !h.onSave) return;
      if (action === "scan" && !h.onScan) return;
      if (action === "add" && !h.onAddItem) return;
      if (action === "new" && !h.onNew) return;

      run(action);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
