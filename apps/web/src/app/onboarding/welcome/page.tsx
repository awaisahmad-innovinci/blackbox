"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, PartyPopper } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blackbox/ui/card";
import { useAuth } from "@/components/auth-provider";
import { getCurrentTenant } from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";
import { FormError } from "@/components/section-card";

export default function OnboardingWelcomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tenant = await getCurrentTenant();
        if (cancelled) return;
        if (!tenant.onboardingCompleted) {
          router.replace("/onboarding/business");
          return;
        }
        setBusinessName(tenant.name);
      } catch (err) {
        if (!cancelled) {
          setError(toUserFacingError(err));
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (booting) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const username = user?.username ?? user?.fullName ?? "there";

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-full">
          <PartyPopper className="size-5" aria-hidden />
        </div>
        <CardTitle className="font-display text-xl">Welcome</CardTitle>
        <CardDescription>Your workspace is ready.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormError>{error}</FormError>
        <p className="text-base leading-relaxed">
          Welcome on Blackbox,{" "}
          <span className="font-medium">{username}</span>. Your business{" "}
          <span className="font-medium">{businessName ?? "…"}</span> is now on
          Blackbox.
        </p>
        <Button className="w-full" onClick={() => router.push("/app")}>
          Go to dashboard
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
