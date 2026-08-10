import { Button } from "@blackbox/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Blackbox</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Next.js web app consuming shared{" "}
        <code className="text-foreground">@blackbox/ui</code> components.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
