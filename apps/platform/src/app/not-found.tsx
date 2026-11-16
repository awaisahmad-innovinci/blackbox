import Link from "next/link";
import { Button } from "@blackbox/ui/button";

export default function NotFound() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <p className="text-muted-foreground text-sm">Error 404</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="text-muted-foreground text-sm">
          The link may be old or typed wrong. Go back to the tenant list to continue.
        </p>
        <Button asChild>
          <Link href="/">Go to tenants</Link>
        </Button>
      </div>
    </main>
  );
}
