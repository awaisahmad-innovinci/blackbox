"use client";

import { AppShell } from "@/components/app-shell";
import { RequirePermission } from "@/components/require-permission";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequirePermission permissions={["web.access"]}>
      <AppShell>{children}</AppShell>
    </RequirePermission>
  );
}
