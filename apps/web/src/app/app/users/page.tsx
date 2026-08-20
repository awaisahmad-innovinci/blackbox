"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@blackbox/ui/alert";
import { Badge } from "@blackbox/ui/badge";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { PasswordInput } from "@/components/password-input";
import { RoleChecklist } from "@/components/role-checklist";
import { EmptyState, PageError, TableSkeleton } from "@/components/page-state";
import {
  DataTable,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/data-table";
import { ActiveBadge } from "@/components/status-badges";
import { FieldHint, FieldStatus, FormError } from "@/components/section-card";
import {
  createUser,
  listRoles,
  listUsers,
  type RoleDto,
  type UserDto,
} from "@/lib/admin-api";
import { toCreateUserFacingError } from "@/lib/api-error";
import {
  emailError,
  liveEmailError,
  livePasswordError,
  livePersonNameError,
  liveUsernameError,
  personNameError,
  usernameError,
} from "@blackbox/shared";

const emptyCreate = {
  fullName: "",
  username: "",
  email: "",
  password: "",
};

export default function UsersPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("users.write");
  const [users, setUsers] = useState<UserDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState(emptyCreate);
  const [createAttempted, setCreateAttempted] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const roleById = useMemo(() => {
    const map = new Map<string, RoleDto>();
    for (const role of roles) {
      map.set(role.id, role);
    }
    return map;
  }, [roles]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, r] = await Promise.all([
        listUsers(),
        listRoles().catch(() => [] as RoleDto[]),
      ]);
      setUsers(u);
      setRoles(r);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => fullNameRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
    );
  }, [users, query]);

  const createNameErr = createAttempted
    ? personNameError(createDraft.fullName)
    : livePersonNameError(createDraft.fullName);
  const createUsernameErr = createAttempted
    ? usernameError(createDraft.username)
    : liveUsernameError(createDraft.username);
  const createEmailErr = createAttempted
    ? emailError(createDraft.email)
    : liveEmailError(createDraft.email);
  const createPasswordErr = createAttempted
    ? createDraft.password.length < 8
      ? "Password must be at least 8 characters"
      : null
    : livePasswordError(createDraft.password);

  function openCreateDialog() {
    setSuccess(null);
    setFormError(null);
    setCreateDraft(emptyCreate);
    setCreateAttempted(false);
    setSelectedRoles([]);
    setRolesLoading(roles.length === 0);
    setOpen(true);
    if (roles.length === 0) {
      void (async () => {
        try {
          setRoles(await listRoles());
        } catch {
          /* create still works without roles list */
        } finally {
          setRolesLoading(false);
        }
      })();
    }
  }

  function closeCreateDialog(restoreFocus = true) {
    setOpen(false);
    setFormError(null);
    setSelectedRoles([]);
    setCreateDraft(emptyCreate);
    setCreateAttempted(false);
    formRef.current?.reset();
    if (restoreFocus) {
      window.setTimeout(() => createButtonRef.current?.focus(), 50);
    }
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    const fullName = createDraft.fullName.trim();
    const email = createDraft.email.trim().toLowerCase();
    const username = createDraft.username.trim();
    const password = createDraft.password;

    setCreateAttempted(true);
    const nameErr = personNameError(fullName);
    const mailErr = emailError(email);
    const userErr = usernameError(username);
    if (nameErr || mailErr || userErr || password.length < 8) {
      return;
    }

    setSaving(true);
    try {
      await createUser({
        email,
        username,
        fullName,
        password,
        ...(selectedRoles.length > 0 ? { roleIds: selectedRoles } : {}),
      });
      closeCreateDialog(true);
      setSuccess("User created successfully.");
      await load();
    } catch (err) {
      setFormError(toCreateUserFacingError(err, { email, username }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequirePermission permissions={["users.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Users"
          description="Manage people who have access to this workspace. Create credentials they can use to sign in on desktop."
          actions={
            canWrite ? (
              <Button ref={createButtonRef} onClick={openCreateDialog}>
                <Plus className="size-4" />
                Create user
              </Button>
            ) : null
          }
        />

        {success ? (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? <TableSkeleton /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {!loading && !error && users.length === 0 ? (
          <EmptyState
            title="No users yet"
            message="Create your first user to start managing access to this workspace."
            action={
              canWrite ? (
                <Button onClick={openCreateDialog}>
                  <Plus className="size-4" />
                  Create user
                </Button>
              ) : null
            }
          />
        ) : null}

        {!loading && !error && users.length > 0 ? (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, username"
                className="pl-9"
                aria-label="Search users"
              />
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                title="No matches"
                message="Try a different search term."
              />
            ) : (
              <DataTable>
                <Table>
                  <THead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Username</Th>
                      <Th>Email</Th>
                      <Th>Roles</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {filtered.map((u) => {
                      const userRoles = u.roleIds
                        .map((id) => roleById.get(id))
                        .filter((r): r is RoleDto => Boolean(r));
                      return (
                        <Tr key={u.id}>
                          <Td className="font-medium">{u.fullName}</Td>
                          <Td className="text-muted-foreground font-mono text-xs">
                            {u.username}
                          </Td>
                          <Td>{u.email}</Td>
                          <Td>
                            <div className="flex max-w-[14rem] flex-wrap gap-1">
                              {userRoles.length === 0 ? (
                                <span className="text-muted-foreground text-xs">
                                  —
                                </span>
                              ) : (
                                userRoles.slice(0, 3).map((role) => (
                                  <Badge
                                    key={role.id}
                                    variant="secondary"
                                    className="max-w-[7rem] truncate"
                                  >
                                    {role.name}
                                  </Badge>
                                ))
                              )}
                              {userRoles.length > 3 ? (
                                <Badge variant="outline">
                                  +{userRoles.length - 3}
                                </Badge>
                              ) : null}
                            </div>
                          </Td>
                          <Td>
                            <ActiveBadge active={u.isActive} />
                          </Td>
                          <Td className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/app/users/${u.id}`}>
                                {canWrite ? "Edit" : "View"}
                              </Link>
                            </Button>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              </DataTable>
            )}
          </div>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            if (!saving) closeCreateDialog(true);
            return;
          }
          setOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>
              Add a user to this workspace and assign their access. They can
              sign in later with these credentials on desktop.
            </DialogDescription>
          </DialogHeader>
          <form
            ref={formRef}
            className="space-y-4"
            onSubmit={(e) => void onCreate(e)}
          >
            <fieldset disabled={saving} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-fullName">Full name</Label>
                <Input
                  ref={fullNameRef}
                  id="create-fullName"
                  name="fullName"
                  required
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={createDraft.fullName}
                  aria-invalid={Boolean(createNameErr)}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, fullName: e.target.value }))
                  }
                />
                <FieldStatus
                  error={createNameErr}
                  hint="Letters only, with spaces between words."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-username">Username</Label>
                <Input
                  id="create-username"
                  name="username"
                  required
                  minLength={3}
                  autoComplete="username"
                  placeholder="alex"
                  title="Letters, numbers, and special characters. No spaces."
                  value={createDraft.username}
                  aria-invalid={Boolean(createUsernameErr)}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, username: e.target.value }))
                  }
                />
                <FieldStatus
                  error={createUsernameErr}
                  hint="Letters, numbers, and special characters. No spaces. Min 3 characters."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="alex@business.com"
                  value={createDraft.email}
                  aria-invalid={Boolean(createEmailErr)}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, email: e.target.value }))
                  }
                />
                <FieldStatus error={createEmailErr} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Password</Label>
                <PasswordInput
                  id="create-password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={createDraft.password}
                  aria-invalid={Boolean(createPasswordErr)}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, password: e.target.value }))
                  }
                />
                <FieldStatus
                  error={createPasswordErr}
                  hint="Minimum 8 characters. Share securely — not stored in the browser after create."
                />
              </div>
              <div className="space-y-2">
                <Label>Roles</Label>
                <RoleChecklist
                  roles={roles}
                  selectedIds={selectedRoles}
                  onChange={setSelectedRoles}
                  disabled={saving}
                  loading={rolesLoading}
                />
                <FieldHint>
                  Optional. Assign one or more roles, or leave empty and edit
                  later.
                </FieldHint>
              </div>
            </fieldset>
            <FormError>{formError}</FormError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => closeCreateDialog(true)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating user…
                  </>
                ) : (
                  "Create user"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  );
}
