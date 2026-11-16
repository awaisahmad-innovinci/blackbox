"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { LoadingState } from "@/components/page-state";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return <LoadingState label="Checking permissions" />;
  }

  return (
    <RequirePermission permissions={["web.access"]}>
      <AppShell>{children}</AppShell>
    </RequirePermission>
  );
}
