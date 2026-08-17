"use client";

import type { ReactNode } from "react";
import { cn } from "@blackbox/ui/lib/utils";

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bb-surface overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({
  className,
  ...props
}: React.ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full min-w-[640px] text-left text-sm", className)}
      {...props}
    />
  );
}

export function THead({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "bg-muted/60 text-muted-foreground border-b text-xs font-medium tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th className={cn("px-4 py-3 font-medium", className)} {...props} />
  );
}

export function TBody({
  className,
  ...props
}: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border/80", className)} {...props} />;
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "hover:bg-muted/40 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
