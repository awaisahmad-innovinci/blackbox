"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@blackbox/ui/button";
import { clearPlatformToken } from "@/lib/api";

export function PlatformNav() {
  const pathname = usePathname();
  const tenantsActive = pathname === "/";
  const rolesActive = pathname === "/roles" || pathname.startsWith("/roles/");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant={tenantsActive ? "secondary" : "ghost"} size="sm">
        <Link href="/">Tenants</Link>
      </Button>
      <Button asChild variant={rolesActive ? "secondary" : "ghost"} size="sm">
        <Link href="/roles">Roles</Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          clearPlatformToken();
          window.location.href = "/";
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
