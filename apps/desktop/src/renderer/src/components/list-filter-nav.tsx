import type { ReactNode } from "react";
import { cn } from "@blackbox/ui/lib/utils";
import {
  handleEnterNavKeyDown,
  handleEnterPickerFocus,
} from "@blackbox/ui/lib/form-keyboard";

export const FILTER_SELECT_CLASS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function filterSelectProps(): {
  "data-enter-picker": "";
  onFocus: typeof handleEnterPickerFocus;
} {
  return {
    "data-enter-picker": "",
    onFocus: handleEnterPickerFocus,
  };
}

export function filterDateProps(): {
  "data-enter-picker": "";
  onFocus: typeof handleEnterPickerFocus;
} {
  return {
    "data-enter-picker": "",
    onFocus: handleEnterPickerFocus,
  };
}

export function ListFilterNav({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-enter-nav=""
      className={cn("flex flex-wrap gap-3", className)}
      onKeyDown={handleEnterNavKeyDown}
    >
      {children}
    </div>
  );
}
