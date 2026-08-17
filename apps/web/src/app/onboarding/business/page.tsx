"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  COUNTRIES,
  CURRENCIES,
  DEFAULT_CURRENCY_BY_COUNTRY,
  type CountryCode,
  type CurrencyCode,
  type BusinessType,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blackbox/ui/card";
import { Label } from "@blackbox/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blackbox/ui/select";
import { getCurrentTenant, saveOnboardingBusiness } from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";
import { FormError } from "@/components/section-card";

export default function OnboardingBusinessPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<BusinessType>("RETAIL_LIGHT");
  const [country, setCountry] = useState<CountryCode>("PK");
  const [currency, setCurrency] = useState<CurrencyCode>("PKR");
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
        if (tenant.businessType) {
          setBusinessType(tenant.businessType as BusinessType);
        }
        if (tenant.country) {
          setCountry(tenant.country as CountryCode);
        }
        if (tenant.currency) {
          setCurrency(tenant.currency as CurrencyCode);
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

  function onCountryChange(next: CountryCode) {
    setCountry(next);
    setCurrency(DEFAULT_CURRENCY_BY_COUNTRY[next]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await saveOnboardingBusiness({ businessType, country, currency });
      router.push("/onboarding/location");
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
        <CardTitle className="font-display text-xl">Business information</CardTitle>
        <CardDescription>
          Tell us how your business operates. You can refine details later in
          settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="businessType">Business type</Label>
            <Select
              value={businessType}
              onValueChange={(v) => setBusinessType(v as BusinessType)}
            >
              <SelectTrigger id="businessType" className="h-10 w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {BUSINESS_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Select
              value={country}
              onValueChange={(v) => onCountryChange(v as CountryCode)}
            >
              <SelectTrigger id="country" className="h-10 w-full">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as CurrencyCode)}
            >
              <SelectTrigger id="currency" className="h-10 w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Next"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
