"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getCurrentTenant } from "@/lib/admin-api";

const STEPS = [
  { href: "/onboarding/business", label: "Business" },
  { href: "/onboarding/location", label: "Location" },
  { href: "/onboarding/welcome", label: "Welcome" },
] as const;

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, status, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/");
      return;
    }
    if (status !== "authenticated" || !user) {
      return;
    }

    if (!hasPermission("tenant.settings.read")) {
      router.replace("/app");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const tenant = await getCurrentTenant();
        if (cancelled) return;
        if (tenant.onboardingCompleted && pathname !== "/onboarding/welcome") {
          router.replace("/app");
        }
      } catch {
        if (!cancelled) {
          router.replace("/");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user, hasPermission, router, pathname]);

  if (status === "loading" || status === "anonymous" || !user) {
    return (
      <div className="bb-auth-canvas flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const stepIndex = Math.max(
    0,
    STEPS.findIndex((s) => pathname.startsWith(s.href)),
  );

  return (
    <div className="bb-auth-canvas relative flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-xs font-bold">
            Bx
          </div>
          <p className="font-display text-lg font-semibold tracking-tight">
            Blackbox
          </p>
        </div>
        <ol className="text-muted-foreground hidden items-center gap-2 text-xs sm:flex">
          {STEPS.map((step, i) => (
            <li key={step.href} className="flex items-center gap-2">
              <span
                className={
                  i <= stepIndex
                    ? "text-foreground font-medium"
                    : undefined
                }
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 ? <span aria-hidden>·</span> : null}
            </li>
          ))}
        </ol>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 pb-16">
        {children}
      </main>
    </div>
  );
}
