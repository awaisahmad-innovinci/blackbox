"use client";

import { useEffect } from "react";
import { Button } from "@blackbox/ui/button";

/** Shown when a page crashes, instead of a blank screen (review W3). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="bg-background flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">This page stopped working</h1>
        <p className="text-muted-foreground text-sm">
          Your data is safe. Try again, and if it keeps happening, reload the page.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </main>
  );
}
