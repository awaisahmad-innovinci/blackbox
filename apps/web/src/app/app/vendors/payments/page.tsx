"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  expenseExceedsDrawer,
  expenseOverDrawerMessage,
  roundMoney4,
  type VendorCreditLedger,
  type VendorPaymentListItem,
  type VendorPaymentMethod,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import {
  DataTable,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@blackbox/ui/data-table";
import { PageHeader } from "@/components/page-header";
import { LoadingState, PageError } from "@/components/page-state";
import { RequirePermission } from "@/components/require-permission";
import { SectionCard } from "@/components/section-card";
import { toUserFacingError } from "@/lib/api-error";
import {
  getOwnerOverview,
  listVendorCredits,
  listVendorPayments,
  recordVendorPayment,
} from "@/lib/admin-api";
import { useCurrency } from "@/lib/use-currency";
import { NativeSelect } from "@blackbox/ui/native-select";



const PAYMENTS_PAGE_SIZE = 20;

function methodLabel(method: VendorPaymentMethod | null): string {
  if (method === "CASH") return "Cash";
  if (method === "BANK") return "Bank transfer";
  return "—";
}

export default function VendorPaymentsPage() {
  return (
    <RequirePermission permissions={["vendors.access"]}>
      <VendorPayments />
    </RequirePermission>
  );
}

function VendorPayments() {
  const { money } = useCurrency();
  const [credits, setCredits] = useState<VendorCreditLedger | null>(null);
  const [payments, setPayments] = useState<VendorPaymentListItem[]>([]);
  const [ownerCash, setOwnerCash] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [vendorId, setVendorId] = useState("");
  const [method, setMethod] = useState<VendorPaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [creditRows, paymentRows, overview] = await Promise.all([
        listVendorCredits(),
        listVendorPayments(paymentsPage, PAYMENTS_PAGE_SIZE),
        getOwnerOverview(),
      ]);
      setCredits(creditRows);
      setPayments(paymentRows.items);
      setPaymentsTotal(paymentRows.total);
      setOwnerCash(overview.ownerCashBalance);
      setVendorId((current) => {
        if (current && creditRows.vendors.some((row) => row.vendorId === current)) {
          return current;
        }
        return (
          creditRows.vendors.find((row) => row.credit > 0)?.vendorId ??
          creditRows.vendors[0]?.vendorId ??
          ""
        );
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [paymentsPage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPay(event: FormEvent) {
    event.preventDefault();
    const parsed = roundMoney4(Number(amount));
    const vendor = credits?.vendors.find((row) => row.vendorId === vendorId);
    if (!vendor || !(parsed > 0) || paying) return;
    if (parsed > vendor.credit) {
      setPayError(`Payment cannot exceed vendor credit (${money(vendor.credit)})`);
      return;
    }
    const transactionId = reference.trim();
    if (method === "BANK" && !transactionId) {
      setPayError("Enter the transaction id");
      return;
    }
    if (
      method === "CASH" &&
      ownerCash != null &&
      expenseExceedsDrawer(parsed, ownerCash)
    ) {
      setPayError(expenseOverDrawerMessage(ownerCash));
      return;
    }
    setPaying(true);
    setPayError(null);
    try {
      await recordVendorPayment(vendor.vendorId, {
        amount: parsed,
        method,
        referenceNumber: method === "BANK" ? transactionId : undefined,
        note: note.trim() || undefined,
      });
      setAmount("");
      setReference("");
      setNote("");
      await load();
    } catch (err) {
      setPayError(toUserFacingError(err));
    } finally {
      setPaying(false);
    }
  }

  if (loading && !credits) return <LoadingState label="Loading vendor payments" />;
  if (error && !credits) return <PageError error={error} onRetry={() => void load()} />;

  const selected = credits?.vendors.find((row) => row.vendorId === vendorId);

  return (
    <div className="bb-page">
      <PageHeader
        title="Vendor payments"
        description="What this business still owes each vendor, and payments from the owner drawer."
      />

      <SectionCard
        title="Pay a vendor"
        description={
          method === "CASH"
            ? `Cash comes out of the owner drawer. Maximum ${money(ownerCash ?? 0)}.`
            : "A bank transfer does not change the owner drawer. Enter the transaction id."
        }
      >
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void onPay(event)}>
          <Label className="grid gap-1 text-sm" htmlFor="vendor-pay-vendor">
            Vendor
            <NativeSelect
              id="vendor-pay-vendor"
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
            >
              {(credits?.vendors.length ?? 0) === 0 ? (
                <option value="">No vendors</option>
              ) : null}
              {credits?.vendors.map((row) => (
                <option key={row.vendorId} value={row.vendorId}>
                  {row.vendorName || "Vendor"} · {money(row.credit)}
                </option>
              ))}
            </NativeSelect>
          </Label>
          <Label className="grid gap-1 text-sm" htmlFor="vendor-pay-method">
            Method
            <NativeSelect
              id="vendor-pay-method"
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as VendorPaymentMethod)
              }
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank transfer</option>
            </NativeSelect>
          </Label>
          {method === "BANK" ? (
            <Label className="grid gap-1 text-sm" htmlFor="vendor-pay-reference">
              Transaction id
              <Input
                id="vendor-pay-reference"
                className="w-40"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </Label>
          ) : null}
          <Label className="grid gap-1 text-sm" htmlFor="vendor-pay-amount">
            Amount
            <Input
              id="vendor-pay-amount"
              inputMode="decimal"
              className="w-36"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Label>
          <Label className="grid gap-1 text-sm" htmlFor="vendor-pay-note">
            Note
            <Input
              id="vendor-pay-note"
              className="w-48"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Label>
          <Button
            type="submit"
            disabled={paying || !vendorId || !(Number(amount) > 0)}
          >
            {paying ? "Paying…" : "Record payment"}
          </Button>
          {payError ? (
            <p className="text-destructive w-full text-sm" role="alert">
              {payError}
            </p>
          ) : selected ? (
            <p className="text-muted-foreground w-full text-xs">
              Owed to {selected.vendorName || "this vendor"}: {money(selected.credit)}.
            </p>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard
        title="Amounts owed"
        description={`Total owed ${money(credits?.totalCredit ?? 0)}.`}
      >
        <DataTable>
          <Table>
            <THead>
              <Tr>
                <Th>Vendor</Th>
                <Th>Charges</Th>
                <Th>Payments</Th>
                <Th>Credit</Th>
              </Tr>
            </THead>
            <TBody>
              {(credits?.vendors.length ?? 0) === 0 ? (
                <Tr>
                  <Td colSpan={4} className="text-muted-foreground py-6 text-center">
                    No vendor credit yet.
                  </Td>
                </Tr>
              ) : (
                credits?.vendors.map((row) => (
                  <Tr key={row.vendorId}>
                    <Td>{row.vendorName || "Vendor"}</Td>
                    <Td className="tabular-nums">{money(row.charges)}</Td>
                    <Td className="tabular-nums">{money(row.payments)}</Td>
                    <Td className="tabular-nums">{money(row.credit)}</Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </DataTable>
      </SectionCard>

      <SectionCard title="Payments">
        <DataTable>
          <Table>
            <THead>
              <Tr>
                <Th>When</Th>
                <Th>Vendor</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th>Note</Th>
              </Tr>
            </THead>
            <TBody>
              {payments.length === 0 ? (
                <Tr>
                  <Td colSpan={6} className="text-muted-foreground py-6 text-center">
                    No vendor payments yet.
                  </Td>
                </Tr>
              ) : (
                payments.map((row) => (
                  <Tr key={row.id}>
                    <Td className="tabular-nums">
                      {new Date(row.occurredAt).toLocaleString()}
                    </Td>
                    <Td>{row.vendorName || "Vendor"}</Td>
                    <Td className="tabular-nums">{money(row.amount)}</Td>
                    <Td>{methodLabel(row.paymentMethod)}</Td>
                    <Td>{row.referenceNumber || "—"}</Td>
                    <Td>{row.note || "—"}</Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </DataTable>
        {paymentsTotal > PAYMENTS_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              Page {paymentsPage} of {Math.ceil(paymentsTotal / PAYMENTS_PAGE_SIZE)} ({paymentsTotal} payments)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={paymentsPage <= 1 || loading}
                onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={paymentsPage >= Math.ceil(paymentsTotal / PAYMENTS_PAGE_SIZE) || loading}
                onClick={() => setPaymentsPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
