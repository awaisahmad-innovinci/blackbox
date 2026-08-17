"use client";

import type { ReactNode } from "react";
import type { Permission } from "@blackbox/shared";
import { useAuth } from "@/components/auth-provider";
import { ForbiddenState, LoadingState } from "@/components/page-state";

export function RequirePermission({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  const { status, hasPermission } = useAuth();

  if (status === "loading") {
    return <LoadingState label="Checking permissions" />;
  }

  if (!hasPermission(...permissions)) {
    return <ForbiddenState />;
  }

  return children;
}
