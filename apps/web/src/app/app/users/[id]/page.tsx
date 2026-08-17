"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { PasswordInput } from "@/components/password-input";
import { RoleChecklist } from "@/components/role-checklist";
import { LoadingState, PageError } from "@/components/page-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActiveBadge } from "@/components/status-badges";
import {
  FieldHint,
  FormError,
  FormSuccess,
  SectionCard,
} from "@/components/section-card";
import {
  deactivateUser,
  getUser,
  listRoles,
  replaceUserRoles,
  updateUser,
  type RoleDto,
  type UserDto,
} from "@/lib/admin-api";
import { toCreateUserFacingError, toUserFacingError } from "@/lib/api-error";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [user, setUser] = useState<UserDto | null>(null);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, r] = await Promise.all([
        getUser(params.id),
        listRoles().catch(() => [] as RoleDto[]),
      ]);
      setUser(u);
      setRoles(r);
      setSelectedRoles(u.roleIds);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    try {
      const updated = await updateUser(user.id, {
        fullName: String(form.get("fullName") ?? ""),
        email: String(form.get("email") ?? ""),
        username: String(form.get("username") ?? ""),
        ...(password ? { password } : {}),
      });
      setUser(updated);
      setSuccess("Profile saved.");
    } catch (err) {
      setFormError(toCreateUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveRoles() {
    if (!user) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await replaceUserRoles(user.id, selectedRoles);
      setUser(updated);
      setSelectedRoles(updated.roleIds);
      setSuccess("Roles updated.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDeactivate() {
    if (!user) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await deactivateUser(user.id);
      setUser(updated);
      setConfirmOpen(false);
      setSuccess("User deactivated.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequirePermission permissions={["users.read"]}>
      <div className="bb-page-narrow">
        <PageHeader
          breadcrumb={
            <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
              <Link href="/app/users">
                <ArrowLeft className="size-3.5" />
                Users
              </Link>
            </Button>
          }
          title={user?.fullName ?? "User"}
          description={user ? `@${user.username} · ${user.email}` : undefined}
          actions={user ? <ActiveBadge active={user.isActive} /> : null}
        />

        {loading ? <LoadingState /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {user && !loading ? (
          <>
            <FormSuccess>{success}</FormSuccess>
            <FormError>{formError}</FormError>

            <SectionCard
              title="Profile"
              description="Account identity for this workspace."
            >
              {hasPermission("users.write") ? (
                <form className="space-y-4" onSubmit={(e) => void onSaveProfile(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      defaultValue={user.fullName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={user.email}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      name="username"
                      defaultValue={user.username}
                      required
                      minLength={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <PasswordInput
                      id="password"
                      name="password"
                      minLength={8}
                      placeholder="Leave blank to keep current"
                    />
                    <FieldHint>Optional. Minimum 8 characters if set.</FieldHint>
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </form>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {user.email}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Username:</span>{" "}
                    {user.username}
                  </p>
                </div>
              )}
            </SectionCard>

            {hasPermission("users.write") ? (
              <SectionCard
                title="Roles"
                description="Roles grant permission keys. Authorization uses permissions, not role names."
                footer={
                  <Button disabled={busy} onClick={() => void onSaveRoles()}>
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving roles…
                      </>
                    ) : (
                      "Save roles"
                    )}
                  </Button>
                }
              >
                <RoleChecklist
                  roles={roles}
                  selectedIds={selectedRoles}
                  onChange={setSelectedRoles}
                  disabled={busy}
                />
              </SectionCard>
            ) : user.roleIds.length > 0 ? (
              <SectionCard title="Roles" description="Assigned roles (read-only).">
                <RoleChecklist
                  roles={roles.filter((r) => user.roleIds.includes(r.id))}
                  selectedIds={user.roleIds}
                  onChange={() => undefined}
                  disabled
                />
              </SectionCard>
            ) : null}

            {hasPermission("users.deactivate") && user.isActive ? (
              <SectionCard
                title="Danger zone"
                description="Deactivating prevents this user from signing in."
              >
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  Deactivate user
                </Button>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Deactivate user?"
        description="This user will no longer be able to sign in to this workspace."
        confirmLabel="Deactivate user"
        destructive
        loading={busy}
        onConfirm={onDeactivate}
      />
    </RequirePermission>
  );
}
