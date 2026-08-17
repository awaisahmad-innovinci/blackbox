"use client";

import type { ReactNode } from "react";
import { cn } from "@blackbox/ui/lib/utils";

export function SectionCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bb-surface", className)}>
      {title || description ? (
        <div className="border-b px-5 py-4">
          {title ? (
            <h2 className="font-display text-base font-semibold tracking-tight">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-4 p-5">{children}</div>
      {footer ? (
        <div className="bg-muted/30 flex items-center justify-end gap-2 border-t px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-destructive text-sm" role="alert">
      {children}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-success text-sm" role="status">
      {children}
    </p>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-xs leading-relaxed">{children}</p>;
}
