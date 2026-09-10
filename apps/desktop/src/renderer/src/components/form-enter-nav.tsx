import type { ReactNode } from "react";
import {
  handleEnterNavKeyDown,
  handleEnterPickerFocus,
} from "@blackbox/ui/lib/form-keyboard";

export function FormEnterNav({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-enter-nav=""
      className={className}
      onKeyDown={handleEnterNavKeyDown}
    >
      {children}
    </div>
  );
}

export function formSelectPickerProps(): {
  "data-enter-picker": "";
  "data-enter-picker-lazy": "";
  onFocus: typeof handleEnterPickerFocus;
} {
  return {
    "data-enter-picker": "",
    "data-enter-picker-lazy": "",
    onFocus: handleEnterPickerFocus,
  };
}

export function formDatePickerProps(): {
  "data-enter-picker": "";
  "data-enter-picker-lazy": "";
  onFocus: typeof handleEnterPickerFocus;
} {
  return {
    "data-enter-picker": "",
    "data-enter-picker-lazy": "",
    onFocus: handleEnterPickerFocus,
  };
}
