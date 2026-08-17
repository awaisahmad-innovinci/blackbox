"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox, Lock, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@blackbox/ui/alert";
import { Button } from "@blackbox/ui/button";
import { Skeleton } from "@blackbox/ui/skeleton";
import { ApiError, toUserFacingError } from "@/lib/api-error";

export function PageError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const status = error instanceof ApiError ? error.status : undefined;
  const title =
    status === 403
      ? "Forbidden"
      : status === 404
        ? "Not found"
        : status === 401
          ? "Session expired"
          : "Something went wrong";

  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{toUserFacingError(error)}</span>
        {onRetry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-destructive/30 bg-background w-fit"
            onClick={onRetry}
          >
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="bb-surface flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <Inbox className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          {message}
        </p>
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bb-surface overflow-hidden" aria-busy="true" aria-label="Loading table">
      <div className="bg-muted/50 border-b px-4 py-3">
        <Skeleton className="h-3 w-full max-w-md" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="bb-surface flex flex-col items-start gap-3 p-6 sm:p-8">
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Lock className="size-4" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Insufficient permission
        </h2>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          You do not have access to this section. Contact a workspace
          administrator if you need it enabled.
        </p>
      </div>
    </div>
  );
}
