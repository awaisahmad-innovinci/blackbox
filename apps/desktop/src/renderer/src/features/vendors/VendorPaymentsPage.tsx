import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@blackbox/ui/button";
import type {
  VendorCreditLedger,
  VendorListItem,
  VendorPaymentListItem,
} from "@blackbox/shared";
import { Input } from "@blackbox/ui/input";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import {
  KEYBOARD_HINT_LIST_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import {
  FILTER_SELECT_CLASS,
  filterSelectProps,
  ListFilterNav,
} from "@renderer/components/list-filter-nav";
import {
  loadVendorCredits,
  loadVendorPayments,
  loadVendors,
} from "@renderer/lib/local-db/entity-source";
import {
  barcodeScanInputProps,
  useBarcodeScanTarget,
} from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";
import { useSession } from "@renderer/lib/session/context";
import {
  VendorPaymentReceipt,
  type VendorPaymentReceiptData,
} from "./VendorPaymentReceipt";

export function VendorPaymentsPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [printReceipt, setPrintReceipt] =
    useState<VendorPaymentReceiptData | null>(null);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [search, setSearch] = useState("");
  const [credits, setCredits] = useState<VendorCreditLedger | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [items, setItems] = useState<VendorPaymentListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useBarcodeScanTarget({
    kind: "search",
    enabled: true,
    inputRef: searchRef,
    onScan: setSearch,
  });

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    void loadVendors({ status: "active", pageSize: 100 })
      .then((r) => setVendors(r.items))
      .catch(() => undefined);
  }, []);

  useResetPageOnFilterChange(setPage, [vendorId, search]);

  useEffect(() => {
    let cancelled = false;
    setCreditsLoading(true);
    void loadVendorCredits({ vendorId: vendorId || undefined })
      .then((res) => {
        if (!cancelled) {
          setCredits(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load vendor credit"));
        }
      })
      .finally(() => {
        if (!cancelled) setCreditsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      void loadVendorPayments({
        vendorId: vendorId || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      })
        .then((res) => {
          if (!cancelled) {
            setItems(res.items);
            setTotal(res.total);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getApiErrorMessage(err, "Failed to load vendor payments"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [vendorId, search, page, pageSize]);

  if (printReceipt) {
    return (
      <VendorPaymentReceipt
        receipt={printReceipt}
        onDone={() => setPrintReceipt(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Vendor Payments
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Each payment recorded against a vendor, including cash paid when a
          purchase was received.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <ListFilterNav>
        <Input
          ref={searchRef}
          {...barcodeScanInputProps()}
          className="max-w-xs"
          placeholder="Vendor, receipt, or note"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={FILTER_SELECT_CLASS}
          {...filterSelectProps()}
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        >
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </ListFilterNav>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-medium">Vendor credit</h2>
          <p className="text-sm">
            Total owed:{" "}
            <span className="tabular-nums font-medium">
              {creditsLoading
                ? "…"
                : (credits?.totalCredit ?? 0).toLocaleString()}
            </span>
          </p>
        </div>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Charges</th>
                <th className="px-4 py-3 font-medium">Payments</th>
                <th className="px-4 py-3 font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {creditsLoading ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-4 py-6">
                    Loading…
                  </td>
                </tr>
              ) : (credits?.vendors.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-4 py-6">
                    No vendor credit yet.
                  </td>
                </tr>
              ) : (
                credits?.vendors.map((row) => (
                  <ListTableRow
                    key={row.vendorId}
                    onActivate={() => navigate(`/vendors/${row.vendorId}`)}
                  >
                    <td className="px-4 py-3">
                      <ListTableLink
                        to={`/vendors/${row.vendorId}`}
                        className="text-primary hover:underline"
                      >
                        {row.vendorName || "Vendor"}
                      </ListTableLink>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.charges.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.payments.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.credit.toLocaleString()}</td>
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Payments</h2>
      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Receipt</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="no-print px-4 py-3 font-medium">Print</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-6">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-6">
                  No vendor payments found.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <ListTableRow
                  key={row.id}
                  onActivate={() => navigate(`/vendors/${row.vendorId}`)}
                >
                  <td className="px-4 py-3 tabular-nums">
                    {new Date(row.occurredAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <ListTableLink
                      to={`/vendors/${row.vendorId}`}
                      className="text-primary hover:underline"
                    >
                      {row.vendorName || "Vendor"}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{row.receiptNumber || "—"}</td>
                  <td className="px-4 py-3">{row.note || "—"}</td>
                  <td className="no-print px-4 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPrintReceipt({
                          vendorName: row.vendorName,
                          amount: row.amount,
                          note: row.note,
                          occurredAt: row.occurredAt,
                          paidBy: user?.fullName || user?.username || "",
                        })
                      }
                    >
                      Print
                    </Button>
                  </td>
                </ListTableRow>
              ))
            )}
          </tbody>
        </table>
      </div>
      </section>

      <ListPagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
      <KeyboardHints hints={[KEYBOARD_HINT_LIST_ROWS]} />
    </div>
  );
}
