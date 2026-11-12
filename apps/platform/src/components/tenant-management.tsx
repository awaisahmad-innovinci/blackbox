"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  emailError,
  liveEmailError,
  livePasswordError,
  livePersonNameError,
  liveUsernameError,
  personNameError,
  usernameError,
  type PlatformTenantSummary,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blackbox/ui/card";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import {
  PlatformApiError,
  clearPlatformToken,
  createTenant,
  getPlatformToken,
  listTenants,
  loginPlatform,
  resetOwnerPassword,
  setPlatformToken,
  setTenantActive,
} from "@/lib/api";

type IssuedCredentials = {
  name: string;
  fullName: string;
  email: string;
  username: string;
  password: string;
};

type CreateFields = {
  businessName: string;
  fullName: string;
  email: string;
  username: string;
  password: string;
};

const emptyCreate: CreateFields = {
  businessName: "",
  fullName: "",
  email: "",
  username: "",
  password: "",
};

export function TenantManagement() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [tenants, setTenants] = useState<PlatformTenantSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingPasswordId, setSavingPasswordId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const [passwordSaveError, setPasswordSaveError] = useState<string | null>(null);

  const [createFields, setCreateFields] = useState<CreateFields>(emptyCreate);
  const [createAttempted, setCreateAttempted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setListError(null);
    try {
      const rows = await listTenants(accessToken);
      setTenants(rows);
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 401) {
        clearPlatformToken();
        setToken(null);
        setLoginError("Session expired. Sign in again.");
        return;
      }
      setListError(err instanceof Error ? err.message : "Could not load tenants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getPlatformToken();
    setToken(stored);
    setReady(true);
    if (stored) {
      void load(stored);
    }
  }, [load]);

  async function onLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginPlatform(username.trim(), password);
      setPlatformToken(res.accessToken);
      setToken(res.accessToken);
      setPassword("");
      await load(res.accessToken);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Invalid credentials",
      );
    } finally {
      setLoggingIn(false);
    }
  }

  function signOut() {
    clearPlatformToken();
    setToken(null);
    setTenants([]);
    setIssued(null);
  }

  const nameErr = createAttempted
    ? personNameError(createFields.fullName)
    : livePersonNameError(createFields.fullName);
  const emailErr = createAttempted
    ? emailError(createFields.email)
    : liveEmailError(createFields.email);
  const usernameErr = createAttempted
    ? usernameError(createFields.username)
    : liveUsernameError(createFields.username);
  const passwordErr = createAttempted
    ? createFields.password.length < 8
      ? "Password must be at least 8 characters"
      : null
    : livePasswordError(createFields.password);
  const businessErr =
    createAttempted && !createFields.businessName.trim()
      ? "Business name is required"
      : null;

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setCreateAttempted(true);
    setCreateError(null);
    const businessName = createFields.businessName.trim();
    const fullName = createFields.fullName.trim();
    const email = createFields.email.trim();
    const ownerUsername = createFields.username.trim();
    const ownerPassword = createFields.password;
    if (
      !businessName ||
      personNameError(fullName) ||
      emailError(email) ||
      usernameError(ownerUsername) ||
      ownerPassword.length < 8
    ) {
      return;
    }
    setCreating(true);
    try {
      await createTenant(token, {
        businessName,
        fullName,
        email,
        username: ownerUsername,
        password: ownerPassword,
      });
      setIssued({
        name: businessName,
        fullName,
        email,
        username: ownerUsername,
        password: ownerPassword,
      });
      setCreateFields(emptyCreate);
      setCreateAttempted(false);
      await load(token);
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 401) {
        clearPlatformToken();
        setToken(null);
        setLoginError("Session expired. Sign in again.");
        return;
      }
      setCreateError(
        err instanceof Error ? err.message : "Could not create the tenant.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(tenant: PlatformTenantSummary) {
    if (!token) return;
    setBusyId(tenant.id);
    setListError(null);
    try {
      const updated = await setTenantActive(token, tenant.id, !tenant.isActive);
      setTenants((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 401) {
        clearPlatformToken();
        setToken(null);
        setLoginError("Session expired. Sign in again.");
        return;
      }
      setListError(
        err instanceof Error ? err.message : "Could not update the tenant.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function selectTenant(tenant: PlatformTenantSummary) {
    setSelectedId((current) => (current === tenant.id ? null : tenant.id));
    setOwnerPassword("");
    setPasswordAttempted(false);
    setPasswordSaveError(null);
  }

  const ownerPasswordErr = passwordAttempted
    ? ownerPassword.length < 8
      ? "Password must be at least 8 characters"
      : null
    : livePasswordError(ownerPassword);

  async function updateOwnerPassword(
    event: React.FormEvent<HTMLFormElement>,
    tenant: PlatformTenantSummary,
  ) {
    event.preventDefault();
    if (!token || !tenant.owner) return;
    setPasswordAttempted(true);
    setPasswordSaveError(null);
    if (ownerPassword.length < 8) return;
    setSavingPasswordId(tenant.id);
    try {
      const issuedPassword = await resetOwnerPassword(token, tenant.id, {
        password: ownerPassword,
      });
      setIssued({
        name: issuedPassword.businessName,
        fullName: issuedPassword.fullName,
        email: issuedPassword.email,
        username: issuedPassword.username,
        password: issuedPassword.password,
      });
      setOwnerPassword("");
      setPasswordAttempted(false);
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 401) {
        clearPlatformToken();
        setToken(null);
        setLoginError("Session expired. Sign in again.");
        return;
      }
      setPasswordSaveError(
        err instanceof Error ? err.message : "Could not update the password.",
      );
    } finally {
      setSavingPasswordId(null);
    }
  }

  if (!ready) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="bb-auth-canvas flex min-h-screen items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Tenant management
            </CardTitle>
            <CardDescription>
              Operator sign-in. Tenant workspaces are created here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => void onLogin(event)}>
              <div className="space-y-2">
                <Label htmlFor="operator-username">Username</Label>
                <Input
                  id="operator-username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operator-password">Password</Label>
                <Input
                  id="operator-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {loginError ? (
                <p className="text-destructive text-sm" role="alert">
                  {loginError}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bb-page px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Tenant management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create a workspace and give the owner these credentials. They sign
            in on the tenant site.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create tenant</CardTitle>
            <CardDescription>
              The owner uses this username or email on the tenant site.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => void onCreate(event)}>
              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  required
                  value={createFields.businessName}
                  aria-invalid={Boolean(businessErr)}
                  onChange={(event) =>
                    setCreateFields((fields) => ({
                      ...fields,
                      businessName: event.target.value,
                    }))
                  }
                />
                {businessErr ? (
                  <p className="text-destructive text-xs">{businessErr}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Owner name</Label>
                <Input
                  id="fullName"
                  required
                  value={createFields.fullName}
                  aria-invalid={Boolean(nameErr)}
                  onChange={(event) =>
                    setCreateFields((fields) => ({
                      ...fields,
                      fullName: event.target.value,
                    }))
                  }
                />
                {nameErr ? (
                  <p className="text-destructive text-xs">{nameErr}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-email">Email</Label>
                <Input
                  id="owner-email"
                  type="email"
                  required
                  value={createFields.email}
                  aria-invalid={Boolean(emailErr)}
                  onChange={(event) =>
                    setCreateFields((fields) => ({
                      ...fields,
                      email: event.target.value,
                    }))
                  }
                />
                {emailErr ? (
                  <p className="text-destructive text-xs">{emailErr}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-username">Username</Label>
                <Input
                  id="owner-username"
                  required
                  value={createFields.username}
                  aria-invalid={Boolean(usernameErr)}
                  onChange={(event) =>
                    setCreateFields((fields) => ({
                      ...fields,
                      username: event.target.value,
                    }))
                  }
                />
                {usernameErr ? (
                  <p className="text-destructive text-xs">{usernameErr}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-password">Password</Label>
                <Input
                  id="owner-password"
                  type="password"
                  required
                  minLength={8}
                  value={createFields.password}
                  aria-invalid={Boolean(passwordErr)}
                  onChange={(event) =>
                    setCreateFields((fields) => ({
                      ...fields,
                      password: event.target.value,
                    }))
                  }
                />
                {passwordErr ? (
                  <p className="text-destructive text-xs">{passwordErr}</p>
                ) : null}
              </div>
              {createError ? (
                <p className="text-destructive text-sm" role="alert">
                  {createError}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create tenant"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {issued ? (
            <Card>
              <CardHeader>
                <CardTitle>Credentials to give the tenant</CardTitle>
                <CardDescription>
                  Copy these credentials now. The password is not kept on this
                  page after you leave.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Business: </span>
                  {issued.name}
                </p>
                <p>
                  <span className="text-muted-foreground">Owner: </span>
                  {issued.fullName}
                </p>
                <p>
                  <span className="text-muted-foreground">Email: </span>
                  {issued.email}
                </p>
                <p>
                  <span className="text-muted-foreground">Username: </span>
                  {issued.username}
                </p>
                <p>
                  <span className="text-muted-foreground">Password: </span>
                  <span className="font-mono">{issued.password}</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = [
                      `Business: ${issued.name}`,
                      `Owner: ${issued.fullName}`,
                      `Email: ${issued.email}`,
                      `Username: ${issued.username}`,
                      `Password: ${issued.password}`,
                    ].join("\n");
                    void navigator.clipboard?.writeText(text);
                  }}
                >
                  Copy credentials
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Tenants</CardTitle>
              <CardDescription>
                Deactivated tenants cannot sign in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {listError ? (
                <p className="text-destructive mb-3 text-sm" role="alert">
                  {listError}
                </p>
              ) : null}
              {loading ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading tenants…
                </p>
              ) : tenants.length === 0 ? (
                <p className="text-muted-foreground text-sm">No tenants yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-muted-foreground border-b text-xs">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Business</th>
                        <th className="py-2 pr-3 font-medium">Owner</th>
                        <th className="py-2 pr-3 font-medium">Email</th>
                        <th className="py-2 pr-3 font-medium">Username</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => (
                        <Fragment key={tenant.id}>
                          <tr
                            className={`cursor-pointer border-b ${
                              selectedId === tenant.id ? "bg-muted/50" : ""
                            }`}
                            onClick={() => selectTenant(tenant)}
                          >
                            <td className="py-3 pr-3 font-medium">{tenant.name}</td>
                            <td className="py-3 pr-3">
                              {tenant.owner?.fullName ?? "—"}
                            </td>
                            <td className="py-3 pr-3">
                              {tenant.owner?.email ?? "—"}
                            </td>
                            <td className="py-3 pr-3">
                              {tenant.owner?.username ?? "—"}
                            </td>
                            <td className="py-3 pr-3">
                              {tenant.isActive ? "Active" : "Inactive"}
                            </td>
                            <td
                              className="py-3 text-right"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  busyId === tenant.id || savingPasswordId === tenant.id
                                }
                                onClick={() => void toggleActive(tenant)}
                              >
                                {tenant.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            </td>
                          </tr>
                          {selectedId === tenant.id ? (
                            <tr className="border-b">
                              <td className="px-1 py-3" colSpan={6}>
                                <form
                                  className="flex flex-wrap items-end gap-3"
                                  onSubmit={(event) =>
                                    void updateOwnerPassword(event, tenant)
                                  }
                                >
                                  <div className="min-w-56 flex-1 space-y-2">
                                    <Label htmlFor={`owner-password-${tenant.id}`}>
                                      New password
                                      {tenant.owner
                                        ? ` for ${tenant.owner.fullName}`
                                        : ""}
                                    </Label>
                                    <Input
                                      id={`owner-password-${tenant.id}`}
                                      type="password"
                                      autoComplete="new-password"
                                      minLength={8}
                                      value={ownerPassword}
                                      disabled={
                                        !tenant.owner ||
                                        busyId === tenant.id ||
                                        savingPasswordId === tenant.id
                                      }
                                      aria-invalid={Boolean(ownerPasswordErr)}
                                      onChange={(event) =>
                                        setOwnerPassword(event.target.value)
                                      }
                                    />
                                    {ownerPasswordErr ? (
                                      <p className="text-destructive text-xs">
                                        {ownerPasswordErr}
                                      </p>
                                    ) : null}
                                    {!tenant.owner ? (
                                      <p className="text-muted-foreground text-xs">
                                        This tenant has no owner account.
                                      </p>
                                    ) : null}
                                    {passwordSaveError ? (
                                      <p className="text-destructive text-xs" role="alert">
                                        {passwordSaveError}
                                      </p>
                                    ) : null}
                                  </div>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    disabled={
                                      !tenant.owner ||
                                      busyId === tenant.id ||
                                      savingPasswordId === tenant.id
                                    }
                                  >
                                    {savingPasswordId === tenant.id ? (
                                      <>
                                        <Loader2 className="size-4 animate-spin" />
                                        Updating…
                                      </>
                                    ) : (
                                      "Update password"
                                    )}
                                  </Button>
                                </form>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
