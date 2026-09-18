"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Checkbox } from "@blackbox/ui/checkbox";
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
  const [requireRemoveApproval, setRequireRemoveApproval] = useState(true);
  const [requireTillOpenApproval, setRequireTillOpenApproval] = useState(true);
  const [requireTillWithdrawApproval, setRequireTillWithdrawApproval] =
    useState(true);
  const [defaultGstRate, setDefaultGstRate] = useState("0");
  const [defaultSalesTaxRate, setDefaultSalesTaxRate] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getCurrentTenant();
      setTenant(next);
      setRequireRemoveApproval(next.requireManagerApprovalRemoveSaleLine);
      setRequireTillOpenApproval(next.requireManagerApprovalTillOpen);
      setRequireTillWithdrawApproval(next.requireManagerApprovalTillWithdraw);
      setDefaultGstRate(String(next.defaultGstRate ?? 0));
      setDefaultSalesTaxRate(String(next.defaultSalesTaxRate ?? 0));
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
    if (!tenant) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    const form = new FormData(e.currentTarget);
    const nameField = form.get("name");
    const name =
      nameField != null && String(nameField).trim() !== ""
        ? String(nameField).trim()
        : tenant.name;
    try {
      const updated = await updateCurrentTenant({
        name,
        requireManagerApprovalRemoveSaleLine: requireRemoveApproval,
        requireManagerApprovalTillOpen: requireTillOpenApproval,
        requireManagerApprovalTillWithdraw: requireTillWithdrawApproval,
        defaultGstRate: Number(defaultGstRate) || 0,
        defaultSalesTaxRate: Number(defaultSalesTaxRate) || 0,
      });
      setTenant(updated);
      setRequireRemoveApproval(updated.requireManagerApprovalRemoveSaleLine);
      setRequireTillOpenApproval(updated.requireManagerApprovalTillOpen);
      setRequireTillWithdrawApproval(updated.requireManagerApprovalTillWithdraw);
      setDefaultGstRate(String(updated.defaultGstRate ?? 0));
      setDefaultSalesTaxRate(String(updated.defaultSalesTaxRate ?? 0));
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

            <SectionCard
              title="Tax rates"
              description="Default percentages applied to every POS sale subtotal. Cashiers cannot change these on the sale screen."
            >
              {hasPermission("tenant.settings.write") ? (
                <form className="space-y-4" onSubmit={(e) => void onSave(e)}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="defaultGstRate">GST %</Label>
                      <Input
                        id="defaultGstRate"
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={defaultGstRate}
                        onChange={(event) =>
                          setDefaultGstRate(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defaultSalesTaxRate">Sales tax %</Label>
                      <Input
                        id="defaultSalesTaxRate"
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={defaultSalesTaxRate}
                        onChange={(event) =>
                          setDefaultSalesTaxRate(event.target.value)
                        }
                      />
                    </div>
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
                    GST: {tenant.defaultGstRate ?? 0}%
                  </p>
                  <p>
                    Sales tax: {tenant.defaultSalesTaxRate ?? 0}%
                  </p>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Manager approval"
              description="Require manager or owner Authy on the POS before these actions."
            >
              {hasPermission("tenant.settings.write") ? (
                <form className="space-y-4" onSubmit={(e) => void onSave(e)}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="requireRemoveApproval"
                      checked={requireRemoveApproval}
                      onCheckedChange={(checked) =>
                        setRequireRemoveApproval(checked === true)
                      }
                    />
                    <div className="space-y-1">
                      <Label htmlFor="requireRemoveApproval" className="font-normal">
                        Remove item from bill
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        When enabled, cashiers must enter a valid manager Authy
                        code to remove a line from an in-progress sale.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="requireTillOpenApproval"
                      checked={requireTillOpenApproval}
                      onCheckedChange={(checked) =>
                        setRequireTillOpenApproval(checked === true)
                      }
                    />
                    <div className="space-y-1">
                      <Label htmlFor="requireTillOpenApproval" className="font-normal">
                        Open cashier till
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        When enabled, cashiers must enter a valid manager Authy
                        code before their till is opened for the day.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="requireTillWithdrawApproval"
                      checked={requireTillWithdrawApproval}
                      onCheckedChange={(checked) =>
                        setRequireTillWithdrawApproval(checked === true)
                      }
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="requireTillWithdrawApproval"
                        className="font-normal"
                      >
                        Collect cash from till
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        When enabled, managers must enter a valid manager Authy
                        code before collecting cash from a cashier till.
                      </p>
                    </div>
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
                    Remove item from bill:{" "}
                    {tenant.requireManagerApprovalRemoveSaleLine
                      ? "Manager approval required"
                      : "No approval required"}
                  </p>
                  <p>
                    Open cashier till:{" "}
                    {tenant.requireManagerApprovalTillOpen
                      ? "Manager approval required"
                      : "No approval required"}
                  </p>
                  <p>
                    Collect cash from till:{" "}
                    {tenant.requireManagerApprovalTillWithdraw
                      ? "Manager approval required"
                      : "No approval required"}
                  </p>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </RequirePermission>
  );
}
