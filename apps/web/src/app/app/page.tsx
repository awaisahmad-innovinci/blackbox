"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Shield,
  MonitorSmartphone,
  Settings,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import type { Permission } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Badge } from "@blackbox/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  getCurrentTenant,
  listDevices,
  listRoles,
  listUsers,
  type TenantDto,
} from "@/lib/admin-api";

type Counts = {
  users: number | null;
  roles: number | null;
  devices: number | null;
};

const QUICK: {
  href: string;
  label: string;
  description: string;
  permission: Permission;
  icon: typeof Users;
}[] = [
  {
    href: "/app/users",
    label: "Users",
    description: "Invite people and assign roles",
    permission: "users.read",
    icon: Users,
  },
  {
    href: "/app/roles",
    label: "Roles",
    description: "Group permission keys",
    permission: "roles.read",
    icon: Shield,
  },
  {
    href: "/app/permissions",
    label: "Permissions",
    description: "Browse the catalog",
    permission: "permissions.read",
    icon: KeyRound,
  },
  {
    href: "/app/devices",
    label: "Devices",
    description: "Review trusted desktops",
    permission: "devices.read",
    icon: MonitorSmartphone,
  },
  {
    href: "/app/settings",
    label: "Settings",
    description: "Workspace business name",
    permission: "tenant.settings.read",
    icon: Settings,
  },
];

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [tenant, setTenant] = useState<TenantDto | null>(null);
  const [counts, setCounts] = useState<Counts>({
    users: null,
    roles: null,
    devices: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Counts = { users: null, roles: null, devices: null };
      if (hasPermission("tenant.settings.read")) {
        try {
          const t = await getCurrentTenant();
          if (!cancelled) setTenant(t);
        } catch {
          /* ignore — dashboard still useful */
        }
      }
      if (hasPermission("users.read")) {
        try {
          const users = await listUsers();
          next.users = users.length;
        } catch {
          next.users = null;
        }
      }
      if (hasPermission("roles.read")) {
        try {
          const roles = await listRoles();
          next.roles = roles.length;
        } catch {
          next.roles = null;
        }
      }
      if (hasPermission("devices.read")) {
        try {
          const devices = await listDevices();
          next.devices = devices.length;
        } catch {
          next.devices = null;
        }
      }
      if (!cancelled) setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  const actions = QUICK.filter((item) => hasPermission(item.permission));

  return (
    <div className="bb-page">
      <PageHeader
        title="Dashboard"
        description="Tenant administration for your Blackbox workspace. Point-of-sale and inventory live in the desktop app."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Workspace" className="md:col-span-2 xl:col-span-2">
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Business
              </p>
              <p className="font-display mt-1 text-xl font-semibold tracking-tight">
                {tenant?.name ?? "Your workspace"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tenant ? (
                <Badge variant={tenant.isActive ? "success" : "outline"}>
                  {tenant.isActive ? "Active" : "Inactive"}
                </Badge>
              ) : null}
              {tenant?.businessType ? (
                <Badge variant="secondary">{tenant.businessType}</Badge>
              ) : null}
              {tenant?.country ? (
                <Badge variant="outline">{tenant.country}</Badge>
              ) : null}
              {tenant?.currency ? (
                <Badge variant="outline">{tenant.currency}</Badge>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Signed in as">
          <div className="space-y-1">
            <p className="font-medium">{user?.fullName}</p>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
            <p className="text-muted-foreground font-mono text-xs">
              @{user?.username}
            </p>
            <p className="text-muted-foreground pt-2 text-xs">
              {user?.permissions.length ?? 0} effective permissions
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Users", value: counts.users, show: hasPermission("users.read") },
          { label: "Roles", value: counts.roles, show: hasPermission("roles.read") },
          {
            label: "Devices",
            value: counts.devices,
            show: hasPermission("devices.read"),
          },
        ]
          .filter((c) => c.show)
          .map((c) => (
            <div key={c.label} className="bb-surface px-5 py-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                {c.label}
              </p>
              <p className="font-display mt-1 text-3xl font-semibold tracking-tight">
                {c.value ?? "—"}
              </p>
            </div>
          ))}
      </div>

      <SectionCard
        title="Administration"
        description="Jump to a section you can manage with your current permissions."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.href}
                asChild
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3 text-left"
              >
                <Link href={item.href}>
                  <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.label}</span>
                    <span className="text-muted-foreground block text-xs font-normal">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </Button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
