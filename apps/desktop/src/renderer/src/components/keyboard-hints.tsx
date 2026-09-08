export function KeyboardHints({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null;
  return (
    <p className="text-muted-foreground border-border mt-6 border-t pt-3 text-xs">
      {hints.join(" · ")}
    </p>
  );
}

export const KEYBOARD_HINT_ENTER =
  "Enter next · Shift+Enter previous · Shift+Tab back";
export const KEYBOARD_HINT_SAVE = "F10 / Ctrl+Enter save";
export const KEYBOARD_HINT_SCAN = "F2 / Ctrl+B scan";
export const KEYBOARD_HINT_ADD = "F3 / Ctrl+I add";
export const KEYBOARD_HINT_NEW = "F4 / Ctrl+N new";
export const KEYBOARD_HINT_LIST_ROWS = "Tab rows · Enter open or edit";
export const KEYBOARD_HINT_PICK_ROWS = "Tab rows · Enter select";
export const KEYBOARD_HINT_APP_NAV =
  "Alt+R new return · Alt+B brand · Alt+C category · Alt+G vendor group · Alt+D dashboard · Alt+W warehouses · Alt+I/P/V open menu · 1–9 pick item · ←/→ nav menu";
