"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blackbox/ui/card";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import {
  completeOnboardingLocation,
  getCurrentTenant,
} from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";
import { FieldHint, FormError } from "@/components/section-card";

export default function OnboardingLocationPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tenant = await getCurrentTenant();
        if (cancelled) return;
        if (tenant.onboardingCompleted) {
          router.replace("/app");
          return;
        }
        if (!tenant.businessType || !tenant.country || !tenant.currency) {
          router.replace("/onboarding/business");
          return;
        }
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const address = String(form.get("address") ?? "").trim();
    try {
      await completeOnboardingLocation({
        name: String(form.get("name") ?? ""),
        city: String(form.get("city") ?? ""),
        ...(address ? { address } : {}),
      });
      router.push("/onboarding/welcome");
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-xl">Location</CardTitle>
        <CardDescription>
          Add your first store or site. Address is optional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="location-name">Location name</Label>
            <Input
              id="location-name"
              name="name"
              required
              placeholder="Main store"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" required placeholder="Karachi" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              placeholder="Street, area (optional)"
            />
            <FieldHint>Optional — you can add more detail later.</FieldHint>
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Confirming…
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
