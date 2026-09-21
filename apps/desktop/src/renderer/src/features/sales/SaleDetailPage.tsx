import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { SaleDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { useConfirm } from "@renderer/components/confirm-provider";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { salesApi } from "@renderer/lib/api/sales";
import { loadSale } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import { SaleThermalReceipt } from "./sale-thermal-receipt";
import { useSession } from "@renderer/lib/session/context";

export function SaleDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useSession();
  const permissions = user?.permissions ?? [];
  const { canReadList, canVoid, canWrite } = useSalesAccess();
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!canReadList && !canWrite) {
      navigate(defaultRouteForUser(permissions), { replace: true });
    }
  }, [canReadList, canWrite, navigate, permissions]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadSale(id)
      .then((row) => {
        if (!cancelled) {
          setDetail(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Sale not found"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onDiscardDraft() {
    if (!detail || detail.status !== "DRAFT") return;
    const ok = await confirm({
      title: "Discard held bill?",
      description: `${detail.saleNumber} will be removed from this device.`,
      confirmLabel: "Discard",
    });
    if (!ok) return;

    setDiscarding(true);
    setError(null);
    try {
      const result = await window.blackbox?.localDb?.deleteSaleDraft?.(detail.id);
      if (!result?.ok) {
        setError("Held bill not found or already removed");
        return;
      }
      navigate("/sales/held");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to discard held bill"));
    } finally {
      setDiscarding(false);
    }
  }

  async function onVoid() {
    if (!detail || detail.status !== "POSTED") return;
    setVoiding(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const now = new Date().toISOString();
        const voided: SaleDetail = {
          ...detail,
          status: "VOID",
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "sale",
          entityId: detail.id,
          operation: "UPSERT",
          payload: voided as unknown as Record<string, unknown>,
        });
        void syncNow();
        setDetail(voided);
        return;
      }

      const voided = await salesApi.void(detail.id);
      try {
        await window.blackbox?.localDb?.upsertSale?.(voided);
      } catch {
        /* optional cache */
      }
      setDetail(voided);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to void sale"));
    } finally {
      setVoiding(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading sale…</p>;
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">{error ?? "Sale not found"}</p>
        <Button variant="outline" onClick={() => navigate("/sales")}>
          Back to sales
        </Button>
      </div>
    );
  }

  const isDraft = detail.status === "DRAFT";

  return (
    <div className="space-y-6">
      <div className="print:hidden space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {detail.saleNumber}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {detail.warehouseName} · {isDraft ? "Held" : detail.status}
            </p>
          </div>
          <div className="flex gap-2">
            {!isDraft ? <PrintButton /> : null}
            {isDraft && canWrite ? (
              <>
                <Button onClick={() => navigate(`/sales/new/${detail.id}`)}>
                  Resume
                </Button>
                <Button
                  variant="destructive"
                  disabled={discarding}
                  onClick={() => void onDiscardDraft()}
                >
                  {discarding ? "Discarding…" : "Discard"}
                </Button>
              </>
            ) : null}
            {canVoid && detail.status === "POSTED" ? (
              <Button
                variant="destructive"
                disabled={voiding}
                onClick={() => void onVoid()}
              >
                {voiding ? "Voiding…" : "Void sale"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => navigate(isDraft ? "/sales/held" : "/sales")}
            >
              Back to list
            </Button>
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {isDraft ? (
          <p className="text-muted-foreground text-sm">
            This bill is held on this device only. Stock is reserved until you post
            or discard it.
          </p>
        ) : null}
      </div>
      {!isDraft ? (
        <PrintDocument showStoreHeader={false}>
          <SaleThermalReceipt
            detail={detail}
            businessName={user?.tenantName?.trim() ?? ""}
            businessAddress={user?.businessAddress}
            cashierName={
              detail.postedByName?.trim() || user?.fullName?.trim() || "—"
            }
          />
        </PrintDocument>
      ) : null}
    </div>
  );
}
