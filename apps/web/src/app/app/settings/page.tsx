"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { LoadingState, PageError } from "@/components/page-state";
import { ActiveBadge } from "@/components/status-badges";
import {
  FormError,
  FormSuccess,
  SectionCard,
} from "@/components/section-card";
import {
  getCurrentTenant,
  updateCurrentTenant,
  type TenantDto,
} from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";
import { Badge } from "@blackbox/ui/badge";

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const [tenant, setTenant] = useState<TenantDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenant(await getCurrentTenant());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    const form = new FormData(e.currentTarget);
    try {
      const updated = await updateCurrentTenant(String(form.get("name") ?? ""));
      setTenant(updated);
      setSuccess("Settings saved.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequirePermission permissions={["tenant.settings.read"]}>
      <div className="bb-page-narrow">
        <PageHeader
          title="Settings"
          description="Workspace business information for this tenant."
        />

        {loading ? <LoadingState /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {tenant && !loading ? (
          <>
            <FormSuccess>{success}</FormSuccess>
            <FormError>{formError}</FormError>

            <SectionCard
              title="Workspace"
              description="Business identity shown across the admin experience."
            >
              {hasPermission("tenant.settings.write") ? (
                <form className="space-y-4" onSubmit={(e) => void onSave(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Business name</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={tenant.name}
                      required
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActiveBadge active={tenant.isActive} />
                    {tenant.businessType ? (
                      <Badge variant="secondary">{tenant.businessType}</Badge>
                    ) : null}
                    {tenant.country ? (
                      <Badge variant="outline">{tenant.country}</Badge>
                    ) : null}
                    {tenant.currency ? (
                      <Badge variant="outline">{tenant.currency}</Badge>
                    ) : null}
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
                <div className="space-y-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Business name:</span>{" "}
                    {tenant.name}
                  </p>
                  <ActiveBadge active={tenant.isActive} />
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </RequirePermission>
  );
}
