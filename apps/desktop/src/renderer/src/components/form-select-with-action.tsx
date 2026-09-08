import type { ReactNode, SelectHTMLAttributes } from "react";
import { Button } from "@blackbox/ui/button";
import { Label } from "@blackbox/ui/label";

const SELECT_CLASS =
  "border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm";

export function FormSelectWithAction({
  id,
  label,
  actionLabel,
  onAction,
  children,
  className,
  ...selectProps
}: {
  id: string;
  label: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <select id={id} className={SELECT_CLASS} {...selectProps}>
          {children}
        </select>
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2 text-xs"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
