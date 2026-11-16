import { Skeleton } from "@blackbox/ui/skeleton";

export default function Loading() {
  return (
    <div className="bb-page" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 border-b border-border pb-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
