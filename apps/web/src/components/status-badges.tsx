"use client";

import { Badge } from "@blackbox/ui/badge";

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "outline"}>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

export function RoleTypeBadge({ isSystem }: { isSystem: boolean }) {
  return (
    <Badge variant={isSystem ? "info" : "secondary"}>
      {isSystem ? "System" : "Custom"}
    </Badge>
  );
}

export function DeviceStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "trusted") {
    return <Badge variant="success">Trusted</Badge>;
  }
  if (normalized === "revoked") {
    return <Badge variant="destructive">Revoked</Badge>;
  }
  if (normalized === "pending") {
    return <Badge variant="warning">Pending</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}
