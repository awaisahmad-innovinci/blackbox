"use client";

import { Checkbox } from "@blackbox/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@blackbox/ui/radio-group";
import { Skeleton } from "@blackbox/ui/skeleton";
import { cn } from "@blackbox/ui/lib/utils";
import { RoleTypeBadge } from "@/components/status-badges";
import type { RoleDto } from "@/lib/admin-api";

export function RoleChecklist({
  roles,
  selectedIds,
  onChange,
  disabled = false,
  loading = false,
  selection = "multiple",
  className,
}: {
  roles: RoleDto[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  /** `single` is a radio list: one role replaces the previous choice. */
  selection?: "multiple" | "single";
  className?: string;
}) {
  if (loading) {
    return (
      <div
        className={cn("space-y-3 rounded-md border p-3", className)}
        aria-busy="true"
        aria-label="Loading roles"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-4 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-3 text-sm">
        No roles available.
      </p>
    );
  }

  const roleRows = roles.map((role) => (
    <span key={role.id} className="min-w-0 flex-1 space-y-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{role.name}</span>
        <RoleTypeBadge isSystem={role.isSystem} />
      </span>
      <span className="text-muted-foreground block font-mono text-xs">
        {role.key}
      </span>
    </span>
  ));

  if (selection === "single") {
    return (
      <RadioGroup
        className={cn(
          "max-h-56 gap-1 overflow-y-auto rounded-md border p-2",
          className,
        )}
        value={selectedIds[0] ?? ""}
        disabled={disabled}
        aria-label="Roles"
        onValueChange={(roleId) => onChange([roleId])}
      >
        {roles.map((role, index) => (
          <label
            key={role.id}
            className={cn(
              "hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <RadioGroupItem className="mt-0.5" value={role.id} />
            {roleRows[index]}
          </label>
        ))}
      </RadioGroup>
    );
  }

  return (
    <div
      className={cn(
        "max-h-56 space-y-1 overflow-y-auto rounded-md border p-2",
        className,
      )}
      role="group"
      aria-label="Roles"
    >
      {roles.map((role, index) => {
        const checked = selectedIds.includes(role.id);
        return (
          <label
            key={role.id}
            className={cn(
              "hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Checkbox
              className="mt-0.5"
              checked={checked}
              disabled={disabled}
              onCheckedChange={(value) => {
                onChange(
                  value
                    ? [...selectedIds, role.id]
                    : selectedIds.filter((id) => id !== role.id),
                );
              }}
            />
            {roleRows[index]}
          </label>
        );
      })}
    </div>
  );
}
