"use client";

import { Checkbox } from "@blackbox/ui/checkbox";
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
  className,
}: {
  roles: RoleDto[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
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

  return (
    <div
      className={cn(
        "max-h-56 space-y-1 overflow-y-auto rounded-md border p-2",
        className,
      )}
      role="group"
      aria-label="Roles"
    >
      {roles.map((role) => {
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
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{role.name}</span>
                <RoleTypeBadge isSystem={role.isSystem} />
              </span>
              <span className="text-muted-foreground block font-mono text-xs">
                {role.key}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
