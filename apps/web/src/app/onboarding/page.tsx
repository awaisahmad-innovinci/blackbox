"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/onboarding/business");
  }, [router]);

  return (
    <p className="text-muted-foreground text-center text-sm">Loading…</p>
  );
}
