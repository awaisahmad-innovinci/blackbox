import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { cn } from "@blackbox/ui/lib/utils";

export const LIST_TABLE_ROW_CLASS = cn(
  "border-border border-t outline-none",
  "hover:bg-muted/30",
  "focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
  "focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary/40",
);

export const LIST_PICK_ROW_CLASS = cn(
  "outline-none",
  "hover:bg-muted/30",
  "focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
  "focus-within:bg-primary/10 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary/40",
);

function focusFirstEditableInRow(row: HTMLTableRowElement): void {
  const field = row.querySelector<HTMLElement>(
    'input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
  );
  if (!field) return;
  field.focus();
  if (field instanceof HTMLInputElement && field.type === "text") {
    field.select();
  }
}

export function ListTableRow({
  onActivate,
  children,
  className,
}: {
  onActivate?: () => void;
  children: ReactNode;
  className?: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>): void {
    if (event.key !== "Enter" || event.defaultPrevented) return;

    if (onActivate) {
      event.preventDefault();
      onActivate();
      return;
    }

    const before = document.activeElement;
    focusFirstEditableInRow(event.currentTarget);
    if (document.activeElement !== before) {
      event.preventDefault();
    }
  }

  return (
    <tr tabIndex={0} className={cn(LIST_TABLE_ROW_CLASS, className)} onKeyDown={onKeyDown}>
      {children}
    </tr>
  );
}

export function ListTableLink(props: ComponentProps<typeof Link>) {
  return <Link tabIndex={-1} {...props} />;
}

export function ListTableFocusable({
  children,
}: {
  children: ReactElement<{ tabIndex?: number }>;
}) {
  if (!isValidElement(children)) return children;
  return cloneElement(children, { tabIndex: -1 });
}

export function ListPickRow({
  disabled,
  onActivate,
  children,
  className,
}: {
  disabled?: boolean;
  onActivate?: () => void;
  children: ReactNode;
  className?: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLLIElement>): void {
    if (disabled) return;
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (!onActivate) return;

    event.preventDefault();
    onActivate();
  }

  function onClick(): void {
    if (disabled || !onActivate) return;
    onActivate();
  }

  return (
    <li
      tabIndex={disabled ? -1 : 0}
      className={cn(
        LIST_PICK_ROW_CLASS,
        disabled && "cursor-not-allowed opacity-60",
        !disabled && onActivate && "cursor-pointer",
        className,
      )}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      {children}
    </li>
  );
}

export function ListPickFocusable({
  children,
}: {
  children: ReactElement<{ tabIndex?: number }>;
}) {
  if (!isValidElement(children)) return children;
  return cloneElement(children, { tabIndex: -1 });
}
